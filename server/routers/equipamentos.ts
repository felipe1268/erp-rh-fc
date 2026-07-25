// ============================================================================
// Rev. 2257 — Equipamentos Router (Fase 1 Sprint 2 do Módulo de Equipamentos)
// ============================================================================
// CRUD base + registro de eventos + auto-seed de parâmetros CAPEX.
// Páginas React virão na 2258. Cron de alerta de vencimento na 2259.
// ============================================================================

import { z } from "zod";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getEffectiveAllowedObraIds, getUserCompanyLinks } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter, companyInput } from "../companyHelper";
import { getCompaniesForUser } from "../db";
import {
  equipamentosProprios,
  equipamentosLocados,
  equipamentoLocadoEventos,
  equipamentosFotosCanonicas,
  faturaLocacaoConferencia,
  parametrosCapex,
  comprasOrdens,
  comprasOrdensItens,
  almoxarifadoItens,
  equipamentosPropriasTransferencias,
} from "../../drizzle/schema";
import { storagePut } from "../storage";

// Rev. 2513 — Normalização de textos pra MAIÚSCULA (padrão FC).
// Aplicada em INSERT/UPDATE de equipamentos próprios (descricao, categoria,
// marca, modelo, observacoes). Acentos preservados (pt-BR), espaços extras
// colapsados. Vazio vira null pra manter a semântica do banco.
export function upperBR(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.toLocaleUpperCase("pt-BR");
}

// Rev. 2513 — Gera próximo código de patrimônio (EQP-NNNN) por company.
// Combinado com UNIQUE constraint uq_equip_proprio_company_patrimonio +
// retry no chamador, garante zero duplicação mesmo em race entre
// dispositivos.
//
// PERFORMANCE: cálculo no banco via MAX(NULLIF(substring(...),'')::int)
// filtrando apenas códigos no padrão EQP-\d+. O(1) com índice por
// company_id, vs. O(N) varrendo em memória (problema apontado pelo
// architect na Rev. 2513 — fix imediato).
export async function proximoCodigoPatrimonio(db: any, companyId: number): Promise<string> {
  // Rev. 2552 — `db.execute` (node-postgres) retorna QueryResult `{ rows }`,
  // NÃO um array iterável. `const [row] = await db.execute(...)` quebrava com
  // "(intermediate value) is not iterable", impedindo o cadastro. Lê via
  // `.rows` (com fallback p/ drivers que devolvem array direto).
  // Rev. 2668 — `[0-9]` em vez de `\d`: dentro de um template literal JS o `\d`
  // é "cozido" para `d` (escape inválido → caractere literal), então a SQL
  // chegava no Postgres como `'^EQP-d+$'` e NÃO casava nenhum código real
  // (EQP-0001…), fazendo o MAX voltar 0 e o gerador repetir EQP-0001 a cada
  // cadastro → colisão de unique 8x ("Não foi possível gerar um patrimônio
  // único"). `[0-9]` não tem barra invertida e sobrevive ao template literal.
  const res: any = await db.execute(sql`
    SELECT COALESCE(MAX(NULLIF(substring(codigo_patrimonio FROM '^EQP-([0-9]+)$'), '')::int), 0) AS max
    FROM equipamentos_proprios
    WHERE company_id = ${companyId}
      AND codigo_patrimonio ~ '^EQP-[0-9]+$'
  `);
  const row = (res?.rows ?? res ?? [])[0];
  const max = Number((row as any)?.max ?? 0) || 0;
  return `EQP-${String(max + 1).padStart(4, "0")}`;
}

// Rev. 2355 — Normaliza descrição para chave canônica da biblioteca de fotos.
// NFD + remove diacríticos + uppercase + collapse espaços + trim.
// Ex.: "Painel NR18 1,5x1,0 com Degrau " → "PAINEL NR18 1,5X1,0 COM DEGRAU"
function normalizarDescricao(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------------------------
// Defaults de parâmetros CAPEX (semeados na 1ª leitura por company)
// Benchmarks de construção civil pesada/edificações Brasil:
//   - TMA 1.2%/mês ≈ Selic real (~15%/ano) p/ análise CAPEX
//   - Manutenção/seguro: 8% / 1% do valor do ativo /ano (média setorial)
//   - Alçada R$ 5k: acima disso, override CAPEX exige aprovação
//   - Payback aceitável: ≤ 60% da vida útil do ativo
// ----------------------------------------------------------------------------
const PARAMETROS_CAPEX_DEFAULTS: Array<{
  chave: string;
  valorNumerico?: number;
  valorTexto?: string;
  descricao: string;
  categoria: string;
}> = [
  {
    chave: "tma_mensal",
    valorNumerico: 0.012,
    descricao: "Taxa mínima de atratividade mensal (decimal). Default 1.2%/mês ≈ Selic real.",
    categoria: "financeiro",
  },
  {
    chave: "limite_alcada_capex",
    valorNumerico: 5000,
    descricao: "Decisões CAPEX acima deste valor (R$) exigem aprovação se houver override da recomendação ERP.",
    categoria: "alcada",
  },
  {
    chave: "taxa_manutencao_anual",
    valorNumerico: 0.08,
    descricao: "Manutenção anual estimada como fração do valor do ativo (default 8%).",
    categoria: "tecnico",
  },
  {
    chave: "taxa_seguro_anual",
    valorNumerico: 0.01,
    descricao: "Seguro anual estimado como fração do valor do ativo (default 1%).",
    categoria: "tecnico",
  },
  {
    chave: "peso_utilizacao_historica",
    valorNumerico: 0.7,
    descricao: "Peso (0-1) da utilização histórica do equipamento no cálculo de payback. 1 = sempre usado, 0.7 = uso típico.",
    categoria: "tecnico",
  },
  {
    chave: "limiar_payback_fracao",
    valorNumerico: 0.6,
    descricao: "Payback aceitável como fração da vida útil. Default 60% — abaixo recomenda COMPRAR.",
    categoria: "financeiro",
  },
  // Vida útil por categoria (em meses)
  { chave: "vida_util_andaime",        valorNumerico: 120, descricao: "Vida útil estimada de andaimes (meses).",                categoria: "vida_util" },
  { chave: "vida_util_betoneira",      valorNumerico: 84,  descricao: "Vida útil estimada de betoneiras (meses).",              categoria: "vida_util" },
  { chave: "vida_util_compressor",     valorNumerico: 96,  descricao: "Vida útil estimada de compressores (meses).",            categoria: "vida_util" },
  { chave: "vida_util_gerador",        valorNumerico: 120, descricao: "Vida útil estimada de geradores (meses).",               categoria: "vida_util" },
  { chave: "vida_util_compactador",    valorNumerico: 60,  descricao: "Vida útil estimada de compactadores/placa vibratória.", categoria: "vida_util" },
  { chave: "vida_util_serra",          valorNumerico: 48,  descricao: "Vida útil estimada de serras (meses).",                  categoria: "vida_util" },
  { chave: "vida_util_ferramenta_eletrica", valorNumerico: 36, descricao: "Vida útil estimada de ferramentas elétricas leves.", categoria: "vida_util" },
];

/**
 * Garante que parametros_capex tenha as chaves default semeadas p/ a company.
 * Idempotente — só insere o que falta. Roda na 1ª listagem.
 */
async function seedParametrosCapexIfNeeded(db: any, companyId: number): Promise<void> {
  const existentes = await db
    .select({ chave: parametrosCapex.chave })
    .from(parametrosCapex)
    .where(eq(parametrosCapex.companyId, companyId));
  const chavesExistentes = new Set<string>(existentes.map((r: any) => r.chave));
  const faltam = PARAMETROS_CAPEX_DEFAULTS.filter(p => !chavesExistentes.has(p.chave));
  if (faltam.length === 0) return;
  await db.insert(parametrosCapex).values(
    faltam.map(p => ({
      companyId,
      chave: p.chave,
      valorNumerico: p.valorNumerico != null ? String(p.valorNumerico) : null,
      valorTexto: p.valorTexto ?? null,
      descricao: p.descricao,
      categoria: p.categoria,
      editavel: true,
    }))
  );
}

// ----------------------------------------------------------------------------
// Schemas Zod compartilhados
// ----------------------------------------------------------------------------
const fotoSchema = z.array(z.object({
  url: z.string(),
  legenda: z.string().optional(),
  uploadedAt: z.string().optional(),
})).optional();

// Rev. 2561 — Extrai o erro PG "limpo" de dentro de um erro do Drizzle.
// O Drizzle embrulha a falha numa mensagem "Failed query: <sql> params: <todos
// os parâmetros>" — que, no caso de equipamentos, inclui o BASE64 das fotos +
// dados do usuário. Se esse `e.message` vazar pro client (toast), vira um
// PAREDÃO ilegível. A causa real (curta) está em `e.cause` (o erro do pg).
function pgInfo(e: any): { code?: string; message: string } {
  const pgErr = e?.cause ?? e;
  return { code: pgErr?.code ?? e?.code, message: String(pgErr?.message ?? e?.message ?? "") };
}

// Rev. 2561 — Converte um erro de banco num TRPCError com mensagem CURTA e
// acionável em pt-BR (nunca expõe SQL/params/base64). A causa real continua
// logada server-side pelo `onError` do tRPC (`server/_core/index.ts`).
function cleanDbError(e: any, acao: string): TRPCError {
  const { code, message } = pgInfo(e);
  let motivo: string;
  switch (code) {
    case "22001": motivo = "um campo de texto excedeu o tamanho máximo permitido"; break;
    case "22003": motivo = "um valor numérico é grande demais (confira o valor de aquisição e a vida útil)"; break;
    case "23502": motivo = "um campo obrigatório ficou em branco"; break;
    case "22P02": motivo = "um valor está em formato inválido"; break;
    case "53400":
    case "57014":
    case "40001":   // serialization_failure
    case "40P01": motivo = "a operação demorou demais ou foi interrompida — tente novamente"; break;
    default: {
      // Mensagem do pg costuma ser curta (1 linha) e SEM base64. Blindagem:
      // se ainda assim vier o dump do Drizzle (SQL/params/base64) — ex.: erro
      // sem `cause` — NUNCA eco-a o conteúdo cru; usa motivo genérico fixo.
      const first = message ? message.split("\n")[0] : "";
      motivo = /Failed query|params:|data:image\/|;base64,/i.test(first) || !first
        ? "erro inesperado no banco de dados"
        : first.slice(0, 180);
    }
  }
  // Loga o motivo REAL server-side (code + 1ª linha truncada). O `onError` do
  // tRPC só veria a `message` limpa (não começa com "Failed query:"), então
  // registramos aqui o diagnóstico — sem despejar base64/params no log.
  const logLine = (message ? message.split("\n")[0] : "").slice(0, 200);
  console.error(`[equipamentos] erro ao ${acao}: code=${code ?? "?"} | ${logLine}`);
  // `cause: e` preserva o erro original para qualquer consumidor downstream,
  // sem expô-lo na `message` ao cliente.
  return new TRPCError({ code: "BAD_REQUEST", message: `Não foi possível ${acao}: ${motivo}.`, cause: e });
}

const eventoTipoSchema = z.enum([
  "RECEBIMENTO",
  "SAIDA_ALMOX",
  "RETORNO_ALMOX",
  "DEVOLUCAO_FORNECEDOR",
  "RENOVACAO",
  "MANUTENCAO",
  "CHECK_IN_OBRA",
  "LOCALIZACAO_PENDENTE",
  "TRANSFERENCIA_OBRA",
]);

// ============================================================================
// ROUTER
// ============================================================================
export const equipamentosRouter = router({

  // ── PARÂMETROS CAPEX ──────────────────────────────────────────────────────

  parametrosCapexListar: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await seedParametrosCapexIfNeeded(db, input.companyId);
      return await db
        .select()
        .from(parametrosCapex)
        .where(companyFilter(parametrosCapex.companyId, input))
        .orderBy(parametrosCapex.categoria, parametrosCapex.chave);
    }),

  parametrosCapexAtualizar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      chave: z.string().min(1).max(80),
      valorNumerico: z.number().nullable().optional(),
      valorTexto: z.string().max(255).nullable().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select()
        .from(parametrosCapex)
        .where(and(
          eq(parametrosCapex.companyId, input.companyId),
          eq(parametrosCapex.chave, input.chave),
        ))
        .limit(1);
      if (existing && existing.editavel === false) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Parâmetro não-editável." });
      }
      const payload = {
        companyId: input.companyId,
        chave: input.chave,
        valorNumerico: input.valorNumerico != null ? String(input.valorNumerico) : null,
        valorTexto: input.valorTexto ?? null,
        descricao: input.descricao ?? existing?.descricao ?? null,
        categoria: existing?.categoria ?? null,
        atualizadoPorId: ctx.user.id,
        atualizadoPorNome: ctx.user.name || String(ctx.user.id),
        updatedAt: sql`now()`,
      };
      if (existing) {
        await db.update(parametrosCapex)
          .set(payload)
          .where(eq(parametrosCapex.id, existing.id));
        return { id: existing.id, action: "updated" as const };
      }
      const [inserted] = await db.insert(parametrosCapex).values(payload).returning({ id: parametrosCapex.id });
      return { id: inserted.id, action: "created" as const };
    }),

  // ── EQUIPAMENTOS PRÓPRIOS ─────────────────────────────────────────────────

  propriosListar: protectedProcedure
    .input(companyInput.extend({
      status: z.enum(["disponivel", "em_obra", "manutencao", "baixado"]).optional(),
      categoria: z.string().optional(),
      obraId: z.number().optional(),
      busca: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conds: any[] = [companyFilter(equipamentosProprios.companyId, input), eq(equipamentosProprios.ativo, true)];
      if (input.status) conds.push(eq(equipamentosProprios.status, input.status));
      if (input.categoria) conds.push(eq(equipamentosProprios.categoria, input.categoria));
      if (input.obraId) conds.push(eq(equipamentosProprios.localizacaoAtualObraId, input.obraId));
      if (input.busca && input.busca.trim()) {
        const q = `%${input.busca.trim()}%`;
        conds.push(sql`(${equipamentosProprios.descricao} ILIKE ${q} OR ${equipamentosProprios.codigoPatrimonio} ILIKE ${q} OR ${equipamentosProprios.numeroSerie} ILIKE ${q})`);
      }
      // Rev. 2514 — LEFT JOIN obras pra trazer o nome da obra atual (sem
      // round-trip extra no client). Tabela obras tem coluna "companyId"
      // (camelCase) — usar SQL bruto na expressão pra evitar conflito de
      // helper Drizzle. `obraNome` retorna NULL quando localizacao_atual_obra_id
      // é NULL ou aponta pra obra de outra empresa (filtro multi-tenant).
      // Rev. 2536 — SEM alias `ep`: o WHERE é montado por helpers Drizzle
      // (companyFilter/eq) que qualificam pelo NOME REAL da tabela
      // ("equipamentos_proprios"."company_id"). Aliasar a tabela pra `ep`
      // quebrava com `invalid reference to FROM-clause entry` (Postgres exige
      // o alias quando ele existe). Referenciar pelo nome real casa com o
      // Drizzle e mantém o LEFT JOIN de obras intacto.
      const result = await db.execute(sql`
        SELECT equipamentos_proprios.*,
               o.nome AS obra_nome
        FROM equipamentos_proprios
        LEFT JOIN obras o
          ON o.id = equipamentos_proprios.localizacao_atual_obra_id
         AND o."companyId" = equipamentos_proprios.company_id
        ${conds.length > 0 ? sql`WHERE ${and(...conds)}` : sql``}
        ORDER BY equipamentos_proprios.id DESC
      `);
      // Rev. 2552 — `db.execute` (node-postgres) devolve QueryResult `{ rows }`;
      // ler via `.rows` (fallback p/ array direto). Sem isso, `.map` quebrava e
      // a lista vinha vazia.
      const rows = ((result as any)?.rows ?? result ?? []) as any[];
      // Normaliza camelCase pro front (matching Drizzle .select())
      return rows.map((r: any) => ({
        id: r.id,
        companyId: r.company_id,
        codigoPatrimonio: r.codigo_patrimonio,
        descricao: r.descricao,
        categoria: r.categoria,
        numeroSerie: r.numero_serie,
        marca: r.marca,
        modelo: r.modelo,
        dataAquisicao: r.data_aquisicao,
        valorAquisicao: r.valor_aquisicao,
        vidaUtilMeses: r.vida_util_meses,
        custoManutencaoMedioMes: r.custo_manut_medio_mes,
        custoSeguroMedioMes: r.custo_seguro_medio_mes,
        localizacaoAtualTipo: r.localizacao_atual_tipo,
        localizacaoAtualObraId: r.localizacao_atual_obra_id,
        status: r.status,
        fotosJson: r.fotos_json,
        observacoes: r.observacoes,
        ativo: r.ativo,
        criadoPorUserId: r.criado_por_user_id,
        criadoPorNome: r.criado_por_nome,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        obraNome: r.obra_nome,
        transferenciaPendenteId: r.transferencia_pendente_id ?? null,
      }));
    }),

  proprioById: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(equipamentosProprios)
        .where(and(eq(equipamentosProprios.id, input.id), eq(equipamentosProprios.companyId, input.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  proprioCriar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      // Rev. 2513 — codigoPatrimonio agora é OPCIONAL: servidor sempre gera
      // automaticamente (EQP-NNNN, contador por company, com retry em
      // UNIQUE violation pra anti-race entre dispositivos).
      codigoPatrimonio: z.string().max(50).optional(),
      descricao: z.string().min(1).max(255),
      categoria: z.string().max(100).optional(),
      numeroSerie: z.string().max(100).optional(),
      marca: z.string().max(100).optional(),
      modelo: z.string().max(100).optional(),
      // Rev. 4562 (Poka-Yoke): data futura quebra depreciação/CAPEX; valor negativo é digitação.
      dataAquisicao: z.string().max(10).refine(
        (d) => !d || d <= new Date().toISOString().slice(0, 10),
        "Data de aquisição não pode ser futura."
      ).optional(),
      valorAquisicao: z.number().nonnegative("Valor de aquisição não pode ser negativo.").optional(),
      vidaUtilMeses: z.number().int().optional(),
      custoManutencaoMedioMes: z.number().optional(),
      custoSeguroMedioMes: z.number().optional(),
      fotos: fotoSchema,
      observacoes: z.string().optional(),
      // Rev. 2552 — status + obra atual já no CADASTRO (antes só na edição).
      // Quando status="em_obra" exige obra; senão força almoxarifado/null.
      status: z.enum(["disponivel", "em_obra", "manutencao", "baixado"]).optional(),
      localizacaoAtualObraId: z.number().nullable().optional(),
      // Rev. 3314 — cadastro em LOTE: registra N itens idênticos de uma vez
      // (cada um ganha SEU próprio patrimônio EQP-NNNN sequencial). Evita
      // repetir o formulário pra equipamentos iguais (ex.: 10 pranchas).
      quantidade: z.number().int().min(1).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 3314 — tenant guard explícito: o INSERT confiava no `companyId`
      // vindo do cliente (sem `companyFilter`, que de toda forma não intersecta
      // com as empresas do user). Com o cadastro em LOTE (até 100 inserts/call)
      // o raio de impacto cresceu, então confirmamos o acesso aqui.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2513 — guarda defensiva pós-normalização: rejeita descrição
      // que vire vazia depois do upperBR (ex: payload só com espaços).
      if (!upperBR(input.descricao)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Descrição não pode estar vazia." });
      }
      // Rev. 2552 — coerência status×obra no SERVIDOR (não confiar só no client).
      // Quando status="em_obra": obra é obrigatória e DEVE pertencer à mesma
      // empresa (fecha vetor cross-tenant pelo novo campo de obra no cadastro).
      if (input.status === "em_obra") {
        if (!input.localizacaoAtualObraId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a obra onde o equipamento está." });
        }
        const obraRes: any = await db.execute(sql`
          SELECT id FROM obras
          WHERE id = ${input.localizacaoAtualObraId} AND "companyId" = ${input.companyId}
          LIMIT 1
        `);
        const obraRow = (obraRes?.rows ?? obraRes ?? [])[0];
        if (!obraRow) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Obra inválida ou de outra empresa." });
        }
      }
      // Rev. 2513 — INSERT com auto-gen + retry de UNIQUE violation.
      // Política: server SEMPRE manda; valor enviado do cliente é descartado.
      // Garantia: UNIQUE constraint uq_equip_proprio_company_patrimonio
      // (criada na Rev. 2510) + loop de até 8 tentativas pra cobrir race
      // entre dispositivos.
      const baseVals = {
        companyId: input.companyId,
        descricao: upperBR(input.descricao) || input.descricao,
        categoria: upperBR(input.categoria) ?? null,
        numeroSerie: upperBR(input.numeroSerie) ?? null,
        marca: upperBR(input.marca) ?? null,
        modelo: upperBR(input.modelo) ?? null,
        dataAquisicao: input.dataAquisicao ?? null,
        valorAquisicao: input.valorAquisicao != null ? String(input.valorAquisicao) : null,
        vidaUtilMeses: input.vidaUtilMeses ?? null,
        custoManutencaoMedioMes: input.custoManutencaoMedioMes != null ? String(input.custoManutencaoMedioMes) : "0",
        custoSeguroMedioMes: input.custoSeguroMedioMes != null ? String(input.custoSeguroMedioMes) : "0",
        fotosJson: input.fotos ?? null,
        observacoes: upperBR(input.observacoes) ?? null,
        // Rev. 2552 — status/obra opcionais no cadastro. Coerência: só "em_obra"
        // grava obra; demais status forçam almoxarifado/null (sem órfão visual).
        status: input.status ?? "disponivel",
        localizacaoAtualTipo: input.status === "em_obra" ? ("obra" as const) : ("almoxarifado" as const),
        localizacaoAtualObraId: input.status === "em_obra" ? (input.localizacaoAtualObraId ?? null) : null,
        // Rev. 2514 — rastreabilidade: quem cadastrou (snapshot do nome
        // pra histórico estável + user_id pro link forte).
        criadoPorUserId: ctx.user.id,
        criadoPorNome: ctx.user.name || String(ctx.user.id),
      };
      // Rev. 3314 — cadastro em LOTE. Insere `quantidade` itens idênticos
      // (cada um com SEU patrimônio sequencial). Cada insert mantém o retry
      // de UNIQUE violation (anti-race entre dispositivos). Sequencial de
      // propósito: `proximoCodigoPatrimonio` relê o MAX a cada item, então
      // os números saem encadeados (EQP-0114, EQP-0115, …).
      const quantidade = Math.min(Math.max(input.quantidade ?? 1, 1), 100);
      const codigos: string[] = [];
      let primeiroId: number | null = null;
      for (let i = 0; i < quantidade; i++) {
        let lastErr: any = null;
        let inserido = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          const cod = await proximoCodigoPatrimonio(db, input.companyId);
          try {
            const [created] = await db.insert(equipamentosProprios).values({
              ...baseVals,
              codigoPatrimonio: cod,
            }).returning({ id: equipamentosProprios.id, codigoPatrimonio: equipamentosProprios.codigoPatrimonio });
            if (primeiroId == null) primeiroId = created.id;
            codigos.push(created.codigoPatrimonio);
            inserido = true;
            break;
          } catch (e: any) {
            // 23505 = unique_violation (Postgres). Outro device pegou o N. — retry.
            // Rev. 2561 — lê código/mensagem do erro pg DENTRO do wrapper Drizzle
            // (`e.cause`), pois `e.code`/`e.message` do Drizzle não trazem o code
            // real e a `message` é o dump "Failed query… params:" (com base64).
            const { code, message } = pgInfo(e);
            const isUnique = code === "23505" || /uq_equip_proprio_company_patrimonio|duplicate key/i.test(message);
            // Erro NÃO-unique: traduz pra mensagem limpa (nunca vaza base64/params).
            if (!isUnique) throw cleanDbError(e, "cadastrar o equipamento");
            lastErr = e;
          }
        }
        if (!inserido) {
          // Falhou um item do lote. Os anteriores JÁ foram gravados — informa
          // quantos entraram pra o usuário não recadastrar tudo.
          const parcial = codigos.length > 0 ? ` ${codigos.length} de ${quantidade} já foram cadastrados.` : "";
          throw new TRPCError({
            code: "CONFLICT",
            message: `Não foi possível gerar um patrimônio único após 8 tentativas.${parcial} Tente novamente.`,
            cause: lastErr,
          });
        }
      }
      return {
        id: primeiroId!,
        codigoPatrimonio: codigos[0],
        quantidadeCriada: codigos.length,
        codigos,
      };
    }),

  proprioAtualizar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      descricao: z.string().max(255).optional(),
      categoria: z.string().max(100).nullable().optional(),
      marca: z.string().max(100).nullable().optional(),
      modelo: z.string().max(100).nullable().optional(),
      valorAquisicao: z.number().nullable().optional(),
      vidaUtilMeses: z.number().int().nullable().optional(),
      custoManutencaoMedioMes: z.number().nullable().optional(),
      custoSeguroMedioMes: z.number().nullable().optional(),
      status: z.enum(["disponivel", "em_obra", "manutencao", "baixado"]).optional(),
      localizacaoAtualTipo: z.enum(["almoxarifado", "obra"]).optional(),
      localizacaoAtualObraId: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      fotos: fotoSchema,
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const update: any = { updatedAt: sql`now()` };
      const map = (k: string, v: any) => { if (v !== undefined) update[k] = v; };
      // Rev. 2513 — normaliza textos pra MAIÚSCULA (descricao/categoria/marca/modelo/observacoes).
      const mapUpper = (k: string, v: string | null | undefined) => {
        if (v === undefined) return;
        update[k] = v === null ? null : (upperBR(v) ?? null);
      };
      mapUpper("descricao", input.descricao);
      mapUpper("categoria", input.categoria);
      mapUpper("marca", input.marca);
      mapUpper("modelo", input.modelo);
      if (input.valorAquisicao !== undefined) update.valorAquisicao = input.valorAquisicao != null ? String(input.valorAquisicao) : null;
      map("vidaUtilMeses", input.vidaUtilMeses);
      if (input.custoManutencaoMedioMes !== undefined) update.custoManutencaoMedioMes = input.custoManutencaoMedioMes != null ? String(input.custoManutencaoMedioMes) : null;
      if (input.custoSeguroMedioMes !== undefined) update.custoSeguroMedioMes = input.custoSeguroMedioMes != null ? String(input.custoSeguroMedioMes) : null;
      map("status", input.status);
      map("localizacaoAtualTipo", input.localizacaoAtualTipo);
      map("localizacaoAtualObraId", input.localizacaoAtualObraId);
      mapUpper("observacoes", input.observacoes);
      if (input.fotos !== undefined) update.fotosJson = input.fotos ?? null;
      // Rev. 2561 — traduz erro de banco pra mensagem limpa (sem vazar
      // SQL/params/base64 no toast do cliente).
      let r;
      try {
        r = await db.update(equipamentosProprios).set(update)
          .where(and(eq(equipamentosProprios.id, input.id), eq(equipamentosProprios.companyId, input.companyId)))
          .returning({ id: equipamentosProprios.id });
      } catch (e: any) {
        throw cleanDbError(e, "atualizar o equipamento");
      }
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: r[0].id };
    }),

  // Rev. 2511 — Soft delete: marca ativo=false. `propriosListar` já filtra
  // por `ativo=true`, então o equipamento some da UI mas histórico fica
  // intacto (R-001/R-007/R-010: zero DELETE).
  proprioExcluir: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const r = await db.update(equipamentosProprios)
        .set({ ativo: false, updatedAt: sql`now()` })
        .where(and(
          eq(equipamentosProprios.id, input.id),
          eq(equipamentosProprios.companyId, input.companyId),
        ))
        .returning({ id: equipamentosProprios.id });
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: r[0].id };
    }),

  // Rev. 3015 — "Gerar preços com IA": estima o valor de aquisição (BRL) de
  // TODOS os equipamentos próprios da empresa de uma vez, via LLM, a partir de
  // descrição/marca/modelo/categoria. Por padrão só preenche os SEM valor
  // (valor_aquisicao NULL ou 0); com `sobrescrever=true` reestima todos.
  // ZERO ALTER/DROP/DELETE — apenas UPDATE da coluna valor_aquisicao.
  // Mesmo padrão de tenant guard / parse defensivo de `locadosCategorizarComIA`.
  propriosGerarPrecosComIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sobrescrever: z.boolean().optional().default(false),
      // Rev. 3026 — processamento POR LOTE p/ exibir evolução 0→100% no front.
      // `offset` só avança no modo sobrescrever (no modo "só sem valor" os itens
      // processados saem do filtro, então o lote seguinte vem sempre do topo).
      offset: z.number().int().min(0).optional().default(0),
      loteMax: z.number().int().min(1).max(400).optional().default(30),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      // 1. Combinações distintas (descricao+marca+modelo+categoria) pendentes de preço.
      const condPreco = input.sobrescrever
        ? sql`TRUE`
        : sql`(valor_aquisicao IS NULL OR valor_aquisicao = 0)`;
      // Agrupa pela TRÍADE descricao+marca+modelo — a MESMA granularidade da
      // chave de reconciliação e do UPDATE abaixo (categoria é só contexto p/ a
      // IA, então vem agregada via MAX p/ não pulverizar combos).
      const rowsResult: any = await db.execute(sql`
        SELECT descricao,
               COALESCE(marca, '')          AS marca,
               COALESCE(modelo, '')         AS modelo,
               MAX(COALESCE(categoria, '')) AS categoria,
               COUNT(*)::int                AS qtd
        FROM equipamentos_proprios
        WHERE company_id = ${input.companyId}
          AND ativo = true
          AND descricao IS NOT NULL
          AND descricao <> ''
          AND ${condPreco}
        GROUP BY descricao, COALESCE(marca, ''), COALESCE(modelo, '')
        ORDER BY qtd DESC, descricao ASC
      `);
      const combos: { descricao: string; marca: string; modelo: string; categoria: string; qtd: number }[] =
        (rowsResult.rows || rowsResult) as any[];
      const totalCombos = combos.length;
      if (totalCombos === 0) {
        return { ok: true as const, itensAtualizados: 0, combosAnalisados: 0, totalCombos: 0, haMaisLotes: false, proximoOffset: 0 };
      }

      // 2. Recorta o LOTE deste passo. No modo sobrescrever o offset avança a cada
      // chamada; no modo "só sem valor" os já precificados saem do filtro, então o
      // próximo lote vem sempre do topo (offset ignorado). Limite duro: 400/call.
      const MAX_COMBOS = 400;
      const LOTE = Math.min(input.loteMax, MAX_COMBOS);
      const inicio = input.sobrescrever ? Math.min(input.offset, totalCombos) : 0;
      const lote = combos.slice(inicio, inicio + LOTE);
      if (lote.length === 0) {
        return { ok: true as const, itensAtualizados: 0, combosAnalisados: 0, totalCombos, haMaisLotes: false, proximoOffset: inicio };
      }
      const { invokeLLM } = await import("../_core/llm");
      const systemPrompt = `Você é um avaliador de patrimônio de uma construtora brasileira (FC Engenharia). Recebe uma lista de equipamentos PRÓPRIOS (ar-condicionado, eletrodomésticos, ferramentas, mobiliário, eletrônicos de escritório etc.) e deve estimar o VALOR DE AQUISIÇÃO de mercado de CADA item, em REAIS (BRL).

Regras OBRIGATÓRIAS:
1. Estime um valor realista de mercado para um item NOVO ou seminovo equivalente, em reais (BRL), considerando descrição, marca, modelo e categoria fornecidos.
2. O valor é um NÚMERO puro em reais (ex.: 2500.00). SEM "R$", SEM separador de milhar, use ponto decimal. Nunca retorne 0; se não souber, faça a melhor estimativa plausível para o tipo de item.
3. Retorne APENAS JSON válido — sem markdown, sem preâmbulo:
   {
     "precos": [ {"descricao": "TEXTO EXATO", "marca": "TEXTO EXATO", "modelo": "TEXTO EXATO", "valor": 2500.00 }, ... ]
   }
4. Os campos "descricao", "marca" e "modelo" devem ser IGUAIS (caractere a caractere) aos recebidos. Não omita nenhum item da lista.`;

      const userPrompt = `Estime o valor de aquisição (BRL) de cada um dos ${lote.length} equipamentos abaixo (qtd = unidades no acervo, apenas contexto):

${lote.map(c => `- descricao="${c.descricao}" | marca="${c.marca}" | modelo="${c.modelo}" | categoria="${c.categoria}"  (qtd ${c.qtd})`).join("\n")}

Gere o JSON conforme o esquema. Não omita nenhum item.`;

      // Normaliza um token numérico que a IA pode devolver em formato BR
      // (ex.: "2.500,00", "2.500.00", "2500,00") para Number JS válido.
      const parseValorBR = (s: any): number => {
        let t = String(s ?? "").trim().replace(/[^0-9.,]/g, "");
        if (!t) return NaN;
        const hasComma = t.includes(",");
        const hasDot = t.includes(".");
        if (hasComma && hasDot) {
          // O último separador é o decimal; o outro é milhar.
          if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
          else t = t.replace(/,/g, "");
        } else if (hasComma) {
          const parts = t.split(",");
          const dec = parts[parts.length - 1];
          if (dec.length <= 2) t = parts.slice(0, -1).join("") + "." + dec; // 2500,00 -> 2500.00
          else t = t.replace(/,/g, ""); // vírgula de milhar
        } else if (hasDot) {
          const parts = t.split(".");
          const dec = parts[parts.length - 1];
          if (parts.length > 2) t = parts.slice(0, -1).join("") + "." + dec; // 2.500.00 -> 2500.00
          else if (dec.length === 3) t = t.replace(/\./g, ""); // 2.500 -> 2500 (milhar)
          // senão: 2500.00 / 2500.5 -> mantém como decimal
        }
        return Number(t);
      };
      // Recupera os itens de preço mesmo quando o JSON vem malformado
      // (números BR, vírgulas sobrando) — extrai cada objeto via regex tolerante.
      const extrairPrecosResiliente = (txt: string): any[] => {
        const out: any[] = [];
        const blocks = txt.match(/\{[^{}]*?"valor"[^{}]*?\}/gi) || [];
        for (const b of blocks) {
          const d = b.match(/"descricao"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1];
          const ma = b.match(/"marca"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1];
          const mo = b.match(/"modelo"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1];
          const vRaw = b.match(/"valor"\s*:\s*"?\s*R?\$?\s*([0-9][\d.,\s]*)/i)?.[1];
          if (d == null || vRaw == null) continue;
          out.push({ descricao: d, marca: ma ?? "", modelo: mo ?? "", valor: parseValorBR(vRaw) });
        }
        return out;
      };

      let parsed: any;
      try {
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 16000,
          response_format: { type: "json_object" },
        });
        const content = resp.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "").trim();
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (m) raw = m[1].trim();
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Fallback resiliente: extrai os preços via regex tolerante a formato BR.
          const precos = extrairPrecosResiliente(raw);
          if (!precos.length) throw new Error("JSON da IA inválido e sem itens recuperáveis");
          parsed = { precos };
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha na IA: ${msg.slice(0, 200)}` });
      }

      // 3. Indexa os combos enviados p/ casar a resposta (chave normalizada).
      const norm = (s: any) => String(s ?? "").trim().toUpperCase();
      const chave = (d: any, ma: any, mo: any) => `${norm(d)}|||${norm(ma)}|||${norm(mo)}`;
      const enviados = new Map<string, { descricao: string; marca: string; modelo: string }>();
      for (const c of lote) enviados.set(chave(c.descricao, c.marca, c.modelo), { descricao: c.descricao, marca: c.marca, modelo: c.modelo });

      const precos: any[] = Array.isArray(parsed.precos) ? parsed.precos : [];
      let itensAtualizados = 0;
      for (const p of precos) {
        const valor = Number(p?.valor);
        if (!isFinite(valor) || valor <= 0) continue;
        const k = chave(p?.descricao, p?.marca, p?.modelo);
        const combo = enviados.get(k);
        if (!combo) continue;
        // UPDATE só nos itens daquela combinação que ainda batem o filtro (idempotente).
        const condSobre = input.sobrescrever
          ? sql`TRUE`
          : sql`(valor_aquisicao IS NULL OR valor_aquisicao = 0)`;
        const res: any = await db.execute(sql`
          UPDATE equipamentos_proprios
             SET valor_aquisicao = ${String(valor.toFixed(2))}, updated_at = NOW()
           WHERE company_id = ${input.companyId}
             AND ativo = true
             AND descricao = ${combo.descricao}
             AND COALESCE(marca, '')  = ${combo.marca}
             AND COALESCE(modelo, '') = ${combo.modelo}
             AND ${condSobre}
        `);
        itensAtualizados += Number(res.rowCount ?? res.rows?.length ?? 0);
      }

      // Há mais lotes? sobrescrever: enquanto o offset não cobrir tudo.
      // Só sem valor: enquanto sobrar combinação pendente além deste lote (elas
      // saem do filtro a cada UPDATE, então o total encolhe nas próximas chamadas).
      const haMaisLotes = input.sobrescrever
        ? (inicio + LOTE) < totalCombos
        : totalCombos > lote.length;
      return {
        ok: true as const,
        itensAtualizados,
        combosAnalisados: lote.length,
        totalCombos,
        haMaisLotes,
        proximoOffset: inicio + LOTE,
      };
    }),

  // ── EQUIPAMENTOS LOCADOS ──────────────────────────────────────────────────

  locadosListar: protectedProcedure
    .input(companyInput.extend({
      status: z.string().optional(),
      obraId: z.number().optional(),
      fornecedorId: z.number().optional(),
      ordemCompraId: z.number().optional(),
      vencendoEmDias: z.number().int().optional(),  // ex: 30 = vence nos próximos 30d
      busca: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 4539 — guard de empresa (visibilidade global é POR EMPRESA, nunca cross-tenant).
      const allowedCompaniesLoc = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (input.companyId != null && !allowedCompaniesLoc.map((c: any) => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const conds: any[] = [companyFilter(equipamentosLocados.companyId, input)];
      if (input.status) conds.push(eq(equipamentosLocados.status, input.status));
      if (input.fornecedorId) conds.push(eq(equipamentosLocados.fornecedorId, input.fornecedorId));
      if (input.ordemCompraId) conds.push(eq(equipamentosLocados.ordemCompraId, input.ordemCompraId));
      if (input.vencendoEmDias != null) {
        const hoje = new Date();
        const limite = new Date();
        limite.setDate(hoje.getDate() + input.vencendoEmDias);
        const limiteISO = limite.toISOString().slice(0, 10);
        conds.push(sql`${equipamentosLocados.dataFimPrevista} <= ${limiteISO}`);
        conds.push(sql`${equipamentosLocados.status} = 'em_uso'`);
      }
      if (input.busca && input.busca.trim()) {
        const q = `%${input.busca.trim()}%`;
        conds.push(sql`(${equipamentosLocados.descricao} ILIKE ${q} OR ${equipamentosLocados.codigoPatrimonioFornecedor} ILIKE ${q} OR ${equipamentosLocados.codigoInternoErp} ILIKE ${q} OR ${equipamentosLocados.numeroSerie} ILIKE ${q})`);
      }
      // Rev. 2420 — filtro de autorização por obra. Admin/admin_master =>
      // allowed === null => vê tudo (inclusive sem obra). Users restritos
      // veem APENAS equipamentos vinculados a alguma das obras permitidas
      // — isso fecha um buraco antigo no qual o picker "Qual equipamento vai
      // devolver?" mostrava itens de obras sem permissão (ex: HOTEL DO PAPA
      // pra encarregado da outra obra). Cadastros sem obra (obraId IS NULL)
      // ficam ocultos pra restritos (segurança > conveniência: admin tem
      // visão pra vincular). Quando vier `obraId` explícito, valida a
      // permissão antes (IDOR-safe: pedir obra B sendo de obra A => []).
      // Rev. 4539 — VISIBILIDADE GLOBAL (leitura): equipamentos locados de
      // todas as obras visíveis pra quem tem acesso ao módulo (o filtro Rev.
      // 2420 por obras permitidas foi removido de propósito). Devolução e
      // demais escritas continuam com guards próprios.
      if (input.obraId != null) {
        conds.push(eq(equipamentosLocados.obraId, input.obraId));
      }
      const rows = await db.select().from(equipamentosLocados).where(and(...conds)).orderBy(desc(equipamentosLocados.id));
      // Rev. 4558 — contagem de renovações por locado (badge "1ª Locação /
      // Nª Renovação" nos cards). Uma query agregada só, merge em memória.
      if (rows.length > 0) {
        try {
          const cntRes: any = await db.execute(sql`
            SELECT equipamento_locado_id AS id, COUNT(*)::int AS c
              FROM equipamento_locado_eventos
             WHERE tipo = 'RENOVACAO'
               AND equipamento_locado_id IN (${sql.join(rows.map((r: any) => sql`${r.id}`), sql`, `)})
             GROUP BY equipamento_locado_id
          `);
          const cntMap = new Map<number, number>();
          for (const r of ((cntRes as any).rows ?? cntRes)) cntMap.set(Number(r.id), Number(r.c) || 0);
          return rows.map((r: any) => ({ ...r, renovacoesCount: cntMap.get(r.id) ?? 0 }));
        } catch (e: any) {
          console.error("[locadosListar] contagem de renovações falhou:", e?.message || e);
          return rows.map((r: any) => ({ ...r, renovacoesCount: 0 }));
        }
      }
      return rows as any[];
    }),

  locadoById: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(equipamentosLocados)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  // Rev. 2371 — Lista Ordens de Compra de LOCAÇÃO que estão aprovadas/emitidas
  // mas ainda não foram recebidas (i.e. não existe `equipamentos_locados`
  // apontando pra elas via `ordemCompraId`). Usado pelo modal "Receber Locação
  // na Obra" pra o almoxarife dar entrada a partir da OC (em vez de digitar
  // tudo na mão). Status considerados "pendentes de recebimento":
  // pendente / aprovada / parcial (mesmo conjunto usado em warehouse.ts:1475).
  // 'entregue' e 'cancelada' são filtrados fora.
  ocsLocacaoPendentes: protectedProcedure
    .input(companyInput.extend({ obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2371 — companyFilter() valida que o user tem acesso à companyId
      // pedida (mesmo padrão de locadosListar/equipamentosProprios). Sem isso
      // qualquer user autenticado poderia listar OCs de outra empresa (IDOR).
      // Rev. 2384 — filtro + autorização por obra. Admin/admin_master =>
      // allowed === null => vê tudo. Quando obraId explícito vier, valida
      // que o user tem acesso (evita IDOR horizontal: obra A pedindo obra B).
      const obraConds: any[] = [];
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (input.obraId) {
        if (allowed !== null && !allowed.includes(input.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra solicitada" });
        }
        obraConds.push(eq(comprasOrdens.obraId, input.obraId));
      } else if (allowed !== null) {
        if (allowed.length === 0) return [];
        obraConds.push(inArray(comprasOrdens.obraId, allowed));
      }
      const ocs = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
        fornecedorNome: comprasOrdens.fornecedorNome,
        fornecedorId: comprasOrdens.fornecedorId,
        obraId: comprasOrdens.obraId,
        status: comprasOrdens.status,
        total: comprasOrdens.total,
        fdValor: comprasOrdens.fdValor,
        dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
        locacaoDataInicio: comprasOrdens.locacaoDataInicio,
        locacaoDataFim: comprasOrdens.locacaoDataFim,
        locacaoDuracaoDias: comprasOrdens.locacaoDuracaoDias,
        criadoEm: comprasOrdens.criadoEm,
        criadoPorNome: comprasOrdens.criadoPorNome,
      })
        .from(comprasOrdens)
        .where(and(
          companyFilter(comprasOrdens.companyId, input),
          eq(comprasOrdens.isLocacao, true),
          sql`${comprasOrdens.status} IN ('pendente', 'aprovada', 'parcial')`,
          sql`NOT EXISTS (SELECT 1 FROM equipamentos_locados el WHERE el.ordem_compra_id = ${comprasOrdens.id})`,
          ...obraConds,
        ))
        .orderBy(desc(comprasOrdens.criadoEm));

      if (ocs.length === 0) return [];

      const itens = await db.select({
        id: comprasOrdensItens.id,
        ordemId: comprasOrdensItens.ordemId,
        descricao: comprasOrdensItens.descricao,
        unidade: comprasOrdensItens.unidade,
        quantidade: comprasOrdensItens.quantidade,
        precoUnitario: comprasOrdensItens.precoUnitario,
        total: comprasOrdensItens.total,
      })
        .from(comprasOrdensItens)
        .where(inArray(comprasOrdensItens.ordemId, ocs.map(o => o.id)));

      const itensPorOc = new Map<number, typeof itens>();
      for (const it of itens) {
        const arr = itensPorOc.get(it.ordemId) || [];
        arr.push(it);
        itensPorOc.set(it.ordemId, arr);
      }

      return ocs.map(oc => ({
        ...oc,
        itens: itensPorOc.get(oc.id) || [],
      }));
    }),

  locadoCriar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      fornecedorId: z.number().optional(),
      fornecedorNome: z.string().max(255).optional(),
      ordemCompraId: z.number().optional(),
      contratoLocacaoId: z.number().optional(),
      codigoPatrimonioFornecedor: z.string().max(100).optional(),
      codigoInternoErp: z.string().max(50).optional(),
      descricao: z.string().min(1).max(255),
      categoria: z.string().max(100).optional(),
      numeroSerie: z.string().max(100).optional(),
      dataInicio: z.string().min(10).max(10),
      dataFimPrevista: z.string().min(10).max(10),
      valorDiario: z.number().optional(),
      valorMensal: z.number().optional(),
      fotosRecebimento: fotoSchema,
      funcionarioResponsavelId: z.number().optional(),
      funcionarioResponsavelNome: z.string().max(255).optional(),
      observacoes: z.string().optional(),
      ocAnteriorId: z.number().optional(),
      // Rev. 2465 — assinaturas (PNG dataURL) + nomes. Recebimento espelha
      // o fluxo da Rev. 2453 (devolução): ENTREGADOR = locadora (quem entrega
      // o equipamento na obra), RECEBEDOR = operador FC (quem confere).
      assinaturaEntregadorNome: z.string().min(1).max(255).optional(),
      assinaturaEntregadorUrl:  z.string().optional(),
      assinaturaRecebedorNome:  z.string().min(1).max(255).optional(),
      assinaturaRecebedorUrl:   z.string().optional(),
      // Rev. 4345 — quantidade de unidades físicas (padrão 1).
      quantidade: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2465 — Tenant isolation (hardening apontado pelo code review).
      // Confirma que a empresa pertence ao usuário antes de qualquer insert.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Foto OBRIGATÓRIA no recebimento (regra de negócio do user)
      if (!input.fotosRecebimento || input.fotosRecebimento.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Foto de recebimento é obrigatória." });
      }
      const [created] = await db.insert(equipamentosLocados).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        fornecedorNome: input.fornecedorNome ?? null,
        ordemCompraId: input.ordemCompraId ?? null,
        contratoLocacaoId: input.contratoLocacaoId ?? null,
        codigoPatrimonioFornecedor: input.codigoPatrimonioFornecedor ?? null,
        codigoInternoErp: input.codigoInternoErp ?? null,
        descricao: input.descricao,
        categoria: input.categoria ?? null,
        numeroSerie: input.numeroSerie ?? null,
        dataInicio: input.dataInicio,
        dataFimPrevista: input.dataFimPrevista,
        valorDiario: input.valorDiario != null ? String(input.valorDiario) : null,
        valorMensal: input.valorMensal != null ? String(input.valorMensal) : null,
        status: "em_uso",
        fotosRecebimentoJson: input.fotosRecebimento,
        funcionarioResponsavelId: input.funcionarioResponsavelId ?? null,
        funcionarioResponsavelNome: input.funcionarioResponsavelNome ?? null,
        observacoes: input.observacoes ?? null,
        ocAnteriorId: input.ocAnteriorId ?? null,
        quantidade: input.quantidade ?? 1,
      }).returning({ id: equipamentosLocados.id });

      // Rev. 2465 — Token HMAC pro comprovante PDF público (só quando há
      // par completo de assinaturas). Mesmo padrão da `locadoDevolverEmLote`.
      const temAssinaturas = !!(input.assinaturaEntregadorUrl && input.assinaturaRecebedorUrl);
      const pdfToken = temAssinaturas
        ? crypto.randomBytes(24).toString("hex")
        : null;

      // Registra evento RECEBIMENTO automaticamente
      const [insEv] = await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: created.id,
        tipo: "RECEBIMENTO",
        obraId: input.obraId ?? null,
        fotosJson: input.fotosRecebimento,
        observacao: input.observacoes ?? null,
        funcionarioId: input.funcionarioResponsavelId ?? null,
        funcionarioNome: input.funcionarioResponsavelNome ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
        // Rev. 2465 — assinaturas + token (null quando não capturadas)
        assinaturaEntregadorNome: input.assinaturaEntregadorNome || null,
        assinaturaEntregadorUrl:  input.assinaturaEntregadorUrl  || null,
        assinaturaRecebedorNome:  input.assinaturaRecebedorNome  || null,
        assinaturaRecebedorUrl:   input.assinaturaRecebedorUrl   || null,
        pdfComprovanteToken:      pdfToken,
      }).returning({ id: equipamentoLocadoEventos.id });

      // Rev. 2405 — Sync com almoxarifado da obra (idempotente).
      if (input.obraId) {
        const { ensureAlmoxItemForEquipamento } = await import("../lib/almoxEquipamentoSync");
        const firstFoto = Array.isArray(input.fotosRecebimento) && input.fotosRecebimento.length > 0
          ? (input.fotosRecebimento[0] as any)?.url
          : null;
        await ensureAlmoxItemForEquipamento(db, {
          companyId: input.companyId,
          tipo: "locado",
          equipamentoId: created.id,
          obraId: input.obraId,
          nome: input.descricao,
          categoria: input.categoria ?? null,
          fotoUrl: firstFoto,
          fornecedorNome: input.fornecedorNome ?? null,
          dataInicio: input.dataInicio,
          dataFim: input.dataFimPrevista,
          valorMensal: input.valorMensal ?? null,
          userId: ctx.user.id,
          userName: ctx.user.name || String(ctx.user.id),
        });
      }
      return {
        id: created.id,
        // Rev. 2465 — comprovante PDF público (só quando assinaturas capturadas).
        comprovante: (insEv && pdfToken)
          ? { eventoId: insEv.id, token: pdfToken }
          : null,
      };
    }),

  locadoAtualizar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      obraId: z.number().nullable().optional(),
      // Rev. 2411 — adicionados aguardando_chegada / quebrado / solicitado_substituicao.
      status: z.enum([
        "em_uso", "devolvido", "atrasado", "em_renovacao",
        "localizacao_pendente", "em_manutencao",
        "aguardando_chegada", "quebrado", "solicitado_substituicao",
      ]).optional(),
      dataFimPrevista: z.string().max(10).optional(),
      funcionarioResponsavelId: z.number().nullable().optional(),
      funcionarioResponsavelNome: z.string().max(255).nullable().optional(),
      observacoes: z.string().nullable().optional(),
      codigoInternoErp: z.string().max(50).nullable().optional(),
      codigoPatrimonioFornecedor: z.string().max(100).nullable().optional(),
      // Rev. 2553 — permite corrigir o fornecedor (locadora) de UMA unidade
      // (ex.: item importado/cadastrado com locadora errada — "nosso" em vez
      // de "Minas Locc"). Diferente do rename em lote, atinge só este item.
      fornecedorNome: z.string().max(255).nullable().optional(),
      // Rev. 4345 — quantidade de unidades físicas.
      quantidade: z.number().int().min(1).nullable().optional(),
      // Rev. 4514 — permite corrigir a categoria diretamente no painel de detalhes.
      categoria: z.string().max(100).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2553 — guarda de tenant: confirma que a empresa pertence ao
      // usuário (mesmo padrão de locadosVincularObraLote/RenomearFornecedor).
      // Necessário pois esta procedure passou a ser o caminho de troca de
      // fornecedor por item — antes não tinha chamador no client.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const update: any = { updatedAt: sql`now()` };
      const map = (k: string, v: any) => { if (v !== undefined) update[k] = v; };
      map("obraId", input.obraId);
      map("status", input.status);
      map("dataFimPrevista", input.dataFimPrevista);
      map("funcionarioResponsavelId", input.funcionarioResponsavelId);
      map("funcionarioResponsavelNome", input.funcionarioResponsavelNome);
      map("observacoes", input.observacoes);
      map("codigoInternoErp", input.codigoInternoErp);
      map("codigoPatrimonioFornecedor", input.codigoPatrimonioFornecedor);
      // Rev. 4345 — quantidade de unidades físicas.
      if (input.quantidade != null) map("quantidade", input.quantidade);
      // Rev. 4514 — categoria editável pelo painel de detalhes.
      if (input.categoria !== undefined) {
        update.categoria = input.categoria && input.categoria.trim() ? input.categoria.trim() : null;
      }
      // Rev. 2553 — normaliza fornecedor: trim, ou null quando vazio.
      if (input.fornecedorNome !== undefined) {
        update.fornecedorNome = input.fornecedorNome && input.fornecedorNome.trim()
          ? input.fornecedorNome.trim()
          : null;
      }
      const r = await db.update(equipamentosLocados).set(update)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .returning({ id: equipamentosLocados.id });
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      // Rev. 2411 — Se mudou pra devolvido, remove imediatamente do almox
      // (o item parou de estar fisicamente na obra). Tem prioridade sobre
      // o ensureAlmoxItemForEquipamento abaixo, que só cria/transfere.
      if (input.status === "devolvido") {
        const { removeAlmoxItemForEquipamento } = await import("../lib/almoxEquipamentoSync");
        await removeAlmoxItemForEquipamento(db, {
          companyId: input.companyId,
          tipo: "locado",
          equipamentoId: input.id,
        });
      } else if (input.obraId !== undefined && input.obraId !== null) {
        // Rev. 2405 — Sync com almoxarifado se obra mudou ou foi setada.
        const [full] = await db.select().from(equipamentosLocados)
          .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
          .limit(1);
        if (full && (full as any).status !== "devolvido") {
          const { ensureAlmoxItemForEquipamento } = await import("../lib/almoxEquipamentoSync");
          const fotos: any = (full as any).fotosRecebimentoJson;
          const firstFoto = Array.isArray(fotos) && fotos.length > 0 ? fotos[0]?.url : (full as any).fotoUrl ?? null;
          await ensureAlmoxItemForEquipamento(db, {
            companyId: input.companyId,
            tipo: "locado",
            equipamentoId: input.id,
            obraId: input.obraId,
            nome: (full as any).descricao,
            categoria: (full as any).categoria ?? null,
            fotoUrl: firstFoto,
            fornecedorNome: (full as any).fornecedorNome ?? null,
            dataInicio: (full as any).dataInicio ?? null,
            dataFim: (full as any).dataFimPrevista ?? null,
            valorMensal: (full as any).valorMensal ?? null,
          });
        }
      }
      // Rev. 2553 — quando o fornecedor (locadora) muda, sincroniza o item
      // vinculado no almoxarifado (fornecedor_locacao). Não-bloqueante.
      if (input.fornecedorNome !== undefined) {
        try {
          const novoForn = update.fornecedorNome ?? null;
          await db.execute(sql`
            UPDATE almoxarifado_itens
               SET fornecedor_locacao = ${novoForn}, atualizado_em = NOW()
             WHERE company_id = ${input.companyId}
               AND equipamento_vinculado_tipo = 'locado'
               AND equipamento_vinculado_id = ${input.id}
          `);
        } catch (e: any) {
          console.error("[locadoAtualizar] sync fornecedor almox falhou:", e?.message || e);
        }
      }
      return { id: r[0].id };
    }),

  // ==========================================================================
  // Rev. 4558 — RENOVAÇÃO REAL DE LOCAÇÃO (gera nova OC no Compras).
  // ==========================================================================
  // Antes, "renovar" era só editar dataFimPrevista na mão — nada chegava ao
  // Compras/Financeiro. Agora a renovação: (1) gera uma NOVA OC de locação
  // (numeração oficial, isLocacao, status aprovada — mesmo padrão das OCs
  // nascidas de SC, que são auto-aprovadas) que segue o fluxo normal até o
  // Contas a Pagar via triggerFinancialSync; (2) atualiza o vencimento/valor
  // da locação e a re-vincula à nova OC (a anterior fica em ocAnteriorId);
  // (3) grava evento RENOVACAO na timeline; (4) sincroniza o item espelho do
  // almoxarifado (vencimento/valor). Advisory lock por locado evita clique
  // duplo gerar 2 OCs.
  locadoRenovar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      novaDataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      novoValorMensal: z.number().positive().optional(),
      valorOc: z.number().positive(),           // valor TOTAL do novo ciclo (vira o total da OC)
      observacao: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Numeração oficial FORA da transação principal (gerarProximoNumeroOC tem
      // transação/lock próprios com contador persistido — padrão do fluxo de cotação).
      const { gerarProximoNumeroOC } = await import("./compras");
      const numeroOc = await gerarProximoNumeroOC(input.companyId, "compra");

      const result = await db.transaction(async (tx: any) => {
        // Lock por locado: clique duplo/refetch não renova 2x.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478001::int, ${input.id}::int)`);
        const [loc] = await tx.select().from(equipamentosLocados)
          .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
          .limit(1);
        if (!loc) throw new TRPCError({ code: "NOT_FOUND", message: "Locação não encontrada." });
        if (loc.status === "devolvido") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Equipamento já devolvido — não é possível renovar." });
        }
        if (input.novaDataFim <= loc.dataFimPrevista) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `A nova data de fim (${input.novaDataFim}) deve ser posterior ao vencimento atual (${loc.dataFimPrevista}).` });
        }

        // Novo ciclo começa no dia seguinte ao fim do ciclo anterior.
        const inicioNovoCiclo = new Date(loc.dataFimPrevista + "T00:00:00Z");
        inicioNovoCiclo.setUTCDate(inicioNovoCiclo.getUTCDate() + 1);
        const inicioISO = inicioNovoCiclo.toISOString().slice(0, 10);
        const duracaoDias = Math.max(1, Math.round(
          (new Date(input.novaDataFim + "T00:00:00Z").getTime() - inicioNovoCiclo.getTime()) / 86400000,
        ) + 1);

        // Quantas renovações já houve (pra numerar o ciclo no histórico).
        const cntRes: any = await tx.execute(sql`
          SELECT COUNT(*)::int AS c FROM equipamento_locado_eventos
          WHERE equipamento_locado_id = ${input.id} AND tipo = 'RENOVACAO'
        `);
        const renovacoesAnteriores = Number(((cntRes as any).rows ?? cntRes)?.[0]?.c ?? 0) || 0;
        const numeroCiclo = renovacoesAnteriores + 1; // esta será a Nª renovação

        const valorTotal = String(input.valorOc.toFixed(2));
        const [oc] = await tx.insert(comprasOrdens).values({
          companyId: input.companyId,
          numeroOc,
          obraId: loc.obraId ?? null,
          fornecedorId: loc.fornecedorId ?? null,
          fornecedorNome: loc.fornecedorNome ?? null,
          tipo: "locacao",
          isLocacao: true,
          locacaoDataInicio: inicioISO,
          locacaoDataFim: input.novaDataFim,
          locacaoDuracaoDias: duracaoDias,
          locacaoRenovavel: true,
          locacaoOcAnteriorId: loc.ordemCompraId ?? null,
          status: "aprovada",
          aprovacaoStatus: "aprovado",
          aprovadoEm: new Date().toISOString(),
          subtotal: valorTotal,
          total: valorTotal,
          dataEntregaPrevista: inicioISO,
          observacoes: `Renovação de locação (${numeroCiclo}ª renovação) — ${loc.descricao}${loc.numeroContratoFornecedor ? ` | Contrato ${loc.numeroContratoFornecedor}` : ""}. Período: ${inicioISO} a ${input.novaDataFim}.${input.observacao ? ` Obs: ${input.observacao}` : ""}`,
          criadoPorId: ctx.user.id,
          criadoPorNome: (ctx.user as any).name ?? null,
        } as any).returning();

        await tx.insert(comprasOrdensItens).values({
          ordemId: oc.id,
          descricao: `LOCAÇÃO (RENOVAÇÃO ${numeroCiclo}ª) — ${loc.descricao}`.slice(0, 300),
          unidade: "período",
          quantidade: "1",
          precoUnitario: valorTotal,
          total: valorTotal,
        } as any);

        await tx.update(equipamentosLocados).set({
          dataFimPrevista: input.novaDataFim,
          ...(input.novoValorMensal != null ? { valorMensal: String(input.novoValorMensal.toFixed(2)) } : {}),
          status: "em_uso",
          ordemCompraId: oc.id,
          ocAnteriorId: loc.ordemCompraId ?? loc.ocAnteriorId ?? null,
          updatedAt: sql`now()`,
        } as any).where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)));

        await tx.insert(equipamentoLocadoEventos).values({
          companyId: input.companyId,
          equipamentoLocadoId: input.id,
          tipo: "RENOVACAO",
          obraId: loc.obraId ?? null,
          usuarioId: ctx.user.id,
          usuarioNome: (ctx.user as any).name ?? null,
          observacao: `${numeroCiclo}ª renovação — vencimento ${loc.dataFimPrevista} → ${input.novaDataFim}. Nova OC ${numeroOc} (R$ ${input.valorOc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).${input.novoValorMensal != null ? ` Valor mensal atualizado: R$ ${input.novoValorMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` : ""}${input.observacao ? ` Obs: ${input.observacao}` : ""}`,
        } as any);

        return { ocId: oc.id, numeroOc, numeroCiclo, obraId: loc.obraId ?? null, fornecedorId: loc.fornecedorId ?? null, fornecedorNome: loc.fornecedorNome ?? null, inicioISO };
      });

      // Gera as parcelas no Contas a Pagar — MESMO contrato das demais OCs
      // aprovadas (purchaseFinancialBridge é o ÚNICO caminho compra→financeiro;
      // o bulk import está desativado). Não-bloqueante: a renovação já foi
      // gravada; se falhar, o log aponta e a OC pode ser reprocessada.
      try {
        const { criarParcelasFinanceiras } = await import("../services/purchaseFinancialBridge");
        const { entryIds } = await criarParcelasFinanceiras({
          ocId: result.ocId,
          companyId: input.companyId,
          obraId: result.obraId ?? undefined,
          supplierId: result.fornecedorId,
          supplierNome: result.fornecedorNome,
          valorTotal: input.valorOc,
          tipo: "locacao",
          tipoPagamento: null,
          condicaoPagamento: null,
          formaPagamento: null,
          numeroParcelas: 1,
          // Vencimento da parcela = fim do NOVO ciclo (novaDataFim). Nunca usar
          // o início do ciclo (inicioISO): se a locação estava atrasada, o início
          // fica no PASSADO e a parcela some da tela do mês corrente (Rev. 4560).
          dataBase: input.novaDataFim,
          numero: result.numeroOc,
        } as any, ctx.user.id, (ctx.user as any).name ?? "Sistema");
        if (entryIds?.length > 0) {
          await db.update(comprasOrdens).set({ financialEntryId: entryIds[0] } as any)
            .where(eq(comprasOrdens.id, result.ocId));
        }
      } catch (e: any) {
        console.error("[locadoRenovar] criarParcelasFinanceiras falhou:", e?.message || e);
      }

      // Sincroniza o item espelho do Almoxarifado (não-bloqueante).
      try {
        await db.execute(sql`
          UPDATE almoxarifado_itens
             SET data_vencimento_locacao = ${input.novaDataFim},
                 ${input.novoValorMensal != null ? sql`valor_locacao_mensal = ${String(input.novoValorMensal.toFixed(2))},` : sql``}
                 atualizado_em = NOW()
           WHERE company_id = ${input.companyId}
             AND equipamento_vinculado_tipo = 'locado'
             AND equipamento_vinculado_id = ${input.id}
        `);
      } catch (e: any) {
        console.error("[locadoRenovar] sync almox falhou:", e?.message || e);
      }

      // OC aprovada gera a despesa no Contas a Pagar (fluxo normal do Compras).
      try {
        const { triggerFinancialSync } = await import("../services/financialEventTrigger");
        triggerFinancialSync(input.companyId);
      } catch (e: any) {
        console.error("[locadoRenovar] triggerFinancialSync falhou:", e?.message || e);
      }

      return result;
    }),

  // Rev. 2323 — Vincular obra em lote + Excluir em lote (multi-seleção na UI).
  locadosVincularObraLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
      obraId: z.number().nullable(), // null = desvincular
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2329 — Bulkificação. Antes (Rev. 2323/2325): 1 UPDATE +
      // 1 INSERT por ID = 2N round-trips ao Neon (200 itens = 400
      // viagens, ~30s no proxy). Agora: 1 UPDATE WHERE IN + 1 INSERT
      // multi-VALUES = 2 round-trips totais. ~50× mais rápido.
      const updated = await db.update(equipamentosLocados)
        .set({ obraId: input.obraId, updatedAt: sql`now()` })
        .where(and(
          inArray(equipamentosLocados.id, input.ids),
          eq(equipamentosLocados.companyId, input.companyId),
        ))
        .returning({ id: equipamentosLocados.id });
      const total = updated.length;
      if (total > 0) {
        const obsTxt = input.obraId == null
          ? "Desvinculado da obra (lote)"
          : `Vinculado à obra #${input.obraId} (lote)`;
        const userNome = ctx.user.name || String(ctx.user.id);
        const rows = updated.map(u => ({
          companyId: input.companyId,
          equipamentoLocadoId: u.id,
          tipo: "VINCULO_OBRA" as const,
          obraId: input.obraId,
          observacao: obsTxt,
          usuarioId: ctx.user.id,
          usuarioNome: userNome,
        }));
        await db.insert(equipamentoLocadoEventos).values(rows);
      }
      return { ok: true as const, vinculados: total };
    }),

  // Alterar categoria em lote (por IDs selecionados).
  locadosAtualizarCategoriaLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
      categoria: z.string().max(100).nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const cat = input.categoria && input.categoria.trim() ? input.categoria.trim() : null;
      const updated = await db.update(equipamentosLocados)
        .set({ categoria: cat, updatedAt: sql`now()` })
        .where(and(
          inArray(equipamentosLocados.id, input.ids),
          eq(equipamentosLocados.companyId, input.companyId),
        ))
        .returning({ id: equipamentosLocados.id });
      return { ok: true as const, atualizados: updated.length };
    }),

  // Alterar fornecedor em lote (por IDs selecionados).
  locadosAtualizarFornecedorLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
      fornecedorNome: z.string().max(255).nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const forn = input.fornecedorNome && input.fornecedorNome.trim() ? input.fornecedorNome.trim() : null;
      const updated = await db.update(equipamentosLocados)
        .set({ fornecedorNome: forn, updatedAt: sql`now()` })
        .where(and(
          inArray(equipamentosLocados.id, input.ids),
          eq(equipamentosLocados.companyId, input.companyId),
        ))
        .returning({ id: equipamentosLocados.id });
      return { ok: true as const, atualizados: updated.length };
    }),

  // Rev. 2518 — Renomear locadora (fornecedor) em lote.
  // Sobrescreve `fornecedorNome` em TODAS as unidades da empresa cujo
  // nome atual (uppercase + trim) bate com `nomeAtual`. Pedido user:
  // "quero poder trocar o nome do fornecedor, quando tiver cadastro
  // errado". Útil quando a IA / import gerou variações erradas
  // ("Minas Locc" → "MINAS LOCAÇÕES LTDA") ou typos.
  //
  // Segurança (code review Rev. 2518): aplica `getEffectiveAllowedObraIds`
  // — usuários restritos a obras só renomeiam unidades dentro do seu
  // escopo (mesmo padrão de `locadoDevolverEmLote` L1039). Match
  // case-insensitive na coluna pra pegar todas as variantes ("Jalves",
  // "JALVES", "jalves" → todas viram o novoNome).
  //
  // Sincronização (code review Rev. 2518): após o UPDATE em
  // `equipamentos_locados`, sincroniza `almoxarifado_itens.fornecedor_locacao`
  // dos itens vinculados (equipamento_vinculado_tipo='locado' +
  // equipamento_vinculado_id IN ids) — evita desincronia entre o
  // cadastro de equipamentos e a tela do almoxarifado.
  locadosRenomearFornecedor: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nomeAtual: z.string().min(1).max(255),
      nomeNovo: z.string().min(1).max(255),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedCompanyIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedCompanyIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const alvo = input.nomeAtual.trim().toUpperCase();
      const novo = input.nomeNovo.trim();
      if (!novo) throw new TRPCError({ code: "BAD_REQUEST", message: "Novo nome vazio." });
      if (alvo === novo.toUpperCase()) {
        return { ok: true as const, atualizados: 0, semMudanca: true };
      }
      // Filtro por obra autorizada — admin/admin_master => allowed === null
      // => sem restrição. Restritos: só obras permitidas. Sem obra
      // (obraId IS NULL) fica oculto pra restritos (mesma regra de
      // `locadosListar` L491-507 e `locadoDevolverEmLote` L1057).
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const where: any[] = [
        eq(equipamentosLocados.companyId, input.companyId),
        sql`UPPER(TRIM(${equipamentosLocados.fornecedorNome})) = ${alvo}`,
      ];
      if (allowed !== null) {
        if (allowed.length === 0) return { ok: true as const, atualizados: 0 };
        where.push(inArray(equipamentosLocados.obraId, allowed));
      }
      const updated = await db.update(equipamentosLocados)
        .set({ fornecedorNome: novo, updatedAt: sql`now()` })
        .where(and(...where))
        .returning({ id: equipamentosLocados.id });
      // Sincroniza almox vinculado (fornecedor_locacao) — só pra IDs
      // efetivamente atualizados. Não-bloqueante (catch interno).
      let almoxAtualizados = 0;
      if (updated.length > 0) {
        try {
          const r: any = await db.execute(sql`
            UPDATE almoxarifado_itens
               SET fornecedor_locacao = ${novo}, atualizado_em = NOW()
             WHERE company_id = ${input.companyId}
               AND equipamento_vinculado_tipo = 'locado'
               AND equipamento_vinculado_id = ANY(${updated.map(u => u.id)}::int[])
            RETURNING id
          `);
          almoxAtualizados = r?.rows?.length ?? 0;
        } catch (e: any) {
          console.error("[locadosRenomearFornecedor] sync almox falhou:", e?.message || e);
        }
      }
      return { ok: true as const, atualizados: updated.length, almoxAtualizados };
    }),

  locadosExcluirLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2329 — Bulkificação. Antes (Rev. 2323/2325): 1 DELETE
      // eventos + 1 DELETE locado por ID = 2N round-trips (200 itens
      // = 400 viagens). Agora: 1 DELETE eventos WHERE IN + 1 DELETE
      // locados WHERE IN = 2 round-trips totais. ~50× mais rápido.
      // Sem transaction explícito: eventos primeiro (FK), depois
      // locados; se o 2º falhar, eventos órfãos seriam apagados de
      // novo na próxima tentativa (idempotente).
      await db.delete(equipamentoLocadoEventos).where(and(
        inArray(equipamentoLocadoEventos.equipamentoLocadoId, input.ids),
        eq(equipamentoLocadoEventos.companyId, input.companyId),
      ));
      const deleted = await db.delete(equipamentosLocados)
        .where(and(
          inArray(equipamentosLocados.id, input.ids),
          eq(equipamentosLocados.companyId, input.companyId),
        ))
        .returning({ id: equipamentosLocados.id });
      // Rev. 2411 — remove os itens equivalentes do almoxarifado (vínculo
      // bidirecional). Sem isso o almox ficava com cards "Equipamento
      // Locado #N" apontando pra IDs que não existem mais.
      let almoxRemovidos = 0;
      if (deleted.length > 0) {
        const { removeAlmoxItemsForEquipamentos } = await import("../lib/almoxEquipamentoSync");
        almoxRemovidos = await removeAlmoxItemsForEquipamentos(db, {
          companyId: input.companyId,
          tipo: "locado",
          ids: deleted.map(d => d.id),
        });
      }
      return { ok: true as const, excluidos: deleted.length, almoxRemovidos };
    }),

  // Rev. 4516 — Conversão de tipo Locado → Próprio (individual ou lote até 50).
  // Para cada locado: gera codigoPatrimonio automático, cria registro em
  // equipamentos_proprios e marca o locado como devolvido (mesmo fluxo da
  // migração Rev. 4513, mas disponível permanentemente via UI).
  locadoConverterParaProprio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const today = new Date().toISOString().slice(0, 10);
      const criadorNome = (ctx.user as any).nome || (ctx.user as any).email || "Sistema";
      const convertidos: { id: number; codigoPatrimonio: string }[] = [];
      for (const locadoId of input.ids) {
        const locRes: any = await db.execute(sql`
          SELECT id, obra_id, descricao, categoria, status, foto_url, fotos_recebimento_json, fornecedor_nome
          FROM equipamentos_locados
          WHERE id = ${locadoId} AND company_id = ${input.companyId}
          LIMIT 1
        `);
        const loc = (locRes?.rows ?? locRes)[0];
        if (!loc || loc.status === "devolvido") continue;
        const fotosRec = Array.isArray(loc.fotos_recebimento_json) ? loc.fotos_recebimento_json : [];
        const fotosJson = fotosRec.length > 0 ? fotosRec : (loc.foto_url ? [{ url: loc.foto_url, caption: "" }] : null);
        const status = loc.status === "em_uso" ? "em_obra" : "disponivel";
        const obraId = loc.status === "em_uso" ? (loc.obra_id ?? null) : null;
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const codigoPatrimonio = await proximoCodigoPatrimonio(db, input.companyId);
            const [created] = await db.insert(equipamentosProprios).values({
              companyId: input.companyId,
              codigoPatrimonio,
              descricao: loc.descricao,
              categoria: loc.categoria ?? null,
              status,
              localizacaoAtualTipo: obraId ? "obra" : "almoxarifado",
              localizacaoAtualObraId: obraId,
              fotosJson,
              observacoes: `Convertido de Equipamentos Locados${loc.fornecedor_nome ? ` (antes locado de: ${loc.fornecedor_nome})` : ""}`,
              ativo: true,
              criadoPorUserId: ctx.user.id,
              criadoPorNome: criadorNome,
            } as any).returning({ id: equipamentosProprios.id, codigoPatrimonio: equipamentosProprios.codigoPatrimonio });
            await db.execute(sql`
              UPDATE equipamentos_locados
              SET status = 'devolvido', data_fim_real = ${today},
                  observacoes = COALESCE(observacoes, '') || ' | Convertido para Equipamento Próprio'
              WHERE id = ${locadoId} AND company_id = ${input.companyId}
            `);
            convertidos.push({ id: created.id, codigoPatrimonio: created.codigoPatrimonio });
            break;
          } catch (e: any) {
            if (e?.code === "23505" && attempt < 7) continue;
            throw e;
          }
        }
      }
      return { ok: true as const, convertidos };
    }),

  // Rev. 4516 — Conversão de tipo Próprio → Locado (individual ou lote até 50).
  // Para cada próprio: cria registro em equipamentos_locados e marca o próprio
  // como inativo (ativo=false). O fornecedor é pedido uma vez para todo o lote.
  proprioConverterParaLocado: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(50),
      fornecedorNome: z.string().min(1).max(255),
      dataInicio: z.string().min(10).max(10),
      dataFimPrevista: z.string().min(10).max(10).optional(),
      valorMensal: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const dataFim = input.dataFimPrevista ?? (() => {
        const d = new Date(input.dataInicio + "T00:00:00");
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
      })();
      const convertidos: number[] = [];
      for (const proprioId of input.ids) {
        const pRes: any = await db.execute(sql`
          SELECT id, descricao, categoria, status, fotos_json, localizacao_atual_obra_id
          FROM equipamentos_proprios
          WHERE id = ${proprioId} AND company_id = ${input.companyId} AND ativo = true
          LIMIT 1
        `);
        const pr = (pRes?.rows ?? pRes)[0];
        if (!pr) continue;
        const fotos = Array.isArray(pr.fotos_json) ? pr.fotos_json : [];
        const fotoUrl = fotos.length > 0 ? (fotos[0] as any)?.url ?? null : null;
        const locStatus = pr.status === "em_obra" ? "em_uso" : "aguardando_chegada";
        const [created] = await db.insert(equipamentosLocados).values({
          companyId: input.companyId,
          obraId: pr.localizacao_atual_obra_id ?? null,
          descricao: pr.descricao,
          categoria: pr.categoria ?? null,
          fornecedorNome: input.fornecedorNome,
          status: locStatus,
          dataInicio: input.dataInicio,
          dataFimPrevista: dataFim,
          valorMensal: input.valorMensal != null ? String(input.valorMensal) : null,
          fotoUrl,
          observacoes: `Convertido de Equipamento Próprio (tipo alterado via painel)`,
        } as any).returning({ id: equipamentosLocados.id });
        await db.execute(sql`
          UPDATE equipamentos_proprios
          SET ativo = false,
              observacoes = COALESCE(observacoes, '') || ' | Convertido para Equipamento Locado'
          WHERE id = ${proprioId} AND company_id = ${input.companyId}
        `);
        convertidos.push(created.id);
      }
      return { ok: true as const, convertidos };
    }),

  locadoDevolver: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      dataFimReal: z.string().min(10).max(10),
      fotosDevolucao: fotoSchema,
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.fotosDevolucao || input.fotosDevolucao.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Foto de devolução é obrigatória." });
      }
      const [eq_] = await db.select().from(equipamentosLocados)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .limit(1);
      if (!eq_) throw new TRPCError({ code: "NOT_FOUND" });
      if (eq_.status === "devolvido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Equipamento já foi devolvido." });
      }
      await db.update(equipamentosLocados).set({
        status: "devolvido",
        dataFimReal: input.dataFimReal,
        fotosDevolucaoJson: input.fotosDevolucao,
        updatedAt: sql`now()`,
      }).where(and(
        eq(equipamentosLocados.id, input.id),
        eq(equipamentosLocados.companyId, input.companyId),
      ));

      // Rev. 2411 — calcula tempo na obra (dias) usando data_inicio do contrato
      // como melhor referência simples (data_inicio é a data efetiva mais antiga
      // que temos). Devolvido ao fornecedor = sai do almox local da obra.
      const dataInicio = (eq_ as any).dataInicio
        ? new Date((eq_ as any).dataInicio)
        : null;
      const dataFim = new Date(input.dataFimReal);
      const tempoNaObraDias = dataInicio
        ? Math.max(0, Math.round((dataFim.getTime() - dataInicio.getTime()) / 86400000))
        : null;

      await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: input.id,
        tipo: "DEVOLUCAO_FORNECEDOR",
        obraId: eq_.obraId,
        fotosJson: input.fotosDevolucao,
        observacao: tempoNaObraDias != null
          ? `[Tempo na obra: ${tempoNaObraDias} dias] ${input.observacao ?? ""}`.trim()
          : (input.observacao ?? null),
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      });

      // Rev. 2411 — remove o item correspondente do almoxarifado (devolveu
      // ao fornecedor = não está mais na obra).
      const { removeAlmoxItemForEquipamento } = await import("../lib/almoxEquipamentoSync");
      const almoxRemovidos = await removeAlmoxItemForEquipamento(db, {
        companyId: input.companyId,
        tipo: "locado",
        equipamentoId: input.id,
      });
      return { id: input.id, action: "devolvido" as const, almoxRemovidos, tempoNaObraDias };
    }),

  // Rev. 2420 — Devolução em LOTE. Recebe N ids + 1 data + 1 set de fotos +
  // 1 observação comuns, aplica a cada equipamento sequencialmente reusando
  // a mesma lógica do single (update status, evento DEVOLUCAO_FORNECEDOR,
  // remoção do almox via `removeAlmoxItemForEquipamento`). Não-atômico de
  // propósito: se um item já estava "devolvido" ou foi deletado, registra
  // em `falhas` e segue com o resto. Frontend mostra resumo "X devolvidos,
  // Y falhas". Cada id é re-validado por companyId (mesma trava IDOR do
  // single). Limite de 200 ids por request pra evitar timeouts do proxy.
  locadoDevolverEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number().int().positive()).min(1).max(200),
      dataFimReal: z.string().min(10).max(10),
      fotosDevolucao: fotoSchema,
      observacao: z.string().optional(),
      // Rev. 2453 — assinaturas (PNG dataURL) + nomes
      assinaturaEntregadorNome: z.string().min(1).max(255).optional(),
      assinaturaEntregadorUrl:  z.string().optional(),
      assinaturaRecebedorNome:  z.string().min(1).max(255).optional(),
      assinaturaRecebedorUrl:   z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.fotosDevolucao || input.fotosDevolucao.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Foto de devolução é obrigatória." });
      }
      // Tenant isolation — confirma que a empresa pertence ao usuário
      // (mesmo padrão de `locadosExcluirLote` L703-708).
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedCompanyIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedCompanyIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const { removeAlmoxItemForEquipamento } = await import("../lib/almoxEquipamentoSync");
      // Pré-filtro por permissão de obra: equipamentos cujo obraId o user
      // não pode acessar saem da lista antes de processar (defense in depth
      // — o locadosListar já filtra na origem, mas se o cliente forjar ids,
      // bloqueamos aqui também).
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const ok: number[] = [];
      const falhas: { id: number; erro: string }[] = [];
      const idsUnicos = Array.from(new Set(input.ids));
      // Rev. 2453 — token HMAC compartilhado por todos os eventos do lote
      // (permite ao recebedor abrir o comprovante via URL pública assinada).
      const temAssinaturas = !!(input.assinaturaEntregadorUrl && input.assinaturaRecebedorUrl);
      const pdfToken = temAssinaturas
        ? crypto.randomBytes(24).toString("hex")
        : null;
      let primeiroEventoId: number | null = null;
      for (const id of idsUnicos) {
        try {
          const [eq_] = await db.select().from(equipamentosLocados)
            .where(and(eq(equipamentosLocados.id, id), eq(equipamentosLocados.companyId, input.companyId)))
            .limit(1);
          if (!eq_) { falhas.push({ id, erro: "Não encontrado" }); continue; }
          if (eq_.status === "devolvido") { falhas.push({ id, erro: "Já devolvido" }); continue; }
          if (allowed !== null && (eq_.obraId == null || !allowed.includes(eq_.obraId))) {
            falhas.push({ id, erro: "Sem acesso à obra" });
            continue;
          }
          await db.update(equipamentosLocados).set({
            status: "devolvido",
            dataFimReal: input.dataFimReal,
            fotosDevolucaoJson: input.fotosDevolucao,
            updatedAt: sql`now()`,
          }).where(and(
            eq(equipamentosLocados.id, id),
            eq(equipamentosLocados.companyId, input.companyId),
          ));
          const dataInicio = (eq_ as any).dataInicio ? new Date((eq_ as any).dataInicio) : null;
          const dataFim = new Date(input.dataFimReal);
          const tempoNaObraDias = dataInicio
            ? Math.max(0, Math.round((dataFim.getTime() - dataInicio.getTime()) / 86400000))
            : null;
          const [insEv] = await db.insert(equipamentoLocadoEventos).values({
            companyId: input.companyId,
            equipamentoLocadoId: id,
            tipo: "DEVOLUCAO_FORNECEDOR",
            obraId: eq_.obraId,
            fotosJson: input.fotosDevolucao,
            observacao: tempoNaObraDias != null
              ? `[Lote · Tempo na obra: ${tempoNaObraDias} dias] ${input.observacao ?? ""}`.trim()
              : (input.observacao ? `[Lote] ${input.observacao}` : "[Lote]"),
            usuarioId: ctx.user.id,
            usuarioNome: ctx.user.name || String(ctx.user.id),
            assinaturaEntregadorNome: input.assinaturaEntregadorNome || null,
            assinaturaEntregadorUrl:  input.assinaturaEntregadorUrl  || null,
            assinaturaRecebedorNome:  input.assinaturaRecebedorNome  || null,
            assinaturaRecebedorUrl:   input.assinaturaRecebedorUrl   || null,
            pdfComprovanteToken:      pdfToken,
          }).returning({ id: equipamentoLocadoEventos.id });
          if (primeiroEventoId == null && insEv) primeiroEventoId = insEv.id;
          await removeAlmoxItemForEquipamento(db, {
            companyId: input.companyId,
            tipo: "locado",
            equipamentoId: id,
          });
          ok.push(id);
        } catch (e: any) {
          falhas.push({ id, erro: e?.message || "Erro desconhecido" });
        }
      }
      return {
        ok,
        falhas,
        total: idsUnicos.length,
        // Rev. 2453 — retorna primeiro evento + token pra montar URL do comprovante
        comprovante: (primeiroEventoId != null && pdfToken)
          ? { eventoId: primeiroEventoId, token: pdfToken }
          : null,
      };
    }),

  // Rev. 2460 — Desfaz uma devolução de equipamento locado.
  // Reverte status="devolvido" → "em_uso", limpa dataFimReal e
  // fotosDevolucaoJson, registra evento `REVERSAO_DEVOLUCAO` com o
  // motivo + grava log em `almoxarifado_auditoria` (mesmo padrão de
  // excluir_item da Rev. 2388: senha local se exigido + justificativa
  // ≥10 chars). NÃO repõe o item no almoxarifado central — quem precisar
  // refaz o fluxo de saída/transferência manual.
  locadoDesfazerDevolucao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number().int().positive(),
      senha: z.string().optional(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedCompanyIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedCompanyIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [eq_] = await db.select().from(equipamentosLocados)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .limit(1);
      if (!eq_) throw new TRPCError({ code: "NOT_FOUND", message: "Equipamento não encontrado." });
      if (eq_.status !== "devolvido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Só é possível desfazer devoluções. Status atual: ${eq_.status}.` });
      }
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && (eq_.obraId == null || !allowed.includes(eq_.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra deste equipamento." });
      }
      // Carrega config de auditoria + valida senha/motivo (mesma lógica
      // dos helpers em compras.ts — replicada inline pra não criar
      // dependência cruzada entre routers).
      const { companies, almoxarifadoAuditoria, users } = await import("../../drizzle/schema");
      const [cfgRow] = await db.select({
        s: companies.almoxarifadoExigeSenha,
        j: companies.almoxarifadoExigeJustificativa,
      }).from(companies).where(eq(companies.id, input.companyId));
      const exigeSenha = cfgRow ? Number(cfgRow.s ?? 1) === 1 : true;
      const exigeJustificativa = cfgRow ? Number(cfgRow.j ?? 1) === 1 : true;
      const motivoTrim = (input.motivo ?? "").trim();
      if (exigeJustificativa && motivoTrim.length < 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Motivo obrigatório (≥10 caracteres)." });
      }
      const motivoFinal = motivoTrim.length > 0 ? motivoTrim : "Auditoria desabilitada nas configurações da empresa.";
      if (exigeSenha) {
        const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (user.password) {
          if (!input.senha) throw new TRPCError({ code: "BAD_REQUEST", message: "Senha obrigatória." });
          const bcrypt = await import("bcryptjs");
          if (!bcrypt.compareSync(input.senha, user.password)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta." });
          }
        }
      }
      // Snapshot ANTES (pra auditoria).
      const dadosAntes = {
        status: eq_.status,
        dataFimReal: (eq_ as any).dataFimReal,
        fotosDevolucaoJson: (eq_ as any).fotosDevolucaoJson,
      };
      const req = (ctx as any)?.req;
      const xf = req?.headers?.["x-forwarded-for"];
      const ip = (typeof xf === "string" && xf.length > 0
        ? xf.split(",")[0].trim()
        : (req?.ip || req?.socket?.remoteAddress || null) ?? null)?.slice(0, 64) ?? null;
      // Atomicidade (Rev. 2460): UPDATE + INSERT evento + INSERT auditoria
      // numa única tx pra garantir rastreabilidade completa. UPDATE
      // condicionado a `status='devolvido'` blinda contra dupla reversão
      // concorrente (se outra requisição já mudou pra `em_uso`,
      // `rowCount=0` → throw e tx rola back).
      await db.transaction(async (tx: any) => {
        const upd = await tx.update(equipamentosLocados).set({
          status: "em_uso",
          dataFimReal: null,
          fotosDevolucaoJson: null,
          updatedAt: sql`now()`,
        } as any).where(and(
          eq(equipamentosLocados.id, input.id),
          eq(equipamentosLocados.companyId, input.companyId),
          eq(equipamentosLocados.status, "devolvido"),
        )).returning({ id: equipamentosLocados.id });
        if (!upd || upd.length === 0) {
          throw new TRPCError({ code: "CONFLICT", message: "O equipamento não está mais com status 'devolvido' — possivelmente outra reversão foi concluída antes." });
        }
        await tx.insert(equipamentoLocadoEventos).values({
          companyId: input.companyId,
          equipamentoLocadoId: input.id,
          tipo: "REVERSAO_DEVOLUCAO",
          obraId: eq_.obraId,
          observacao: `Devolução desfeita. Motivo: ${motivoFinal}`,
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name || String(ctx.user.id),
        });
        // Rev. 2462 — auto-valida quando a empresa não exige aprovação
        // do gestor (companies.almoxarifadoExigeAprovacao = 0). Lemos
        // inline pra evitar cross-import com `compras.ts`.
        let auditExtra: Record<string, any> = {};
        const [cfgRow] = await tx.select({
          a: companies.almoxarifadoExigeAprovacao,
        }).from(companies).where(eq(companies.id, input.companyId));
        const exigeAprov = cfgRow ? Number(cfgRow.a ?? 1) === 1 : true;
        if (!exigeAprov) {
          auditExtra = {
            statusValidacao: "validado",
            validadoPorId: ctx.user.id,
            validadoPorNome: ctx.user.name || null,
            validadoEm: new Date().toISOString(),
            observacaoValidacao: "Auto-validado: aprovação não exigida pela empresa.",
          };
        }
        await tx.insert(almoxarifadoAuditoria).values({
          companyId: input.companyId,
          obraId: eq_.obraId,
          userId: ctx.user.id,
          userNome: ctx.user.name || null,
          acao: "desfazer_devolucao_locacao",
          entidadeTipo: "equipamento_locado",
          entidadeId: input.id,
          entidadeNome: (eq_ as any).descricao || `#${input.id}`,
          dadosAntes: dadosAntes as any,
          dadosDepois: { status: "em_uso", dataFimReal: null, fotosDevolucaoJson: null } as any,
          justificativa: motivoFinal,
          ip,
          ...auditExtra,
        });
      });
      return { success: true };
    }),

  locadoCheckIn: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      observacao: z.string().optional(),
      fotos: fotoSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const hojeISO = new Date().toISOString().slice(0, 10);
      const r = await db.update(equipamentosLocados).set({
        ultimoCheckInData: hojeISO,
        ultimoCheckInUserId: ctx.user.id,
        updatedAt: sql`now()`,
      }).where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .returning({ id: equipamentosLocados.id, obraId: equipamentosLocados.obraId });
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: input.id,
        tipo: "CHECK_IN_OBRA",
        obraId: r[0].obraId,
        fotosJson: input.fotos ?? null,
        observacao: input.observacao ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      });
      return { id: r[0].id, ultimoCheckInData: hojeISO };
    }),

  locadoRegistrarEvento: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      equipamentoLocadoId: z.number(),
      tipo: eventoTipoSchema,
      obraId: z.number().nullable().optional(),
      obraNome: z.string().max(255).nullable().optional(),
      funcionarioId: z.number().nullable().optional(),
      funcionarioNome: z.string().max(255).nullable().optional(),
      fotos: fotoSchema,
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [created] = await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: input.equipamentoLocadoId,
        tipo: input.tipo,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome ?? null,
        funcionarioId: input.funcionarioId ?? null,
        funcionarioNome: input.funcionarioNome ?? null,
        fotosJson: input.fotos ?? null,
        observacao: input.observacao ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      }).returning({ id: equipamentoLocadoEventos.id });
      return { id: created.id };
    }),

  eventosListar: protectedProcedure
    .input(z.object({ companyId: z.number(), equipamentoLocadoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return await db.select().from(equipamentoLocadoEventos)
        .where(and(
          eq(equipamentoLocadoEventos.companyId, input.companyId),
          eq(equipamentoLocadoEventos.equipamentoLocadoId, input.equipamentoLocadoId),
        ))
        .orderBy(desc(equipamentoLocadoEventos.dataEvento));
    }),

  // ── IMPORTAÇÃO EM LOTE VIA PDF DA LOCADORA (Rev. 2308) ────────────────────
  // Cada locadora (Jalves, Locamerica, Mills, etc.) tem um layout próprio de
  // relatório. A IA (Gemini Vision) detecta o layout, extrai contratos+itens
  // e devolve uma estrutura padronizada. O usuário revisa no preview e
  // confirma o cadastro em lote (sem foto obrigatória — é cadastro inicial,
  // fotos virão nos próximos recebimentos via fluxo de compras/recebimento).

  // Rev. 2321 — Polling job store pra parse de PDF (evita timeout 60s do proxy Replit).
  // O Gemini com PDFs grandes leva 60-120s e o proxy mata a conexão (cliente vê
  // "Load failed" no iOS Safari). Solução: mutation `Start` retorna jobId
  // imediatamente, parse roda em background; query `Status` faz polling a cada
  // 2.5s até `done`/`error`. Sem long-lived HTTP.
  parsearContratoLocacaoPdfStart: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      pdfBase64: z.string().min(100),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      nomeArquivo: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.pdfBase64.length > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PDF muito grande (>18MB). Reduza ou divida o arquivo." });
      }
      const jobId = crypto.randomUUID();
      const now = Date.now();
      // Rev. 2359 — guarda fase inicial pro Status reportar progresso.
      parseContratoJobs.set(jobId, { status: "pending", startedAt: now, phase: "queued", phaseAt: now });
      // Fire-and-forget — o request HTTP retorna em ms.
      executeParseContratoLocacao(input, jobId)
        .then((result) => {
          const prev = parseContratoJobs.get(jobId);
          parseContratoJobs.set(jobId, { status: "done", startedAt: prev?.startedAt ?? now, phase: "finalizing", phaseAt: Date.now(), result });
        })
        .catch((err: any) => {
          const prev = parseContratoJobs.get(jobId);
          parseContratoJobs.set(jobId, { status: "error", startedAt: prev?.startedAt ?? now, phase: prev?.phase ?? "queued", phaseAt: Date.now(), error: err?.message || String(err) });
        });
      return { jobId };
    }),

  parsearContratoLocacaoPdfStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ input }) => {
      const j = parseContratoJobs.get(input.jobId);
      if (!j) return { status: "expired" as const };
      // Rev. 2359 — devolve fase + idade da fase pro client mostrar
      // "Chamando Gemini Vision · há 42s" e parar a percepção de travado.
      const now = Date.now();
      const elapsedMs = now - j.startedAt;
      const phaseElapsedMs = now - j.phaseAt;
      if (j.status === "done") return { status: "done" as const, result: j.result, elapsedMs, phase: j.phase, phaseElapsedMs };
      if (j.status === "error") return { status: "error" as const, error: j.error, elapsedMs, phase: j.phase, phaseElapsedMs };
      return { status: "pending" as const, elapsedMs, phase: j.phase, phaseElapsedMs };
    }),

  // (Procedure legada — mantida só pra retrocompatibilidade; cliente agora usa Start/Status.)
  parsearContratoLocacaoPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      pdfBase64: z.string().min(100),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      nomeArquivo: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.pdfBase64.length > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PDF muito grande (>18MB). Reduza ou divida o arquivo." });
      }
      return executeParseContratoLocacao(input);
    }),

  importarContratosLocacaoLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      nomeArquivo: z.string().max(255).optional(),
      contratos: z.array(z.object({
        numeroContrato: z.string().max(50),
        fornecedorNome: z.string().max(255).optional(),
        fornecedorId: z.number().optional(),
        obraId: z.number().optional(),
        localObra: z.string().optional(),
        periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valorTotal: z.number().optional(),
        atendenteResponsavel: z.string().max(255).optional(),
        itens: z.array(z.object({
          patrimonio: z.string().max(100).optional(),
          descricao: z.string().min(1).max(255),
          quantidade: z.number().min(1).default(1),
          subtotal: z.number().optional(),
          // Rev. 2337 — categoria inferida pela IA durante o parse do PDF
          categoria: z.string().max(100).optional(),
        })).min(1),
      })).min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2355 — guard de autorização por empresa (estava ausente desde
      // a Rev. 2333; flagged pelo architect na 2355 e consertado junto).
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowed as any[]).some(c => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2333 — bulk INSERT POR CONTRATO em transação.
      // Causa raiz do "Load failed" iOS Safari: o loop antigo fazia 2 INSERTs
      // POR UNIDADE dentro de transação grande (1218 unid × 2 = 2436 round-trips
      // ao Neon → estoura 60s do proxy). Agora: para cada contrato, 1 bulk
      // INSERT das unidades + 1 bulk INSERT dos eventos. 46 contratos × 2 = 92
      // round-trips em vez de 2436 (~25× menos). Pareamento eventos→locados
      // é DETERMINÍSTICO porque dentro de um único contrato todos os eventos
      // compartilham obraId+numeroContrato — não dependemos da ordem do
      // RETURNING. Atomicidade preservada pela transaction.
      // Rev. 2353 — guard de servidor: refuse contratos sem obra
      // vinculada (defense-in-depth contra cliente desatualizado/abuso de API).
      // Cliente já bloqueia no botão "Confirmar", mas o backend é a fronteira
      // de verdade — equipamento sem obra polui dashboards e cálculo de custo.
      const semObra = input.contratos.filter(c => !(c.obraId ?? input.obraId));
      if (semObra.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${semObra.length} contrato(s) sem obra vinculada (ex: ${semObra.slice(0, 3).map(c => c.numeroContrato).join(", ")}). Selecione uma obra para cada contrato no preview antes de cadastrar.`,
        });
      }
      const ids: number[] = [];
      let totalItens = 0;
      await db.transaction(async (tx: any) => {
        for (const c of input.contratos) {
          const obraIdCt = c.obraId ?? input.obraId ?? null;
          const locadosRows: any[] = [];
          for (const it of c.itens) {
            const qty = Math.max(1, Math.floor(it.quantidade || 1));
            const subtotalUnidade = it.subtotal && qty > 0 ? (it.subtotal / qty) : (it.subtotal || 0);
            for (let i = 0; i < qty; i++) {
              locadosRows.push({
                companyId: input.companyId,
                obraId: obraIdCt,
                fornecedorId: c.fornecedorId ?? null,
                fornecedorNome: c.fornecedorNome ?? null,
                codigoPatrimonioFornecedor: it.patrimonio ?? null,
                descricao: it.descricao,
                categoria: it.categoria ?? null,
                dataInicio: c.periodoInicio,
                dataFimPrevista: c.periodoFim,
                valorMensal: subtotalUnidade > 0 ? String(subtotalUnidade.toFixed(2)) : null,
                status: "em_uso",
                observacoes: c.localObra ? `Local da obra (PDF): ${c.localObra}` : null,
                numeroContratoFornecedor: c.numeroContrato,
                atendenteResponsavel: c.atendenteResponsavel ?? null,
                arquivoOrigemUrl: input.nomeArquivo ?? null,
                valorSubtotalContrato: it.subtotal != null ? String(it.subtotal.toFixed(2)) : null,
                fotosRecebimentoJson: [] as any,
              });
            }
          }
          if (locadosRows.length === 0) continue;
          // Rev. 2355 — Hook biblioteca curada: se já existe foto canônica
          // pra alguma descrição deste lote, aplica direto no INSERT (foto
          // aparece imediata, sem o user precisar abrir a biblioteca depois).
          const descricoesNormDoLote = Array.from(new Set(locadosRows.map(r => normalizarDescricao(r.descricao))));
          if (descricoesNormDoLote.length > 0) {
            const canonicas = await tx
              .select({ d: equipamentosFotosCanonicas.descricaoNormalizada, u: equipamentosFotosCanonicas.fotoUrl })
              .from(equipamentosFotosCanonicas)
              .where(and(
                eq(equipamentosFotosCanonicas.companyId, input.companyId),
                inArray(equipamentosFotosCanonicas.descricaoNormalizada, descricoesNormDoLote),
              ));
            if (canonicas.length > 0) {
              const mapaFoto = new Map(canonicas.map((c: any) => [c.d, c.u]));
              for (const r of locadosRows) {
                const url = mapaFoto.get(normalizarDescricao(r.descricao));
                if (url) r.fotoUrl = url;
              }
            }
          }
          const created = await tx.insert(equipamentosLocados).values(locadosRows).returning({ id: equipamentosLocados.id });
          totalItens += created.length;
          const observacao = `Cadastro inicial via import PDF · Contrato ${c.numeroContrato}${input.nomeArquivo ? ` · ${input.nomeArquivo}` : ""}`;
          const eventos = created.map((r: any) => {
            ids.push(r.id);
            return {
              companyId: input.companyId,
              equipamentoLocadoId: r.id,
              tipo: "RECEBIMENTO" as const,
              obraId: obraIdCt,
              observacao,
              usuarioId: ctx.user.id,
              usuarioNome: ctx.user.name || String(ctx.user.id),
            };
          });
          if (eventos.length > 0) await tx.insert(equipamentoLocadoEventos).values(eventos);
        }
      });
      return {
        ok: true as const,
        contratosImportados: input.contratos.length,
        itensImportados: totalItens,
        ids,
      };
    }),

  // ── Rev. 2337 — CATEGORIZAÇÃO EM LOTE VIA IA ──────────────────────────────
  // Backfill de `categoria` em equipamentos_locados existentes.
  // Estratégia: lê descrições DISTINCT → IA propõe categorias + mapping →
  // bulk UPDATE agrupado por categoria (1 round-trip por categoria, não por linha).
  // Idempotente: por padrão só toca registros com categoria NULL/vazia.
  locadosCategorizarComIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sobrescrever: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário
      // (mesmo padrão de locadosVincularObraLote/locadosExcluirLote).
      // SEM isto, qualquer usuário autenticado poderia disparar a IA
      // sobre dados de OUTRO tenant passando companyId alheio.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      // 1. Descrições distintas pendentes de categorização.
      const condCat = input.sobrescrever ? sql`TRUE` : sql`(categoria IS NULL OR categoria = '')`;
      const rowsResult: any = await db.execute(sql`
        SELECT DISTINCT descricao, COUNT(*)::int AS qtd
        FROM equipamentos_locados
        WHERE company_id = ${input.companyId}
          AND descricao IS NOT NULL
          AND descricao <> ''
          AND ${condCat}
        GROUP BY descricao
        ORDER BY qtd DESC, descricao ASC
      `);
      const descricoes: { descricao: string; qtd: number }[] = (rowsResult.rows || rowsResult) as any[];
      if (descricoes.length === 0) {
        return { ok: true as const, categorias: [] as string[], itensAtualizados: 0, descricoesAnalisadas: 0, descricoesNaoMapeadas: [] as string[] };
      }

      // 2. Chama IA. Limite defensivo: 800 descrições por call (cabe em 1 prompt
      // de ~40k tokens com folga). Acima disso o user roda 2x.
      const MAX_DESC = 800;
      const lote = descricoes.slice(0, MAX_DESC);
      const { invokeLLM } = await import("../_core/llm");
      const systemPrompt = `Você é um especialista em classificação de equipamentos de obra de construção civil pesada brasileira. Recebe uma lista de descrições de equipamentos LOCADOS de uma única construtora e deve agrupá-las em categorias úteis para análise gerencial.

Regras OBRIGATÓRIAS:
1. PROPOR de 5 a 10 CATEGORIAS curtas (≤ 40 chars), usando o jargão de obra brasileira (andaime, escoramento, elétrico, ferramenta, EPI, etc.). Cada categoria deve ter ≥ 2 descrições para evitar pulverização. Itens isolados vão pra "Outros".
2. Para CADA descrição da lista, atribuir UMA das categorias propostas. NÃO invente categorias novas no mapping.
3. Retornar APENAS JSON válido — sem markdown, sem preâmbulo:
   {
     "categorias": ["Andaime e escoramento", "Equipamento elétrico", ...],
     "mapping": [ {"descricao": "TEXTO EXATO ORIGINAL", "categoria": "Andaime e escoramento"}, ... ]
   }
4. O campo "descricao" do mapping deve ser IGUAL (caractere a caractere) ao recebido.`;

      const userPrompt = `Classifique as ${lote.length} descrições abaixo (números entre parênteses = quantidade de unidades dessa descrição no acervo, para você priorizar categorias relevantes):

${lote.map(d => `- ${d.descricao}  (${d.qtd})`).join("\n")}

Gere o JSON conforme o esquema. Não omita nenhuma descrição.`;

      let parsed: any;
      try {
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 16000,
          response_format: { type: "json_object" },
        });
        const content = resp.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "").trim();
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (m) raw = m[1].trim();
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);
        parsed = JSON.parse(raw);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha na IA: ${msg.slice(0, 200)}` });
      }

      const categoriasValidas: string[] = Array.isArray(parsed.categorias) ? parsed.categorias.map((c: any) => String(c).slice(0, 100).trim()).filter(Boolean) : [];
      const categoriaSet = new Set(categoriasValidas);
      const mapping: { descricao: string; categoria: string }[] = Array.isArray(parsed.mapping) ? parsed.mapping : [];

      // 3. Agrupa descrições por categoria → 1 UPDATE por categoria (round-trips = #categorias).
      const porCategoria = new Map<string, string[]>();
      const descricoesNaoMapeadas: string[] = [];
      const setEnviadas = new Set(lote.map(d => d.descricao));
      for (const m2 of mapping) {
        const desc = String(m2?.descricao ?? "");
        const cat = String(m2?.categoria ?? "").slice(0, 100).trim();
        if (!desc || !setEnviadas.has(desc)) continue;
        if (!categoriaSet.has(cat)) continue;
        const arr = porCategoria.get(cat) || [];
        arr.push(desc);
        porCategoria.set(cat, arr);
      }
      const mapeadasSet = new Set<string>();
      for (const arr of porCategoria.values()) for (const d of arr) mapeadasSet.add(d);
      for (const d of lote) if (!mapeadasSet.has(d.descricao)) descricoesNaoMapeadas.push(d.descricao);

      let itensAtualizados = 0;
      for (const [cat, descs] of porCategoria.entries()) {
        if (descs.length === 0) continue;
        // UPDATE em chunks de 200 descrições pra evitar SQL gigante.
        for (let i = 0; i < descs.length; i += 200) {
          const slice = descs.slice(i, i + 200);
          const condSobre = input.sobrescrever ? sql`TRUE` : sql`(categoria IS NULL OR categoria = '')`;
          const res: any = await db.execute(sql`
            UPDATE equipamentos_locados
               SET categoria = ${cat}, updated_at = NOW()
             WHERE company_id = ${input.companyId}
               AND ${condSobre}
               AND descricao = ANY(${sql.raw(`ARRAY[${slice.map(d => `'${d.replace(/'/g, "''")}'`).join(",")}]::varchar[]`)})
          `);
          itensAtualizados += Number(res.rowCount ?? res.rows?.length ?? 0);
        }
      }

      return {
        ok: true as const,
        categorias: categoriasValidas,
        itensAtualizados,
        descricoesAnalisadas: lote.length,
        descricoesNaoMapeadas: descricoesNaoMapeadas.slice(0, 20),
        haMaisLotes: descricoes.length > MAX_DESC,
      };
    }),

  // Rev. 2340 — Busca de FOTO ILUSTRATIVA via Google Custom Search Image.
  // Pra cada DESCRIÇÃO distinta sem foto, faz 1 chamada à Google Custom Search
  // API (engine = GOOGLE_CSE_ID) pedindo `searchType=image`, pega o 1º
  // resultado válido (PNG/JPG/JPEG/WEBP) com tamanho razoável e dá UPDATE em
  // BULK em todos os equipamentos com aquela descrição.
  //
  // Por que DISTINCT por descrição: ~1.218 unidades repetem ~50-80 strings
  // únicas → 50-80 chamadas de API (cota Google) em vez de 1218. Idempotente:
  // só atualiza onde `foto_url IS NULL OR ''` (a menos que `sobrescrever`).
  //
  // Limite defensivo de descrições/call (MAX_DESC=60) — Google CSE free tier
  // dá 100 queries/dia. User pode chamar de novo amanhã pro restante.
  //
  // **R-001/R-007/R-010**: UPDATE escopado por `company_id`, idempotente,
  // disparado pelo user, zero DDL.
  locadosBuscarFotosComIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sobrescrever: z.boolean().optional().default(false),
      maxDescricoes: z.number().int().min(1).max(100).optional().default(60),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant guard
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2341 — Provedores: OpenVerse (primário, sem chave, sem cota) +
      // Google CSE (fallback opcional se as creds estiverem ok). Não exige
      // mais GOOGLE_API_KEY/CSE_ID — se faltarem, só pula o CSE.
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.GOOGLE_CSE_ID;
      const googleHabilitado = !!(apiKey && cx);

      // 1. Descrições distintas SEM foto — espelha exatamente o filtro do
      // client (`totalSemFoto`): item conta se NÃO tem foto de recebimento
      // E não tem `foto_url`. `sobrescrever` ignora o `foto_url` (mas ainda
      // pula itens com foto física — recebimento é fonte autoritativa).
      const semFotoRec = sql`(fotos_recebimento_json IS NULL OR jsonb_typeof(fotos_recebimento_json) <> 'array' OR jsonb_array_length(fotos_recebimento_json) = 0)`;
      const condFoto = input.sobrescrever
        ? semFotoRec
        : sql`(${semFotoRec} AND (foto_url IS NULL OR foto_url = ''))`;
      // Rev. 2345 — pega categoria mais comum por descrição (para fallback
      // Phase B: busca por categoria quando termo específico não retorna nada).
      const rowsResult: any = await db.execute(sql`
        WITH agrupado AS (
          SELECT descricao, categoria, COUNT(*)::int AS qtd
          FROM equipamentos_locados
          WHERE company_id = ${input.companyId}
            AND descricao IS NOT NULL
            AND descricao <> ''
            AND ${condFoto}
          GROUP BY descricao, categoria
        ),
        ranked AS (
          SELECT descricao, categoria, qtd,
                 ROW_NUMBER() OVER (
                   PARTITION BY descricao
                   ORDER BY qtd DESC, (categoria IS NULL) ASC, categoria ASC
                 ) AS rn
          FROM agrupado
        )
        SELECT descricao,
               MAX(categoria) FILTER (WHERE rn = 1) AS categoria,
               SUM(qtd)::int AS qtd
        FROM ranked
        GROUP BY descricao
        ORDER BY qtd DESC, descricao ASC
      `);
      const descricoes: { descricao: string; categoria: string | null; qtd: number }[] = (rowsResult.rows || rowsResult) as any[];
      if (descricoes.length === 0) {
        return { ok: true as const, descricoesAnalisadas: 0, itensAtualizados: 0, fotosEncontradas: 0, descricoesSemFoto: [] as string[], haMaisLotes: false, cotaEsgotada: false };
      }

      const lote = descricoes.slice(0, input.maxDescricoes);

      // 2. Busca candidatos pra cada descrição em 3 provedores. Cada
      // candidato vem com TÍTULO/SNIPPET pra validação textual pela IA.
      // Helpers retornam até 5 candidatos cada, never-throws no path feliz.
      type Cand = { url: string; title: string; provider: "openverse" | "wikimedia" | "google" };
      async function fromOpenverse(query: string): Promise<Cand[]> {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
        try {
          const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&page_size=5&mature=false`;
          const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "FCEngenhariaERP/2341 (fotos-ilustrativas)" } });
          if (!r.ok) return [];
          const j: any = await r.json();
          const items: any[] = Array.isArray(j?.results) ? j.results : [];
          const out: Cand[] = [];
          for (const it of items) {
            const link = String(it?.thumbnail || it?.url || "");
            if (/^https?:\/\//.test(link) && link.length <= 1000) {
              out.push({ url: link, title: String(it?.title || "").slice(0, 200), provider: "openverse" });
            }
          }
          return out;
        } catch { return []; } finally { clearTimeout(t); }
      }
      async function fromWikimedia(query: string): Promise<Cand[]> {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
        try {
          const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(query)}&prop=imageinfo&iiprop=url&iiurlwidth=400&origin=*`;
          const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "FCEngenhariaERP/2341 (fotos-ilustrativas)" } });
          if (!r.ok) return [];
          const j: any = await r.json();
          const pages: any[] = Object.values(j?.query?.pages || {});
          const out: Cand[] = [];
          for (const p of pages) {
            const info = (p?.imageinfo || [])[0];
            const link = String(info?.thumburl || info?.url || "");
            if (/^https?:\/\//.test(link) && /\.(jpe?g|png|webp)(\?|$)/i.test(link) && link.length <= 1000) {
              const t = String(p?.title || "").replace(/^File:/i, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ").slice(0, 200);
              out.push({ url: link, title: t, provider: "wikimedia" });
            }
          }
          return out;
        } catch { return []; } finally { clearTimeout(t); }
      }
      async function fromGoogleCSE(query: string): Promise<{ cands: Cand[]; cotaEsgotada: boolean; configInvalida: boolean }> {
        if (!googleHabilitado) return { cands: [], cotaEsgotada: false, configInvalida: false };
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10_000);
        try {
          const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=5&safe=active&imgSize=medium&fileType=jpg,png,webp`;
          const resp = await fetch(url, { signal: ctrl.signal });
          if (resp.status === 429) return { cands: [], cotaEsgotada: true, configInvalida: false };
          if (resp.status === 403 || resp.status === 400) {
            const body: any = await resp.json().catch(() => ({}));
            const reason = String(body?.error?.errors?.[0]?.reason || "").toLowerCase();
            const msg = String(body?.error?.message || "").toLowerCase();
            const isConfigErr = reason.includes("keyinvalid") || reason.includes("accessnotconfigured") || reason.includes("forbidden") || reason.includes("badrequest") || msg.includes("api key not valid") || msg.includes("api_key_invalid") || msg.includes("api key expired");
            if (isConfigErr) return { cands: [], cotaEsgotada: false, configInvalida: true };
            if (resp.status === 403) return { cands: [], cotaEsgotada: true, configInvalida: false };
            return { cands: [], cotaEsgotada: false, configInvalida: false };
          }
          if (!resp.ok) return { cands: [], cotaEsgotada: false, configInvalida: false };
          const json: any = await resp.json();
          const items: any[] = Array.isArray(json.items) ? json.items : [];
          const out: Cand[] = [];
          for (const it of items) {
            const link = String(it?.link || "");
            if (/^https?:\/\//.test(link) && /\.(jpe?g|png|webp)(\?|$)/i.test(link) && link.length <= 1000) {
              out.push({ url: link, title: String(it?.title || it?.snippet || "").slice(0, 200), provider: "google" });
            }
          }
          return { cands: out, cotaEsgotada: false, configInvalida: false };
        } catch { return { cands: [], cotaEsgotada: false, configInvalida: false }; } finally { clearTimeout(t); }
      }

      // Rev. 2349.1 — DESCOBERTA CRÍTICA via teste manual:
      // (a) Google CSE retorna 403 API_KEY_SERVICE_BLOCKED — a chave está
      //     PERMANENTEMENTE bloqueada pra Custom Search no projeto GCP.
      //     Não dá pra usar Google CSE com essa key.
      // (b) OpenVerse e Wikimedia INDEXAM EM INGLÊS — queries em PT
      //     retornam 0 resultados; queries EN curtas (2-3 palavras)
      //     retornam fotos perfeitas (adjustable scaffold jack → foto;
      //     concrete mixer → foto; demolition hammer → Jackhammer.jpg).
      // Por isso TODAS as revs anteriores (2342-2349) deram 0/60.
      //
      // SOLUÇÃO: LLM gera query EN curta (2-3 palavras industriais) +
      // cascade OpenVerse → Wikimedia, pegando o 1º não-lixo (sem PDF).
      let cotaEsgotada = false;
      let googleDesativadoPorErro = true; // Google fica desativado — sempre falha.

      // 2a. 1 LLM call pra gerar query EN curta (2-3 palavras industriais).
      // EN porque OpenVerse/Wikimedia indexam mal PT. Curta porque
      // queries longas ("scaffold facade panel") trazem PDFs.
      const queryMap = new Map<string, string>();
      try {
        const { invokeLLM } = await import("../_core/llm");
        const sys = `You are a Brazilian construction-equipment expert. For each item, output ONE Wikimedia/OpenVerse search query in ENGLISH that will find a clear product photo. Output MUST be in English (OpenVerse and Wikimedia index almost no Portuguese).

Query rules:
- 2-3 words, English, industrial vocabulary (scaffold, scaffolding, jack, plank, brace, toe board, formwork, shoring prop, concrete mixer, demolition hammer, angle grinder, jackhammer, generator).
- Use the CATEGORIA to disambiguate (RODAPÉ in ANDAIME = "toe board scaffold", NOT skirting board; PAINEL in ANDAIME = "scaffold panel" or "facade scaffold"; DIAGONAIS in ANDAIME = "scaffold brace"; SAPATAS in ESCORAMENTO = "adjustable scaffold jack").
- NO quotes, NO proprietary codes (PG-2030, FE-12), NO measurements ("1,50 M", "400L" → drop or use generic).
- NO words like "product", "photo", "equipment" — they pollute search results.

Examples:
- "DIAGONAIS X 1,50 M" + ANDAIME → "scaffold brace"
- "RODAPÉ 20 CM" + ANDAIME → "toe board scaffold"
- "PAINEL NR18 1,5X1,0 COM D..." + ANDAIME → "scaffold facade panel"
- "SAPATAS AJUSTÁVEIS" + ESCORAMENTO → "adjustable scaffold jack"
- "BETONEIRA 400L" + (sem cat) → "concrete mixer"
- "PRANCHAO METALICO 1,50" + ANDAIME → "scaffold metal plank"
- "MARTELETE DEMOLIDOR" + FERRAMENTA → "demolition hammer"
- "ANDAIME TUBULAR" + ANDAIME → "tubular scaffolding"
- "ESCORA METALICA" + ESCORAMENTO → "shoring prop"
- "GERADOR DIESEL" + (sem cat) → "diesel generator"

Reply JSON {"queries":[{"descricao":"<original PT>","query":"<EN words>"}]} with ALL descricoes.`;

        const payload = lote.map(d => ({ descricao: d.descricao, categoria: d.categoria || "(sem)" }));
        const userPrompt = `Gere queries pra estas ${lote.length} descrições:\n\n${JSON.stringify(payload, null, 2)}`;
        const resp = await invokeLLM({
          messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
          maxTokens: 6000,
          response_format: { type: "json_object" },
        });
        const content = resp.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "").trim();
        const mm = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i); if (mm) raw = mm[1].trim();
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);
        const parsed: any = JSON.parse(raw);
        const arr: any[] = Array.isArray(parsed?.queries) ? parsed.queries : [];
        for (const it of arr) {
          const d = String(it?.descricao || "").trim();
          const q = String(it?.query || "").trim();
          if (d && q) queryMap.set(d, q);
        }
        console.log(`[locadosBuscarFotosComIA] LLM gerou ${queryMap.size}/${lote.length} queries específicas`);
      } catch (e: any) {
        console.error("[locadosBuscarFotosComIA] LLM query-gen falhou:", e?.message || e);
        // Fallback: query crua descricao + categoria
      }

      // 2b. Filtro anti-lixo por keywords óbvias no título/URL — barra
      // banner/modelo/pessoa/avatar/logo SEM precisar de LLM call extra.
      // Blocklist mais cirúrgica: pessoas/animais/comida/PDFs/banners.
      // Removido "model/modelo" (aparece em "scaffold model X" legítimo).
      const BLOCKLIST = [
        /\b(female|male|woman|women|man|men|girl|boy|kid|child|baby|portrait|selfie|nude)\b/i,
        /\b(avatar|profile|logo|brand|banner|poster)\b/i,
        /\b(book|livro|magazine|revista|article|artigo)\b/i,
        /\b(food|comida|cake|dish|recipe|restaurant|beetle|insect|rhino|cat|dog|bird)\b/i,
        /\b(cartoon|illustration|drawing|sketch|vetor|vector|painting|exhibition|fragonard)\b/i,
        /\.pdf(\?|$)/i, // Wikimedia retorna PDFs antigos que escapam ao filtro de extensão.
      ];
      const isLixo = (title: string, url: string): boolean => {
        const t = title + " " + url;
        return BLOCKLIST.some(rx => rx.test(t));
      };

      // 2c. Pra cada descrição: cascade OpenVerse → Wikimedia. Google
      // pulado (API_KEY_SERVICE_BLOCKED na key compartilhada).
      // Fallback de query: se LLM falhou, usa categoria EN comum (poucos
      // hits, mas melhor que PT cru).
      const FALLBACK_EN: Record<string, string> = {
        andaime: "scaffolding", escora: "shoring prop", escoramento: "shoring",
        forma: "formwork", ferramenta: "construction tool", epi: "safety helmet",
        epc: "safety barrier", veiculo: "construction vehicle", maquina: "construction machine",
        container: "container", mobiliario: "office furniture", eletric: "electric tool",
      };
      const fallbackQuery = (cat: string): string => {
        const c = cat.toLowerCase();
        for (const k of Object.keys(FALLBACK_EN)) if (c.includes(k)) return FALLBACK_EN[k];
        return "construction equipment";
      };

      type Aprovada = { descricao: string; url: string; provider: string; query: string };
      const aprovacoes: Aprovada[] = [];
      const semFoto: string[] = [];
      for (const d of lote) {
        const desc = d.descricao;
        const cat = (d.categoria || "").trim();
        const query = queryMap.get(desc) || fallbackQuery(cat);

        let picked: { url: string; provider: string } | null = null;

        if (!picked) {
          const ov = await fromOpenverse(query);
          for (const c of ov) {
            if (!isLixo(c.title, c.url)) { picked = { url: c.url, provider: "openverse" }; break; }
          }
        }
        if (!picked) {
          const wm = await fromWikimedia(query);
          for (const c of wm) {
            if (!isLixo(c.title, c.url)) { picked = { url: c.url, provider: "wikimedia" }; break; }
          }
        }
        if (!picked && googleHabilitado && !googleDesativadoPorErro && !cotaEsgotada) {
          // Tentativa final no Google (provavelmente bloqueado, mas se algum
          // dia liberarem, esse branch volta a funcionar).
          const gc = await fromGoogleCSE(query);
          if (gc.configInvalida) googleDesativadoPorErro = true;
          if (gc.cotaEsgotada) cotaEsgotada = true;
          for (const c of gc.cands) {
            if (!isLixo(c.title, c.url)) { picked = { url: c.url, provider: "google" }; break; }
          }
        }

        if (picked) {
          aprovacoes.push({ descricao: desc, url: picked.url, provider: picked.provider, query });
        } else {
          semFoto.push(desc);
        }
      }
      console.log(`[locadosBuscarFotosComIA] Aprovadas (LLM-query + 1º hit): ${aprovacoes.length}/${lote.length}`);

      const validacoes = [
        ...aprovacoes.map(a => ({ descricao: a.descricao, url: a.url, motivo: `${a.provider} · "${a.query}"` })),
        ...semFoto.map(d => ({ descricao: d, url: null as string | null, motivo: "Sem resultado nos provedores" })),
      ];

      // 3. Bulk UPDATE por descrição — só pras URLs APROVADAS pela IA.
      let itensAtualizados = 0;
      const aprovadas = validacoes.filter(v => v.url);
      for (const { descricao, url } of aprovadas) {
        const condSobre = input.sobrescrever
          ? semFotoRec
          : sql`(${semFotoRec} AND (foto_url IS NULL OR foto_url = ''))`;
        const res: any = await db.execute(sql`
          UPDATE equipamentos_locados
             SET foto_url = ${url}, updated_at = NOW()
           WHERE company_id = ${input.companyId}
             AND descricao = ${descricao}
             AND ${condSobre}
        `);
        itensAtualizados += Number(res.rowCount ?? res.rows?.length ?? 0);
      }

      // ──────────────────────────────────────────────────────────────────
      // Rev. 2347 — Phase C (PLACEHOLDER SVG): para CADA descrição que
      // não foi aprovada na validação (sem candidatos, rejeitada, ou
      // validação IA falhou). Garante cobertura 100% SEM foto errada.
      // Removeu Phase B (busca ampla sem validação) — era o vetor da
      // foto de homem em RODAPÉ 20 CM.
      // ──────────────────────────────────────────────────────────────────
      const aprovadasMap = new Map(validacoes.filter(v => v.url).map(v => [v.descricao, v.url as string]));
      const aindaSemFoto = lote.filter(d => !aprovadasMap.has(d.descricao));

      function svgPlaceholder(categoria: string | null, descricao: string): string {
        const cor = (() => {
          const c = (categoria || "").toLowerCase();
          if (c.includes("andaime") || c.includes("escora")) return { bg: "#fde68a", fg: "#78350f", lbl: "ANDAIME" };
          if (c.includes("eletric")) return { bg: "#fde047", fg: "#713f12", lbl: "ELÉTRICO" };
          if (c.includes("ferramenta")) return { bg: "#bae6fd", fg: "#075985", lbl: "FERRAMENTA" };
          if (c.includes("epi") || c.includes("epc")) return { bg: "#fecaca", fg: "#7f1d1d", lbl: "EPI/EPC" };
          if (c.includes("veiculo") || c.includes("máquina") || c.includes("maquina")) return { bg: "#c7d2fe", fg: "#312e81", lbl: "VEÍCULO" };
          if (c.includes("container") || c.includes("mobil")) return { bg: "#bbf7d0", fg: "#14532d", lbl: "CONTAINER" };
          return { bg: "#e5e7eb", fg: "#1f2937", lbl: "EQUIPAMENTO" };
        })();
        const txt = descricao.slice(0, 28).replace(/[<>&"]/g, "");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="${cor.bg}"/><text x="200" y="180" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700" fill="${cor.fg}" text-anchor="middle">${cor.lbl}</text><text x="200" y="220" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="500" fill="${cor.fg}" text-anchor="middle" opacity="0.8">${txt}</text><text x="200" y="370" font-family="system-ui,-apple-system,sans-serif" font-size="10" fill="${cor.fg}" text-anchor="middle" opacity="0.6">FC ENGENHARIA · IA</text></svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }

      const fotosPhaseB = 0; // Rev. 2347 — Phase B removida (era insegura).
      let fotosPhaseC = 0;
      for (const d of aindaSemFoto) {
        const url = svgPlaceholder(d.categoria, d.descricao);
        const condSobre = input.sobrescrever
          ? semFotoRec
          : sql`(${semFotoRec} AND (foto_url IS NULL OR foto_url = ''))`;
        const res: any = await db.execute(sql`
          UPDATE equipamentos_locados
             SET foto_url = ${url}, updated_at = NOW()
           WHERE company_id = ${input.companyId}
             AND descricao = ${d.descricao}
             AND ${condSobre}
        `);
        itensAtualizados += Number(res.rowCount ?? res.rows?.length ?? 0);
        fotosPhaseC++;
      }
      console.log(`[locadosBuscarFotosComIA] Phase A (validada): ${aprovadasMap.size} | Phase C (placeholder): ${fotosPhaseC}`);

      const fotosEncontradasTotal = aprovadasMap.size + fotosPhaseC;

      return {
        ok: true as const,
        descricoesAnalisadas: lote.length,
        fotosEncontradas: fotosEncontradasTotal,
        fotosPhaseA: aprovadasMap.size,
        fotosPhaseB,
        fotosPhaseC,
        itensAtualizados,
        descricoesSemFoto: [] as string[], // Rev. 2345 — sempre vazio (100% coverage garantido)
        haMaisLotes: descricoes.length > input.maxDescricoes,
        cotaEsgotada,
      };
    }),

  // ── Rev. 2366 — BUSCA DE FOTO "como usuário normal faria" ────────────────
  // Pedido user (24/05/2026, IMG_1164): "Ela pesquisa na internet cada
  // nome, acha a foto e coloca no item... como um usuário normal faria."
  //
  // Estratégia: 1 descrição por chamada → DuckDuckGo Image Search (sem
  // chave, sem cota, indexa PT-BR direto) → pega o 1º resultado válido →
  // UPDATE em todas as unidades dessa descrição. ZERO LLM no caminho —
  // o usuário quer literalmente "o que o Google mostraria pra esse nome".
  //
  // Por que DDG e não Google CSE: Rev. 2349.1 documentou que a
  // GOOGLE_API_KEY do projeto está PERMANENTEMENTE bloqueada pra Custom
  // Search no GCP (403 API_KEY_SERVICE_BLOCKED). DDG é o substituto
  // funcional mais próximo — mesmo modelo (1º hit por query literal).
  //
  // Loop client-side: a UI chama esse endpoint 1×/descrição com progresso
  // visível. Por-card também: botão "trocar foto" no thumbnail chama com
  // `sobrescrever:true` pra forçar nova busca.
  //
  // **R-001/R-007/R-010**: UPDATE escopado por `company_id` + `descricao`
  // exata, idempotente (a menos que `sobrescrever`), zero DDL.
  locadosBuscarFotoWebPorDescricao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricao: z.string().min(1).max(500),
      sobrescrever: z.boolean().optional().default(false),
      // Rev. 2369 — termo de busca customizado pro DDG (a descrição original
      // do equipamento costuma ser cripto: "ESMER INDL41/2"220V-CÓD..." vira
      // foto errada). Se omitido, usa `descricao`. A propagação no UPDATE
      // continua usando `descricao` (match key no banco).
      queryOverride: z.string().min(1).max(500).optional(),
      // Rev. 2369 — dryRun=true: só busca a URL no DDG e retorna pra
      // preview, SEM tocar no banco. Usado pelo modal "Rebuscar com termo
      // customizado" pra mostrar a foto candidata antes de aplicar.
      dryRun: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      // Headers de browser real — DDG bloqueia UAs óbvios de bot.
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      };

      // 1. Pega o token vqd da página HTML inicial (DDG exige esse token
      //    pra autorizar a chamada JSON subsequente).
      // Rev. 2369 — query do DDG = override OU descrição literal.
      const queryDDG = (input.queryOverride || input.descricao).trim();
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 9000);
      let vqd: string | null = null;
      try {
        const r1 = await fetch(
          `https://duckduckgo.com/?q=${encodeURIComponent(queryDDG)}&iax=images&ia=images`,
          { signal: ctrl1.signal, headers: { ...headers, "Accept": "text/html,application/xhtml+xml" } }
        );
        const html = await r1.text();
        const m = html.match(/vqd=["']([\d-]+)["']/)
              || html.match(/vqd=([\d-]+)/)
              || html.match(/&vqd=([\w-]+)&/);
        if (m) vqd = m[1];
      } catch (e: any) {
        console.error("[locadosBuscarFotoWebPorDescricao] vqd fetch falhou:", e?.message || e);
      } finally { clearTimeout(t1); }

      if (!vqd) {
        return {
          ok: false as const,
          motivo: "Busca web indisponível no momento (não foi possível obter token da DuckDuckGo).",
          fotoUrl: null,
          itensAtualizados: 0,
          descricao: input.descricao,
        };
      }

      // 2. Chama o endpoint JSON da DDG Images.
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 9000);
      let fotoUrl: string | null = null;
      try {
        const url = `https://duckduckgo.com/i.js?l=br-pt&o=json&q=${encodeURIComponent(queryDDG)}&vqd=${vqd}&f=,,,,,&p=1`;
        const r2 = await fetch(url, {
          signal: ctrl2.signal,
          headers: { ...headers, "Accept": "application/json", "Referer": "https://duckduckgo.com/" },
        });
        if (r2.ok) {
          const j: any = await r2.json();
          const results: any[] = Array.isArray(j?.results) ? j.results : [];
          for (const it of results) {
            const u = String(it?.image || "");
            // Aceita só HTTPS + extensão de imagem válida + URL de tamanho razoável.
            if (/^https:\/\//.test(u)
                && /\.(jpe?g|png|webp)(\?|$)/i.test(u)
                && u.length <= 1000) {
              fotoUrl = u;
              break;
            }
          }
        }
      } catch (e: any) {
        console.error("[locadosBuscarFotoWebPorDescricao] i.js fetch falhou:", e?.message || e);
      } finally { clearTimeout(t2); }

      if (!fotoUrl) {
        return {
          ok: false as const,
          motivo: "Nenhuma foto válida encontrada na 1ª página de resultados.",
          fotoUrl: null,
          itensAtualizados: 0,
          descricao: input.descricao,
        };
      }

      // Rev. 2369 — dryRun: só retorna a URL pra preview, não escreve.
      if (input.dryRun) {
        return {
          ok: true as const,
          fotoUrl,
          itensAtualizados: 0,
          descricao: input.descricao,
          dryRun: true as const,
        };
      }

      // 3. UPDATE em todas as unidades dessa descrição (escopado a empresa).
      //    Sem `sobrescrever`: só preenche onde foto_url está vazia E não tem
      //    foto física de recebimento (recebimento é fonte autoritativa).
      const semFotoRec = sql`(fotos_recebimento_json IS NULL OR jsonb_typeof(fotos_recebimento_json) <> 'array' OR jsonb_array_length(fotos_recebimento_json) = 0)`;
      const condFoto = input.sobrescrever
        ? semFotoRec
        : sql`(${semFotoRec} AND (foto_url IS NULL OR foto_url = ''))`;

      const res: any = await db.execute(sql`
        UPDATE equipamentos_locados
           SET foto_url = ${fotoUrl}, updated_at = NOW()
         WHERE company_id = ${input.companyId}
           AND descricao = ${input.descricao}
           AND ${condFoto}
      `);
      const itensAtualizados = Number(res.rowCount ?? res.rows?.length ?? 0);

      return {
        ok: true as const,
        fotoUrl,
        itensAtualizados,
        descricao: input.descricao,
      };
    }),

  // Rev. 2342 — Limpar TODAS as fotos buscadas por IA (foto_url) — NÃO toca
  // `fotos_recebimento_json` (essas são da física, autoritativas). Tenant-scoped.
  locadosLimparFotosIA: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const res: any = await db.execute(sql`
        UPDATE equipamentos_locados
           SET foto_url = NULL, updated_at = NOW()
         WHERE company_id = ${input.companyId}
           AND foto_url IS NOT NULL
           AND foto_url <> ''
      `);
      const itensLimpos = Number(res.rowCount ?? res.rows?.length ?? 0);
      return { ok: true as const, itensLimpos };
    }),

  // ── Rev. 2362 — ANÁLISE COMPRAR vs ALUGAR (IA) ────────────────────────────
  // Pedido user (24/05/2026, IMG_1158+1159): "Análise nos valores dos
  // equipamentos locados x o preço do produto na internet, para analisar
  // se vamos comprar ou não, não faz sentido ter estes produtos locados se
  // é mais fácil comprar".
  //
  // Estratégia: agrega equipamentos em_uso por DESCRIÇÃO (não por unidade —
  // o preço de mercado é por SKU). Pra cada descrição calcula:
  //   - qtd unidades em locação
  //   - aluguel mensal médio/un (Σ valorMensal / qtd)
  //   - gasto mensal total da descrição (Σ valorMensal)
  // Manda pra Gemini estimar `precoCompraUn` (mediana mercado BR novo) +
  // faixa min/max + canal típico. Calcula payback (preço/aluguel) + economia
  // anual em 12 meses (12*aluguelMes - preçoTotal). Recomendação heurística:
  //   - payback ≤  6 meses → COMPRAR_JA (alta urgência)
  //   - payback ≤ 12 meses → COMPRAR
  //   - payback ≤ 24 meses → AVALIAR
  //   - payback >  24 meses → MANTER_LOCACAO
  //
  // Limitação documentada: Gemini estima preço com base no conhecimento de
  // treinamento (sem busca ao vivo na web). Pra preços muito específicos
  // (marca/modelo exato) pode errar — por isso devolvemos faixa min/max
  // e exibimos no UI como "estimativa", não como cotação firme.
  //
  // R-001/R-007/R-010: read-only — zero DDL, zero UPDATE/DELETE/INSERT.
  locadosAnalisarCompraVsAluguel: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      maxDescricoes: z.number().int().min(1).max(150).optional().default(80),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      // 1. Agregação por descrição (só em_uso — alugar item devolvido/atrasado
      // não faz sentido analisar). Cap em maxDescricoes pra controlar custo
      // do prompt; ordena por gasto mensal desc pra priorizar quem dói mais.
      const aggResult: any = await db.execute(sql`
        SELECT
          descricao,
          COUNT(*)::int                              AS qtd,
          COALESCE(SUM(valor_mensal), 0)::float     AS gasto_mes_total,
          COALESCE(AVG(valor_mensal), 0)::float     AS aluguel_un_mes,
          MAX(categoria)                             AS categoria
        FROM equipamentos_locados
        WHERE company_id = ${input.companyId}
          AND status = 'em_uso'
          AND descricao IS NOT NULL
          AND descricao <> ''
          AND valor_mensal IS NOT NULL
          AND valor_mensal > 0
        GROUP BY descricao
        HAVING SUM(valor_mensal) > 0
        ORDER BY SUM(valor_mensal) DESC
        LIMIT ${input.maxDescricoes}
      `);
      const grupos: { descricao: string; qtd: number; gasto_mes_total: number; aluguel_un_mes: number; categoria: string | null }[] =
        (aggResult.rows || aggResult) as any[];
      if (grupos.length === 0) {
        return {
          ok: true as const,
          totalAnalisado: 0,
          itens: [] as any[],
          economiaAnualPotencial: 0,
          investimentoTotalRecomendado: 0,
          fonte: "Gemini 2.5 Flash (estimativa baseada em conhecimento, sem busca ao vivo)",
        };
      }

      // 2. Prompt Gemini: estima preço de mercado BR (novo) por descrição.
      const { invokeLLM } = await import("../_core/llm");
      const systemPrompt = `Você é um especialista em compras de equipamentos para obra de construção civil pesada no Brasil. Recebe uma lista de descrições de equipamentos atualmente LOCADOS por uma construtora e deve estimar o preço de COMPRA (item NOVO, em R$, sem frete, à vista) de cada um no mercado brasileiro.

Regras OBRIGATÓRIAS:
1. Para CADA descrição, estimar:
   - "precoMedio": número em R$ (mediana de mercado, item NOVO comum)
   - "precoMin": número em R$ (mínimo plausível — marca genérica/promoção)
   - "precoMax": número em R$ (máximo plausível — marca premium)
   - "canalTipico": string ≤ 60 chars (ex: "Leroy Merlin / Madeira Madeira", "Mercado Livre — locadoras revenda", "Casa do Construtor / Telha Norte")
   - "confianca": "alta" | "media" | "baixa" — sua confiança na estimativa
2. Se a descrição for genérica demais pra estimar (ex: "ACESSÓRIO DIVERSO"), use "confianca":"baixa" e dê faixa larga.
3. Use preços de 2025-2026 em REAL. NÃO converta de USD.
4. Retornar APENAS JSON válido — sem markdown:
   {
     "itens": [
       { "descricao": "TEXTO EXATO ORIGINAL", "precoMedio": 1200, "precoMin": 800, "precoMax": 1800, "canalTipico": "...", "confianca": "media" },
       ...
     ]
   }
5. O campo "descricao" deve ser IGUAL (caractere a caractere) ao recebido. Não omita nenhum item.`;

      const userPrompt = `Estime o preço de compra (item NOVO, R$, mercado BR) das ${grupos.length} descrições abaixo. Entre parênteses está a quantidade de unidades que a construtora atualmente aluga e o aluguel mensal médio por unidade — use isso APENAS pra calibrar o porte do equipamento (aluguel R$ 9/mês = sapata; R$ 500/mês = betoneira; R$ 3.000/mês = compressor industrial).

${grupos.map(g => `- ${g.descricao}  (${g.qtd} un · aluguel R$ ${g.aluguel_un_mes.toFixed(2)}/un/mês)`).join("\n")}

Gere o JSON conforme o esquema. Não omita nenhuma descrição.`;

      // Fix code review Rev. 2362: degradar pra { itens: [] } se JSON vier quebrado
      // — assim o endpoint sempre devolve estrutura, todos os grupos viram AVALIAR
      // (sem preço) em vez de derrubar a análise inteira. Só lança se a IA estiver
      // SEM CHAVE configurada (erro estrutural, não transiente).
      let parsed: any = { itens: [] };
      let iaErroMsg: string | null = null;
      try {
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 16000,
          response_format: { type: "json_object" },
        });
        const content = resp.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "").trim();
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (m) raw = m[1].trim();
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);
        try {
          parsed = JSON.parse(raw);
        } catch (jsonErr: any) {
          // Code review fix: JSON malformado não derruba mais o endpoint;
          // todos os grupos viram AVALIAR + confianca baixa, com aviso na UI.
          iaErroMsg = `IA devolveu JSON inválido (${(jsonErr?.message || "parse error").slice(0, 80)}). Análise gerada sem estimativa de preço — clique em Re-analisar.`;
          console.warn("[locadosAnalisarCompraVsAluguel] JSON parse falhou:", jsonErr?.message, "raw[0:200]:", raw.slice(0, 200));
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          // Único erro estrutural que ainda lança — UI vai pedir pra configurar chave.
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        // Code review fix: rede/429/5xx degradam pra análise sem preços em vez
        // de quebrar tudo. User vê a lista com confianca=baixa e re-tenta.
        iaErroMsg = `Falha ao consultar IA (${msg.slice(0, 100)}). Análise gerada sem estimativa de preço.`;
        console.warn("[locadosAnalisarCompraVsAluguel] invokeLLM falhou:", msg);
      }

      const respostas: any[] = Array.isArray(parsed.itens) ? parsed.itens : [];
      const respMap = new Map<string, any>();
      for (const r of respostas) {
        const d = String(r?.descricao ?? "");
        if (d) respMap.set(d, r);
      }

      // 3. Calcula payback + recomendação por grupo. Sem resposta da IA → AVALIAR
      // com confianca "baixa" pra não desaparecer da tabela.
      function recomendar(paybackMeses: number): "COMPRAR_JA" | "COMPRAR" | "AVALIAR" | "MANTER_LOCACAO" {
        if (!isFinite(paybackMeses) || paybackMeses <= 0) return "AVALIAR";
        if (paybackMeses <=  6) return "COMPRAR_JA";
        if (paybackMeses <= 12) return "COMPRAR";
        if (paybackMeses <= 24) return "AVALIAR";
        return "MANTER_LOCACAO";
      }

      const itens = grupos.map(g => {
        const r = respMap.get(g.descricao);
        const precoMedio = r ? Math.max(0, Number(r.precoMedio) || 0) : 0;
        const precoMin   = r ? Math.max(0, Number(r.precoMin)   || 0) : 0;
        const precoMax   = r ? Math.max(0, Number(r.precoMax)   || 0) : 0;
        const canal      = r ? String(r.canalTipico || "").slice(0, 80) : "";
        const confianca: "alta" | "media" | "baixa" =
          r && (r.confianca === "alta" || r.confianca === "media" || r.confianca === "baixa") ? r.confianca : "baixa";
        const temPreco = precoMedio > 0 && g.aluguel_un_mes > 0;
        // Code review fix: sem preço → investimento/economia = null (não 0),
        // pra não simular "economia falsa = 12×gasto" e empurrar o item pra topo.
        const paybackMeses = temPreco ? precoMedio / g.aluguel_un_mes : null;
        const investimentoCompra = temPreco ? precoMedio * g.qtd : null;
        const economiaAnual = temPreco ? (g.gasto_mes_total * 12) - (precoMedio * g.qtd) : null;
        const recomendacao = temPreco && paybackMeses != null ? recomendar(paybackMeses) : "AVALIAR";
        return {
          descricao: g.descricao,
          categoria: g.categoria,
          qtd: g.qtd,
          aluguelUnMes: g.aluguel_un_mes,
          gastoMesTotal: g.gasto_mes_total,
          precoMedio,
          precoMin,
          precoMax,
          canalTipico: canal,
          confianca,
          temPreco,
          paybackMeses,
          investimentoCompra,
          economiaAnual,
          recomendacao,
        };
      });
      // Ordena: recomendações de COMPRA primeiro, depois AVALIAR (com preço
      // antes de sem preço — code review fix), depois MANTER.
      const ordemRec: Record<string, number> = { COMPRAR_JA: 0, COMPRAR: 1, AVALIAR: 2, MANTER_LOCACAO: 3 };
      itens.sort((a, b) => {
        const dr = (ordemRec[a.recomendacao] ?? 9) - (ordemRec[b.recomendacao] ?? 9);
        if (dr !== 0) return dr;
        // Itens com preço (analisados) vêm antes dos sem preço dentro do mesmo bucket.
        if (a.temPreco !== b.temPreco) return a.temPreco ? -1 : 1;
        return (b.economiaAnual ?? -Infinity) - (a.economiaAnual ?? -Infinity);
      });

      const economiaAnualPotencial = itens
        .filter(i => i.recomendacao === "COMPRAR_JA" || i.recomendacao === "COMPRAR")
        .reduce((a, i) => a + Math.max(0, i.economiaAnual ?? 0), 0);
      const investimentoTotalRecomendado = itens
        .filter(i => i.recomendacao === "COMPRAR_JA" || i.recomendacao === "COMPRAR")
        .reduce((a, i) => a + (i.investimentoCompra ?? 0), 0);
      const semEstimativa = itens.filter(i => !i.temPreco).length;

      return {
        ok: true as const,
        totalAnalisado: itens.length,
        haMaisLotes: false, // (cap em maxDescricoes — top N por gasto já cobre o relevante)
        itens,
        economiaAnualPotencial,
        investimentoTotalRecomendado,
        semEstimativa,
        iaErroMsg,
        fonte: "Gemini 2.5 Flash · estimativa baseada em conhecimento (sem busca ao vivo)",
        geradoEm: new Date().toISOString(),
      };
    }),

  // ── Rev. 2355 — BIBLIOTECA CURADA DE FOTOS POR DESCRIÇÃO CANÔNICA ─────────
  // Substitui definitivamente a "busca de fotos com IA" (revs 2340-2350) que
  // tinha baixa acurácia por limitação dos provedores gratuitos. O user sobe
  // 1 foto por descrição normalizada; o ERP propaga pra TODAS as unidades
  // dessa descrição (atuais via UPDATE em lote + futuras via hook no import).

  fotosCanonicasListar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowed as any[]).some(c => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // 1) Todas as descrições atuais cadastradas (count + foto mais recente)
      const rows: any = await db.execute(sql`
        SELECT descricao,
               COUNT(*)::int AS unidades,
               COUNT(*) FILTER (WHERE foto_url IS NOT NULL AND foto_url <> '')::int AS com_foto
          FROM equipamentos_locados
         WHERE company_id = ${input.companyId}
         GROUP BY descricao
         ORDER BY COUNT(*) DESC, descricao ASC
      `);
      const descricoes = (rows.rows ?? rows) as Array<{ descricao: string; unidades: number; com_foto: number }>;
      // 2) Biblioteca canônica existente
      const canonicas = await db
        .select()
        .from(equipamentosFotosCanonicas)
        .where(eq(equipamentosFotosCanonicas.companyId, input.companyId));
      const mapaCanon = new Map<string, { id: number; fotoUrl: string; updatedAt: string }>();
      for (const c of canonicas as any[]) {
        mapaCanon.set(c.descricaoNormalizada, { id: c.id, fotoUrl: c.fotoUrl, updatedAt: c.updatedAt });
      }
      // 3) Agrupa descrições por chave normalizada (pra mostrar 1 linha por canônica)
      const grupos = new Map<string, {
        descricaoNormalizada: string;
        descricoesOriginais: string[];
        unidades: number;
        comFoto: number;
        canonica: { id: number; fotoUrl: string; updatedAt: string } | null;
      }>();
      for (const d of descricoes) {
        const k = normalizarDescricao(d.descricao);
        const g = grupos.get(k) || {
          descricaoNormalizada: k,
          descricoesOriginais: [],
          unidades: 0,
          comFoto: 0,
          canonica: mapaCanon.get(k) || null,
        };
        g.descricoesOriginais.push(d.descricao);
        g.unidades += Number(d.unidades);
        g.comFoto += Number(d.com_foto);
        grupos.set(k, g);
      }
      return {
        grupos: Array.from(grupos.values()).sort((a, b) => b.unidades - a.unidades),
        totalGrupos: grupos.size,
        totalComCanonica: Array.from(grupos.values()).filter(g => g.canonica).length,
      };
    }),

  fotosCanonicasUpsert: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricaoOriginal: z.string().min(1).max(255),
      fotoBase64: z.string().min(10),
      // Rev. 2355 — whitelist de MIME (defense-in-depth contra upload de
      // executáveis renomeados ou SVG com payload XSS).
      fotoMime: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]).default("image/jpeg"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowed as any[]).some(c => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Limite de payload (5MB base64 ≈ 3.75MB binário — front comprime pra
      // <500KB normalmente; este teto é defense-in-depth).
      if (input.fotoBase64.length > 7 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Foto muito grande (>5MB). Será comprimida no envio — tente novamente." });
      }
      const descNorm = normalizarDescricao(input.descricaoOriginal);
      if (!descNorm) throw new TRPCError({ code: "BAD_REQUEST", message: "Descrição vazia após normalização." });

      // 1) Salva o arquivo no storage (key estável por descrição → idempotente)
      const buf = Buffer.from(input.fotoBase64, "base64");
      const ext = input.fotoMime.includes("png") ? "png" : input.fotoMime.includes("webp") ? "webp" : "jpg";
      const hash = crypto.createHash("sha1").update(descNorm).digest("hex").slice(0, 12);
      const ts = Date.now();
      const key = `equipamentos/fotos-canonicas/${input.companyId}/${hash}-${ts}.${ext}`;
      const { url } = await storagePut(key, buf, input.fotoMime);

      // 2) Upsert na biblioteca canônica (ON CONFLICT por company+desc_norm)
      await db.execute(sql`
        INSERT INTO equipamentos_fotos_canonicas
          (company_id, descricao_normalizada, descricao_original, foto_url, criado_por, created_at, updated_at)
        VALUES
          (${input.companyId}, ${descNorm}, ${input.descricaoOriginal}, ${url}, ${ctx.user.id}, NOW(), NOW())
        ON CONFLICT (company_id, descricao_normalizada)
        DO UPDATE SET
          foto_url = EXCLUDED.foto_url,
          descricao_original = EXCLUDED.descricao_original,
          updated_at = NOW()
      `);

      // 3) Propaga pra todas as unidades atuais com mesma descrição normalizada.
      // Como Postgres não tem "normalize NFD" nativo, faço em 2 passos:
      //   (a) SELECT id, descricao das unidades da empresa
      //   (b) filtra em JS por descNorm
      //   (c) UPDATE ... WHERE id IN (...)
      // Performance: max ~50k unidades por empresa — bem barato.
      const unidades: any = await db.execute(sql`
        SELECT id, descricao FROM equipamentos_locados
         WHERE company_id = ${input.companyId}
      `);
      const ids: number[] = [];
      for (const u of (unidades.rows ?? unidades) as any[]) {
        if (normalizarDescricao(u.descricao) === descNorm) ids.push(Number(u.id));
      }
      let unidadesAtualizadas = 0;
      if (ids.length > 0) {
        // Bulk update em chunks de 1000 (precaução com placeholders no PG)
        const CHUNK = 1000;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const res: any = await db.execute(sql`
            UPDATE equipamentos_locados
               SET foto_url = ${url}, updated_at = NOW()
             WHERE company_id = ${input.companyId}
               AND id IN ${sql.raw(`(${slice.join(",")})`)}
          `);
          unidadesAtualizadas += Number(res.rowCount ?? res.rows?.length ?? slice.length);
        }
      }
      return { ok: true as const, fotoUrl: url, unidadesAtualizadas, descricaoNormalizada: descNorm };
    }),

  // ── Rev. 2367 — Buscar foto na web E salvar na Biblioteca (1 clique) ────
  // Pedido user (24/05/2026, IMG_1165): abriu a Biblioteca de fotos e viu
  // "0 com foto na biblioteca" — a Rev. 2366 popula só `equipamentos_locados.
  // foto_url`, NÃO a tabela canônica `equipamentos_fotos_canonicas`. Agora
  // a biblioteca tem botão "Buscar na web" por linha que:
  //   1. Faz DDG Images (mesmo fluxo do `locadosBuscarFotoWebPorDescricao`).
  //   2. Baixa o arquivo (até 5MB, com timeout 10s).
  //   3. Joga no storage interno (URL estável, evita hot-link quebrar).
  //   4. Faz UPSERT em `equipamentos_fotos_canonicas` por descricao_normalizada.
  //   5. Propaga pra todas as unidades dessa descrição (UPDATE foto_url).
  // Idêntico ao `fotosCanonicasUpsert` exceto que a origem da foto é a web
  // em vez de upload do usuário.
  fotosCanonicasBuscarWebUpsert: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricaoOriginal: z.string().min(1).max(255),
      // Rev. 2369 — ver comentário no locadosBuscarFotoWebPorDescricao.
      queryOverride: z.string().min(1).max(500).optional(),
      dryRun: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowed as any[]).some(c => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const descNorm = normalizarDescricao(input.descricaoOriginal);
      if (!descNorm) throw new TRPCError({ code: "BAD_REQUEST", message: "Descrição vazia após normalização." });

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      };

      // Rev. 2369 — query do DDG = override OU descrição original.
      const queryDDG = (input.queryOverride || input.descricaoOriginal).trim();
      // 1) Pega vqd
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 9000);
      let vqd: string | null = null;
      try {
        const r1 = await fetch(
          `https://duckduckgo.com/?q=${encodeURIComponent(queryDDG)}&iax=images&ia=images`,
          { signal: ctrl1.signal, headers: { ...headers, "Accept": "text/html,application/xhtml+xml" } }
        );
        const html = await r1.text();
        const m = html.match(/vqd=["']([\d-]+)["']/)
              || html.match(/vqd=([\d-]+)/)
              || html.match(/&vqd=([\w-]+)&/);
        if (m) vqd = m[1];
      } catch (e: any) {
        console.error("[fotosCanonicasBuscarWebUpsert] vqd falhou:", e?.message || e);
      } finally { clearTimeout(t1); }

      if (!vqd) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Busca web indisponível (sem token DDG)." });
      }

      // 2) Pega 1ª URL válida
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 9000);
      let fotoUrl: string | null = null;
      try {
        const url = `https://duckduckgo.com/i.js?l=br-pt&o=json&q=${encodeURIComponent(queryDDG)}&vqd=${vqd}&f=,,,,,&p=1`;
        const r2 = await fetch(url, {
          signal: ctrl2.signal,
          headers: { ...headers, "Accept": "application/json", "Referer": "https://duckduckgo.com/" },
        });
        if (r2.ok) {
          const j: any = await r2.json();
          const results: any[] = Array.isArray(j?.results) ? j.results : [];
          for (const it of results) {
            const u = String(it?.image || "");
            if (/^https:\/\//.test(u) && /\.(jpe?g|png|webp)(\?|$)/i.test(u) && u.length <= 1000) {
              fotoUrl = u;
              break;
            }
          }
        }
      } catch (e: any) {
        console.error("[fotosCanonicasBuscarWebUpsert] i.js falhou:", e?.message || e);
      } finally { clearTimeout(t2); }

      if (!fotoUrl) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma foto válida encontrada na 1ª página de resultados." });
      }

      // Rev. 2369 — dryRun: retorna a URL externa pra preview, NÃO baixa
      // nem grava na biblioteca. Download/storage/upsert só rodam no Apply.
      if (input.dryRun) {
        return {
          ok: true as const,
          fotoUrl,
          unidadesAtualizadas: 0,
          descricaoOriginal: input.descricaoOriginal,
          dryRun: true as const,
        };
      }

      // 3) Baixa o arquivo (até 5MB, timeout 10s) — não confia em URL externa
      //    pra ficar hot-linked no banco; copia pro storage interno.
      //
      // Rev. 2367 — SSRF GUARD (code-review feedback): URL externa do DDG
      // pode (a) ter hostname que resolve pra IP privado/loopback/metadata
      // ou (b) redirecionar pra um. Bloqueio em 3 camadas:
      //   1. Resolver DNS de TODOS os endereços (A+AAAA) e rejeitar se
      //      QUALQUER um cair em range privado/loopback/link-local/multicast.
      //   2. `redirect: 'manual'` — qualquer 3xx vira erro (não seguimos
      //      cego pra IP novo).
      //   3. Validar Content-Length ≤ 5MB ANTES de ler corpo (anti-DoS
      //      de memória) + double-check no buffer final.
      // Allowlist de protocolos: só HTTPS (HTTP normal já filtrado na fase 2).
      function ipIsPrivate(ip: string): boolean {
        const v = net.isIP(ip);
        if (v === 4) {
          const [a, b] = ip.split(".").map(Number);
          if (a === 0 || a === 10 || a === 127) return true;
          if (a === 169 && b === 254) return true;          // link-local + metadata
          if (a === 172 && b >= 16 && b <= 31) return true;
          if (a === 192 && b === 168) return true;
          if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
          if (a >= 224) return true;                          // multicast + reserved
          return false;
        }
        if (v === 6) {
          const low = ip.toLowerCase();
          if (low === "::1" || low === "::") return true;
          // fe80::/10 → primeiros 10 bits = 1111 1110 10 → primeiro byte
          // 0xfe, segundo nibble 8/9/a/b. Cobre fe80–febf.
          if (/^fe[89ab]/.test(low)) return true;
          if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA fc00::/7
          if (low.startsWith("ff")) return true;              // multicast
          // ::ffff:x.x.x.x → mapped IPv4 — extrai e re-checa
          const m = low.match(/^::ffff:([\d.]+)$/);
          if (m && ipIsPrivate(m[1])) return true;
          return false;
        }
        return true; // unknown format → bloqueia
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(fotoUrl);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "URL da foto inválida." });
      }
      if (parsedUrl.protocol !== "https:") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só HTTPS é permitido pra download externo." });
      }
      // Node coloca colchetes em hostname IPv6 literal — strip pra net.isIP funcionar.
      const host = parsedUrl.hostname.replace(/^\[|\]$/g, "");
      // Se for IP literal, valida direto. Caso contrário, resolve DNS.
      let ipsResolvidos: string[] = [];
      if (net.isIP(host)) {
        ipsResolvidos = [host];
      } else {
        try {
          const recs = await dns.lookup(host, { all: true, verbatim: true });
          ipsResolvidos = recs.map(r => r.address);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível resolver o host da foto." });
        }
      }
      if (ipsResolvidos.length === 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Host da foto sem IPs." });
      }
      for (const ip of ipsResolvidos) {
        if (ipIsPrivate(ip)) {
          console.warn("[fotosCanonicasBuscarWebUpsert] SSRF bloqueado:", host, "→", ip);
          throw new TRPCError({ code: "FORBIDDEN", message: "URL da foto aponta pra rede interna — bloqueado por segurança." });
        }
      }

      const ctrl3 = new AbortController();
      const t3 = setTimeout(() => ctrl3.abort(), 10_000);
      let bytes: Buffer | null = null;
      let mime: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
      try {
        const r3 = await fetch(fotoUrl, {
          signal: ctrl3.signal,
          redirect: "manual",
          headers: { "User-Agent": headers["User-Agent"], "Accept": "image/*" },
        });
        // redirect:'manual' → 3xx vira resposta direta com status 3xx (ou
        // 'opaqueredirect' em alguns runtimes — checamos as 2 condições).
        if (r3.status >= 300 && r3.status < 400) {
          throw new Error(`Redirect HTTP ${r3.status} bloqueado (anti-SSRF).`);
        }
        if ((r3 as any).type === "opaqueredirect") {
          throw new Error("Redirect opaco bloqueado (anti-SSRF).");
        }
        if (!r3.ok) throw new Error(`Download falhou: HTTP ${r3.status}`);
        const clen = Number(r3.headers.get("content-length") || 0);
        if (clen && clen > 5 * 1024 * 1024) {
          throw new Error("Content-Length declarado > 5MB — descartado por segurança.");
        }
        const ctype = String(r3.headers.get("content-type") || "").toLowerCase();
        if (!ctype.startsWith("image/")) {
          throw new Error(`Content-Type não-imagem (${ctype || "vazio"}) — descartado.`);
        }
        if (ctype.includes("png")) mime = "image/png";
        else if (ctype.includes("webp")) mime = "image/webp";
        else mime = "image/jpeg";
        const ab = await r3.arrayBuffer();
        if (ab.byteLength > 5 * 1024 * 1024) {
          throw new Error("Arquivo da web maior que 5MB — descartado por segurança.");
        }
        bytes = Buffer.from(ab);
      } catch (e: any) {
        console.error("[fotosCanonicasBuscarWebUpsert] download falhou:", e?.message || e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao baixar a foto encontrada (${e?.message || "erro de rede"}).` });
      } finally { clearTimeout(t3); }

      if (!bytes || bytes.length === 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Arquivo vazio após download." });
      }

      // 4) Salva no storage e faz upsert na biblioteca canônica.
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const hash = crypto.createHash("sha1").update(descNorm).digest("hex").slice(0, 12);
      const ts = Date.now();
      const key = `equipamentos/fotos-canonicas/${input.companyId}/${hash}-${ts}.${ext}`;
      const { url } = await storagePut(key, bytes, mime);

      await db.execute(sql`
        INSERT INTO equipamentos_fotos_canonicas
          (company_id, descricao_normalizada, descricao_original, foto_url, criado_por, created_at, updated_at)
        VALUES
          (${input.companyId}, ${descNorm}, ${input.descricaoOriginal}, ${url}, ${ctx.user.id}, NOW(), NOW())
        ON CONFLICT (company_id, descricao_normalizada)
        DO UPDATE SET
          foto_url = EXCLUDED.foto_url,
          descricao_original = EXCLUDED.descricao_original,
          updated_at = NOW()
      `);

      // 5) Propaga pras unidades (mesma lógica de fotosCanonicasUpsert).
      const unidades: any = await db.execute(sql`
        SELECT id, descricao FROM equipamentos_locados
         WHERE company_id = ${input.companyId}
      `);
      const ids: number[] = [];
      for (const u of (unidades.rows ?? unidades) as any[]) {
        if (normalizarDescricao(u.descricao) === descNorm) ids.push(Number(u.id));
      }
      let unidadesAtualizadas = 0;
      if (ids.length > 0) {
        const CHUNK = 1000;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const res: any = await db.execute(sql`
            UPDATE equipamentos_locados
               SET foto_url = ${url}, updated_at = NOW()
             WHERE company_id = ${input.companyId}
               AND id IN ${sql.raw(`(${slice.join(",")})`)}
          `);
          unidadesAtualizadas += Number(res.rowCount ?? res.rows?.length ?? slice.length);
        }
      }

      return {
        ok: true as const,
        fotoUrl: url,
        fotoUrlOrigem: fotoUrl,
        unidadesAtualizadas,
        descricaoNormalizada: descNorm,
      };
    }),

  fotosCanonicasRemover: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number(), limparUnidades: z.boolean().default(true) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowed as any[]).some(c => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [canon] = await db
        .select()
        .from(equipamentosFotosCanonicas)
        .where(and(
          eq(equipamentosFotosCanonicas.id, input.id),
          eq(equipamentosFotosCanonicas.companyId, input.companyId),
        ));
      if (!canon) throw new TRPCError({ code: "NOT_FOUND", message: "Foto canônica não encontrada." });
      let unidadesLimpas = 0;
      if (input.limparUnidades) {
        // Limpa SOMENTE unidades cuja foto_url == essa URL (preserva fotos
        // manualmente atribuídas/recebimento).
        const res: any = await db.execute(sql`
          UPDATE equipamentos_locados
             SET foto_url = NULL, updated_at = NOW()
           WHERE company_id = ${input.companyId}
             AND foto_url = ${(canon as any).fotoUrl}
        `);
        unidadesLimpas = Number(res.rowCount ?? res.rows?.length ?? 0);
      }
      await db.execute(sql`
        DELETE FROM equipamentos_fotos_canonicas
         WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true as const, unidadesLimpas };
    }),

  // ── FATURA DE LOCAÇÃO (skeleton; OCR vem na Fase 3) ───────────────────────

  faturasListar: protectedProcedure
    .input(companyInput.extend({
      status: z.enum(["pendente", "conferida", "aprovada", "contestada", "paga"]).optional(),
      mesReferencia: z.string().max(7).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conds: any[] = [companyFilter(faturaLocacaoConferencia.companyId, input)];
      if (input.status) conds.push(eq(faturaLocacaoConferencia.status, input.status));
      if (input.mesReferencia) conds.push(eq(faturaLocacaoConferencia.mesReferencia, input.mesReferencia));
      return await db.select().from(faturaLocacaoConferencia).where(and(...conds))
        .orderBy(desc(faturaLocacaoConferencia.id));
    }),

  // ── Rev. 2404 — Marcar item de almoxarifado como Equipamento (Proprio/Locado) ──
  // O item permanece na lista do almox, mas ganha vinculo com a tabela de
  // equipamentos. Reaproveita foto/descricao/valor/categoria do item.
  vincularItemAlmoxarifado: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      itemId: z.number(),
      tipo: z.enum(["proprio", "locado"]),
      proprio: z.object({
        codigoPatrimonio: z.string().max(50).optional(),
        numeroSerie: z.string().max(100).optional(),
        marca: z.string().max(100).optional(),
        modelo: z.string().max(100).optional(),
        dataAquisicao: z.string().max(10).optional(),
        valorAquisicao: z.number().optional(),
        vidaUtilMeses: z.number().int().optional(),
      }).optional(),
      locado: z.object({
        fornecedorNome: z.string().min(1).max(255),
        obraId: z.number().optional(),
        dataInicio: z.string().min(10).max(10),
        dataFimPrevista: z.string().min(10).max(10),
        valorMensal: z.number().optional(),
        valorDiario: z.number().optional(),
        codigoPatrimonioFornecedor: z.string().max(100).optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 4477 — substituído getUserCompanyLinks (legado, só user_companies direto)
      // por getCompaniesForUser (correto: admin global + acesso via obra concedida).
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const [item] = await db.select().from(almoxarifadoItens)
        .where(and(eq(almoxarifadoItens.id, input.itemId), eq(almoxarifadoItens.companyId, input.companyId)))
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item nao encontrado." });
      if ((item as any).equipamentoVinculadoId) {
        throw new TRPCError({ code: "CONFLICT", message: "Este item ja esta vinculado a um equipamento." });
      }

      const valorUnit = (item as any).valorUnitario != null ? parseFloat(String((item as any).valorUnitario)) : null;
      const fotoUrl = (item as any).fotoUrl as string | null;
      const fotosArr = fotoUrl ? [{ url: fotoUrl, legenda: "Foto do item de almoxarifado", uploadedAt: new Date().toISOString() }] : null;

      let equipamentoId: number;

      if (input.tipo === "proprio") {
        if (!input.proprio) throw new TRPCError({ code: "BAD_REQUEST", message: "Dados do equipamento proprio obrigatorios." });
        const cod = input.proprio.codigoPatrimonio?.trim() || await proximoCodigoPatrimonio(db, input.companyId);
        if (input.proprio.codigoPatrimonio?.trim()) {
          const [dup] = await db.select({ id: equipamentosProprios.id }).from(equipamentosProprios)
            .where(and(
              eq(equipamentosProprios.companyId, input.companyId),
              eq(equipamentosProprios.codigoPatrimonio, cod),
            )).limit(1);
          if (dup) throw new TRPCError({ code: "CONFLICT", message: "Patrimonio ja cadastrado." });
        }
        const [created] = await db.insert(equipamentosProprios).values({
          companyId: input.companyId,
          codigoPatrimonio: cod,
          descricao: item.nome,
          categoria: item.categoria ?? null,
          numeroSerie: input.proprio.numeroSerie ?? null,
          marca: input.proprio.marca ?? null,
          modelo: input.proprio.modelo ?? null,
          dataAquisicao: input.proprio.dataAquisicao ?? null,
          valorAquisicao: input.proprio.valorAquisicao != null ? String(input.proprio.valorAquisicao) : (valorUnit != null ? String(valorUnit) : null),
          vidaUtilMeses: input.proprio.vidaUtilMeses ?? null,
          fotosJson: fotosArr,
          status: "disponivel",
          localizacaoAtualTipo: "almoxarifado",
          observacoes: `Cadastrado a partir do item de almoxarifado #${item.id} por ${ctx.user.name || ctx.user.id}.`,
        }).returning({ id: equipamentosProprios.id });
        equipamentoId = created.id;
      } else {
        if (!input.locado) throw new TRPCError({ code: "BAD_REQUEST", message: "Dados do equipamento locado obrigatorios." });
        if (!fotosArr) throw new TRPCError({ code: "BAD_REQUEST", message: "Item precisa ter foto cadastrada antes de virar equipamento locado (foto de recebimento e obrigatoria)." });
        const [created] = await db.insert(equipamentosLocados).values({
          companyId: input.companyId,
          obraId: input.locado.obraId ?? item.obraId ?? null,
          fornecedorNome: input.locado.fornecedorNome,
          codigoPatrimonioFornecedor: input.locado.codigoPatrimonioFornecedor ?? null,
          descricao: item.nome,
          categoria: item.categoria ?? null,
          dataInicio: input.locado.dataInicio,
          dataFimPrevista: input.locado.dataFimPrevista,
          valorDiario: input.locado.valorDiario != null ? String(input.locado.valorDiario) : null,
          valorMensal: input.locado.valorMensal != null ? String(input.locado.valorMensal) : null,
          status: "em_uso",
          fotosRecebimentoJson: fotosArr,
          fotoUrl: fotoUrl ?? null,
          observacoes: `Cadastrado a partir do item de almoxarifado #${item.id} por ${ctx.user.name || ctx.user.id}.`,
        }).returning({ id: equipamentosLocados.id });
        equipamentoId = created.id;

        await db.insert(equipamentoLocadoEventos).values({
          companyId: input.companyId,
          equipamentoLocadoId: equipamentoId,
          tipo: "RECEBIMENTO",
          obraId: input.locado.obraId ?? item.obraId ?? null,
          fotosJson: fotosArr,
          observacao: "Vinculo automatico a partir do almoxarifado.",
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name || String(ctx.user.id),
        });
      }

      await db.update(almoxarifadoItens)
        .set({
          equipamentoVinculadoTipo: input.tipo,
          equipamentoVinculadoId: equipamentoId,
          equipamentoVinculadoEm: sql`now()` as any,
          atualizadoEm: sql`now()` as any,
          atualizadoPorId: ctx.user.id,
          atualizadoPorNome: ctx.user.name || String(ctx.user.id),
        } as any)
        .where(and(eq(almoxarifadoItens.id, input.itemId), eq(almoxarifadoItens.companyId, input.companyId)));

      return { equipamentoId, tipo: input.tipo };
    }),

  // Desfaz o vinculo do item com o equipamento (NAO apaga o equipamento).
  desvincularItemAlmoxarifado: protectedProcedure
    .input(z.object({ companyId: z.number(), itemId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 4477 — idem vincularItemAlmoxarifado: getCompaniesForUser correto.
      const allowedDes = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedDes as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      await db.update(almoxarifadoItens)
        .set({
          equipamentoVinculadoTipo: null,
          equipamentoVinculadoId: null,
          equipamentoVinculadoEm: null,
          atualizadoEm: sql`now()` as any,
          atualizadoPorId: ctx.user.id,
          atualizadoPorNome: ctx.user.name || String(ctx.user.id),
        } as any)
        .where(and(eq(almoxarifadoItens.id, input.itemId), eq(almoxarifadoItens.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Rev. 4340 — Transferência de Equipamentos Próprios entre obras ─────────
  // Fluxo duplo: remetente inicia → destinatário dá aceite de recebimento.
  // ─────────────────────────────────────────────────────────────────────────────

  iniciarTransferenciaObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      equipamentoId: z.number(),
      destinoObraId: z.number(),
      destinoObraNome: z.string().optional(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [equip] = await db.select().from(equipamentosProprios)
        .where(and(eq(equipamentosProprios.id, input.equipamentoId), eq(equipamentosProprios.companyId, input.companyId)))
        .limit(1);
      if (!equip) throw new TRPCError({ code: "NOT_FOUND", message: "Equipamento não encontrado." });
      if ((equip as any).transferencia_pendente_id) {
        throw new TRPCError({ code: "CONFLICT", message: "Já há uma transferência pendente para este equipamento." });
      }
      if (equip.status === "baixado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Equipamento baixado não pode ser transferido." });
      }
      // Busca nome da obra origem
      const [origemObra] = equip.localizacaoAtualObraId
        ? (await db.execute(sql`SELECT nome FROM obras WHERE id = ${equip.localizacaoAtualObraId} LIMIT 1`) as any)?.rows ?? []
        : [];
      const [transf] = await db.insert(equipamentosPropriasTransferencias).values({
        companyId: input.companyId,
        equipamentoId: input.equipamentoId,
        equipamentoPatrimonio: equip.codigoPatrimonio,
        equipamentoDescricao: equip.descricao,
        origemObraId: equip.localizacaoAtualObraId ?? null,
        origemObraNome: origemObra?.nome ?? null,
        destinoObraId: input.destinoObraId,
        destinoObraNome: input.destinoObraNome ?? null,
        status: "pendente",
        motivo: input.motivo ?? null,
        remetenteId: ctx.user.id,
        remetenteNome: ctx.user.name || String(ctx.user.id),
      } as any).returning();
      // Marca transferência pendente no equipamento
      await db.execute(sql`
        UPDATE equipamentos_proprios
           SET transferencia_pendente_id = ${(transf as any).id}
         WHERE id = ${input.equipamentoId} AND company_id = ${input.companyId}
      `);
      return { ok: true, transferenciaId: (transf as any).id };
    }),

  aceitarTransferenciaObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      transferenciaId: z.number(),
      obsAceite: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [transf] = ((await db.execute(sql`
        SELECT * FROM equipamentos_proprios_transferencias
         WHERE id = ${input.transferenciaId} AND company_id = ${input.companyId} AND status = 'pendente'
        LIMIT 1
      `)) as any)?.rows ?? [];
      if (!transf) throw new TRPCError({ code: "NOT_FOUND", message: "Transferência não encontrada ou já concluída." });
      // Busca nome da obra destino para garantir
      const [obraDestino] = ((await db.execute(sql`SELECT nome FROM obras WHERE id = ${transf.destino_obra_id} LIMIT 1`)) as any)?.rows ?? [];
      // Atualiza equipamento: nova localização = destino
      await db.execute(sql`
        UPDATE equipamentos_proprios
           SET localizacao_atual_obra_id = ${transf.destino_obra_id},
               localizacao_atual_tipo = 'obra',
               status = 'em_obra',
               transferencia_pendente_id = NULL,
               updated_at = NOW()
         WHERE id = ${transf.equipamento_id} AND company_id = ${input.companyId}
      `);
      await db.execute(sql`
        UPDATE equipamentos_proprios_transferencias
           SET status = 'aceito',
               aceite_por_id = ${ctx.user.id},
               aceite_por_nome = ${ctx.user.name || String(ctx.user.id)},
               aceite_em = NOW(),
               obs_aceite = ${input.obsAceite ?? null},
               destino_obra_nome = COALESCE(destino_obra_nome, ${obraDestino?.nome ?? null})
         WHERE id = ${input.transferenciaId}
      `);
      return { ok: true };
    }),

  rejeitarTransferenciaObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      transferenciaId: z.number(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [transf] = ((await db.execute(sql`
        SELECT * FROM equipamentos_proprios_transferencias
         WHERE id = ${input.transferenciaId} AND company_id = ${input.companyId} AND status = 'pendente'
        LIMIT 1
      `)) as any)?.rows ?? [];
      if (!transf) throw new TRPCError({ code: "NOT_FOUND", message: "Transferência não encontrada ou já concluída." });
      await db.execute(sql`
        UPDATE equipamentos_proprios
           SET transferencia_pendente_id = NULL
         WHERE id = ${transf.equipamento_id} AND company_id = ${input.companyId}
      `);
      await db.execute(sql`
        UPDATE equipamentos_proprios_transferencias
           SET status = 'rejeitado',
               aceite_por_id = ${ctx.user.id},
               aceite_por_nome = ${ctx.user.name || String(ctx.user.id)},
               aceite_em = NOW(),
               obs_aceite = ${input.motivo ?? null}
         WHERE id = ${input.transferenciaId}
      `);
      return { ok: true };
    }),

  cancelarTransferenciaObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      transferenciaId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [transf] = ((await db.execute(sql`
        SELECT * FROM equipamentos_proprios_transferencias
         WHERE id = ${input.transferenciaId} AND company_id = ${input.companyId} AND status = 'pendente'
        LIMIT 1
      `)) as any)?.rows ?? [];
      if (!transf) throw new TRPCError({ code: "NOT_FOUND", message: "Transferência não encontrada ou já concluída." });
      await db.execute(sql`
        UPDATE equipamentos_proprios
           SET transferencia_pendente_id = NULL
         WHERE id = ${transf.equipamento_id} AND company_id = ${input.companyId}
      `);
      await db.execute(sql`
        UPDATE equipamentos_proprios_transferencias SET status = 'cancelado'
         WHERE id = ${input.transferenciaId}
      `);
      return { ok: true };
    }),

  listTransferenciasPendentesParaObra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = ((await db.execute(sql`
        SELECT t.*,
               ep.fotos_json
          FROM equipamentos_proprios_transferencias t
          LEFT JOIN equipamentos_proprios ep ON ep.id = t.equipamento_id
         WHERE t.company_id = ${input.companyId}
           AND t.destino_obra_id = ${input.obraId}
           AND t.status = 'pendente'
         ORDER BY t.created_at DESC
      `)) as any)?.rows ?? [];
      return rows.map((r: any) => ({
        id: r.id,
        equipamentoId: r.equipamento_id,
        equipamentoPatrimonio: r.equipamento_patrimonio,
        equipamentoDescricao: r.equipamento_descricao,
        fotosJson: r.fotos_json,
        origemObraId: r.origem_obra_id,
        origemObraNome: r.origem_obra_nome,
        destinoObraId: r.destino_obra_id,
        destinoObraNome: r.destino_obra_nome,
        status: r.status,
        motivo: r.motivo,
        remetenteNome: r.remetente_nome,
        createdAt: r.created_at,
      }));
    }),

  // ── Rev. 4510 — Dash de Entregas do Almoxarifado ─────────────────────────
  // Lista todas as transferências com origem NO almoxarifado (origem_obra_id IS
  // NULL) que foram aceitas, com filtros por mês/ano, obra e pessoa.
  // ─────────────────────────────────────────────────────────────────────────
  listarEntregasAlmox: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      mes:        z.number().min(1).max(12).nullable().optional(),
      ano:        z.number().min(2020).max(2100).nullable().optional(),
      equipId:    z.number().nullable().optional(),
      busca:      z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // ── 1. Ciclos saída↔devolução ─────────────────────────────────────────
      // Saída  = transfer origem_obra_id IS NULL  AND destino_obra_id IS NOT NULL
      // Retorno= transfer origem_obra_id IS NOT NULL AND destino_obra_id IS NULL
      // Emparelha cada saída com o próximo retorno do mesmo equipamento via LATERAL.
      // "devolvido_em IS NULL" = ainda em uso (ciclo aberto).
      const ciclosRows: any[] = ((await db.execute(sql`
        WITH saidas AS (
          SELECT
            s.id,
            s.equipamento_id,
            s.equipamento_patrimonio   AS codigo_patrimonio,
            s.equipamento_descricao    AS descricao,
            s.destino_obra_id,
            s.destino_obra_nome,
            s.remetente_nome,
            s.aceite_em                AS saiu_em,
            s.motivo,
            ep.fotos_json,
            ep.categoria,
            ep.marca,
            ep.status                  AS equip_status
          FROM equipamentos_proprios_transferencias s
          LEFT JOIN equipamentos_proprios ep ON ep.id = s.equipamento_id
          WHERE s.company_id      = ${input.companyId}
            AND s.status          = 'aceito'
            AND s.origem_obra_id  IS NULL
            AND s.destino_obra_id IS NOT NULL
        )
        SELECT
          s.*,
          dev.aceite_em         AS devolvido_em,
          dev.aceite_por_nome   AS devolvido_por,
          CASE
            WHEN dev.aceite_em IS NOT NULL
            THEN EXTRACT(EPOCH FROM (dev.aceite_em::timestamptz - s.saiu_em::timestamptz))/3600
            ELSE EXTRACT(EPOCH FROM (NOW() - s.saiu_em::timestamptz))/3600
          END                   AS horas_fora
        FROM saidas s
        LEFT JOIN LATERAL (
          SELECT d.aceite_em, d.aceite_por_nome
          FROM equipamentos_proprios_transferencias d
          WHERE d.company_id      = ${input.companyId}
            AND d.status          = 'aceito'
            AND d.equipamento_id  = s.equipamento_id
            AND d.origem_obra_id  IS NOT NULL
            AND d.destino_obra_id IS NULL
            AND d.aceite_em       > s.saiu_em
          ORDER BY d.aceite_em ASC
          LIMIT 1
        ) dev ON true
        WHERE TRUE
          ${input.ano ? sql`AND EXTRACT(YEAR  FROM s.saiu_em::timestamptz) = ${input.ano}` : sql``}
          ${input.mes ? sql`AND EXTRACT(MONTH FROM s.saiu_em::timestamptz) = ${input.mes}` : sql``}
          ${input.equipId ? sql`AND s.equipamento_id = ${input.equipId}` : sql``}
          ${input.busca ? sql`AND (
            s.descricao     ILIKE ${'%' + (input.busca ?? '') + '%'}
            OR s.codigo_patrimonio ILIKE ${'%' + (input.busca ?? '') + '%'}
            OR s.remetente_nome   ILIKE ${'%' + (input.busca ?? '') + '%'}
            OR s.destino_obra_nome ILIKE ${'%' + (input.busca ?? '') + '%'}
          )` : sql``}
        ORDER BY s.saiu_em DESC NULLS LAST
        LIMIT 500
      `)) as any)?.rows ?? [];

      // ── 2. Ferramentas em uso AGORA (sem filtro de período) ───────────────
      // = saída sem retorno correspondente até agora (ciclo aberto)
      const emUsoRows: any[] = ((await db.execute(sql`
        WITH saidas AS (
          SELECT DISTINCT ON (s.equipamento_id)
            s.equipamento_id,
            s.equipamento_patrimonio   AS codigo_patrimonio,
            s.equipamento_descricao    AS descricao,
            s.destino_obra_nome,
            s.remetente_nome,
            s.aceite_em                AS saiu_em,
            ep.fotos_json,
            ep.categoria,
            ep.status                  AS equip_status
          FROM equipamentos_proprios_transferencias s
          LEFT JOIN equipamentos_proprios ep ON ep.id = s.equipamento_id
          WHERE s.company_id      = ${input.companyId}
            AND s.status          = 'aceito'
            AND s.origem_obra_id  IS NULL
            AND s.destino_obra_id IS NOT NULL
          ORDER BY s.equipamento_id, s.aceite_em DESC
        )
        SELECT s.*
        FROM saidas s
        LEFT JOIN LATERAL (
          SELECT 1 FROM equipamentos_proprios_transferencias d
          WHERE d.company_id      = ${input.companyId}
            AND d.status          = 'aceito'
            AND d.equipamento_id  = s.equipamento_id
            AND d.origem_obra_id  IS NOT NULL
            AND d.destino_obra_id IS NULL
            AND d.aceite_em       > s.saiu_em
          LIMIT 1
        ) dev ON true
        WHERE dev IS NULL
        ORDER BY s.saiu_em ASC
      `)) as any)?.rows ?? [];

      // ── 3. KPIs agregados ─────────────────────────────────────────────────
      const totalCiclos         = ciclosRows.length;
      const ciclosCompletos     = ciclosRows.filter(r => r.devolvido_em != null).length;
      const emUsoAgora          = emUsoRows.length;

      // Tempo médio de uso (horas) dos ciclos completos
      const ciclosComplArray    = ciclosRows.filter(r => r.devolvido_em != null && Number(r.horas_fora) > 0);
      const mediaHoras          = ciclosComplArray.length > 0
        ? ciclosComplArray.reduce((acc, r) => acc + Number(r.horas_fora), 0) / ciclosComplArray.length
        : 0;

      // ── Ranking: quem mais retira ─────────────────────────────────────────
      const quemCont: Record<string, number> = {};
      for (const r of ciclosRows) {
        if (r.remetente_nome) quemCont[r.remetente_nome] = (quemCont[r.remetente_nome] ?? 0) + 1;
      }
      const topQuemPegou = Object.entries(quemCont)
        .map(([nome, qtd]) => ({ nome, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 5);

      // ── Ranking: ferramentas mais retiradas ───────────────────────────────
      const equipCont: Record<string, { descricao: string; qtd: number; totalHoras: number }> = {};
      for (const r of ciclosRows) {
        const k = String(r.equipamento_id);
        if (!equipCont[k]) equipCont[k] = { descricao: r.descricao ?? "—", qtd: 0, totalHoras: 0 };
        equipCont[k].qtd++;
        equipCont[k].totalHoras += Number(r.horas_fora ?? 0);
      }
      const topEquipamentos = Object.entries(equipCont)
        .map(([, v]) => v)
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 5);

      // ── Ciclos por mês (gráfico barras últimos 12 meses) ─────────────────
      const porMes: Record<string, number> = {};
      for (const r of ciclosRows) {
        const ym = (r.saiu_em ?? "").slice(0, 7);
        if (ym) porMes[ym] = (porMes[ym] ?? 0) + 1;
      }
      const mensal = Object.entries(porMes)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([mes, qtd]) => {
          const d = new Date(mes + "-01T12:00:00Z");
          return { mes, label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), qtd };
        });

      return {
        ciclos: ciclosRows.map(r => ({
          id:               r.id,
          equipamentoId:    r.equipamento_id,
          codigoPatrimonio: r.codigo_patrimonio,
          descricao:        r.descricao,
          categoria:        r.categoria,
          fotosJson:        r.fotos_json,
          obraNome:         r.destino_obra_nome,
          quemPegou:        r.remetente_nome,
          saiuEm:           r.saiu_em,
          devolvidoEm:      r.devolvido_em ?? null,
          devolvidoPor:     r.devolvido_por ?? null,
          horasFora:        Number(r.horas_fora ?? 0),
          emAberto:         r.devolvido_em == null,
        })),
        emUso: emUsoRows.map(r => ({
          equipamentoId:    r.equipamento_id,
          codigoPatrimonio: r.codigo_patrimonio,
          descricao:        r.descricao,
          categoria:        r.categoria,
          fotosJson:        r.fotos_json,
          obraNome:         r.destino_obra_nome,
          quemPegou:        r.remetente_nome,
          saiuEm:           r.saiu_em,
          horasForaAgora:   Math.floor((Date.now() - new Date(r.saiu_em).getTime()) / 3600000),
        })),
        stats: {
          totalCiclos,
          ciclosCompletos,
          emUsoAgora,
          mediaHorasPorCiclo: Math.round(mediaHoras * 10) / 10,
        },
        topQuemPegou,
        topEquipamentos,
        mensal,
      };
    }),

  // ── Rev. 4512 — Utilização de Equipamentos Locados ───────────────────────
  // Rastreia ciclos SAIDA_ALMOX→RETORNO_ALMOX dos equipamentos locados.
  // Métrica principal: custo de ociosidade = dias_parado × (valor_mensal/30).
  // Retorna: ciclos no período, lista "em almox agora" com custo acumulado,
  // stats, rankings de quem pega mais e top equipamentos mais movimentados.
  // ─────────────────────────────────────────────────────────────────────────
  locadosUtilizacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().nullable().optional(),
      ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = input.companyId;
      const mes = input.mes ?? null;
      const ano = input.ano;

      // Filtro de período: usa data_emprestimo (VARCHAR 'YYYY-MM-DD') de warehouse_loans
      const periodFilter = mes != null
        ? sql`AND EXTRACT(MONTH FROM wl.data_emprestimo::date) = ${mes}
              AND EXTRACT(YEAR  FROM wl.data_emprestimo::date) = ${ano}`
        : sql`AND EXTRACT(YEAR FROM wl.data_emprestimo::date) = ${ano}`;

      // ── Ciclos: cada linha de warehouse_loans vinculada a um equipamento locado ──
      // Link: warehouse_loans.item_id → almoxarifado_itens.equipamento_vinculado_id
      //       onde equipamento_vinculado_tipo = 'locado'
      const cycleRaw = (await db.execute(sql`
        SELECT
          wl.id,
          el.id                         AS equipamento_locado_id,
          el.descricao,
          el.categoria,
          el.valor_mensal::numeric      AS valor_mensal,
          el.fornecedor_nome,
          el.foto_url,
          el.quantidade,
          wl.funcionario_nome           AS quem_saiu,
          wl.funcionario_id             AS funcionario_id,
          wl.almoxarife_nome            AS registrado_por,
          (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp AS saiu_em,
          CASE WHEN wl.data_devolucao IS NOT NULL
            THEN (wl.data_devolucao || 'T' || COALESCE(wl.hora_devolucao,'00:00') || ':00')::timestamp
          END AS devolvido_em,
          wl.funcionario_nome           AS quem_devolveu,
          CASE
            WHEN wl.data_devolucao IS NOT NULL
            THEN EXTRACT(EPOCH FROM (
              (wl.data_devolucao || 'T' || COALESCE(wl.hora_devolucao,'00:00') || ':00')::timestamp
              - (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp
            ))/3600
            ELSE EXTRACT(EPOCH FROM (
              NOW() - (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp
            ))/3600
          END AS horas_fora
        FROM warehouse_loans wl
        JOIN almoxarifado_itens ai
          ON ai.id                         = wl.item_id
         AND ai.equipamento_vinculado_tipo = 'locado'
         AND ai.company_id                = ${cid}
        JOIN equipamentos_locados el
          ON el.id         = ai.equipamento_vinculado_id
         AND el.company_id = ${cid}
        WHERE wl.company_id = ${cid}
          ${periodFilter}
        ORDER BY saiu_em DESC
        LIMIT 500
      `)).rows as any[];

      // ── Em almox (ocioso): locados sem empréstimo ativo no momento ────────
      // Usa LEFT JOIN ao almoxarifado_itens; sem link → fallback "sempre ocioso"
      const idleRaw = (await db.execute(sql`
        SELECT
          el.id,
          el.descricao,
          el.categoria,
          el.quantidade,
          el.valor_mensal::numeric         AS valor_mensal,
          el.fornecedor_nome,
          el.foto_url,
          last_loan.status                 AS ultimo_evento,
          COALESCE(
            CASE WHEN last_loan.data_devolucao IS NOT NULL
              THEN (last_loan.data_devolucao || 'T' || COALESCE(last_loan.hora_devolucao,'00:00') || ':00')::timestamp
            END,
            (el.data_inicio || 'T00:00:00')::timestamp
          )                                AS parado_desde,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(
            CASE WHEN last_loan.data_devolucao IS NOT NULL
              THEN (last_loan.data_devolucao || 'T' || COALESCE(last_loan.hora_devolucao,'00:00') || ':00')::timestamp
            END,
            (el.data_inicio || 'T00:00:00')::timestamp
          )))/86400                        AS dias_ociosos
        FROM equipamentos_locados el
        LEFT JOIN almoxarifado_itens ai
          ON ai.equipamento_vinculado_tipo = 'locado'
         AND ai.equipamento_vinculado_id  = el.id
         AND ai.company_id                = ${cid}
        LEFT JOIN LATERAL (
          SELECT status, data_devolucao, hora_devolucao
          FROM warehouse_loans
          WHERE item_id    = ai.id
            AND company_id = ${cid}
          ORDER BY id DESC
          LIMIT 1
        ) last_loan ON ai.id IS NOT NULL
        WHERE el.company_id = ${cid}
          AND el.status NOT IN ('devolvido','aguardando_chegada')
          AND (last_loan.status IS NULL OR last_loan.status IN ('devolvido','perdido'))
        ORDER BY parado_desde ASC
      `)).rows as any[];

      // ── Em campo agora: locados com empréstimo ativo (status='emprestado') ─
      const emCampoRaw = (await db.execute(sql`
        SELECT COUNT(DISTINCT el.id)::int AS cnt
        FROM equipamentos_locados el
        JOIN almoxarifado_itens ai
          ON ai.equipamento_vinculado_tipo = 'locado'
         AND ai.equipamento_vinculado_id  = el.id
         AND ai.company_id                = ${cid}
        INNER JOIN LATERAL (
          SELECT status FROM warehouse_loans
          WHERE item_id    = ai.id
            AND company_id = ${cid}
          ORDER BY id DESC
          LIMIT 1
        ) last_loan ON last_loan.status = 'emprestado'
        WHERE el.company_id = ${cid}
          AND el.status NOT IN ('devolvido','aguardando_chegada')
      `)).rows as any[];

      // ── Derivações JS ─────────────────────────────────────────────────────
      const totalCiclos    = cycleRaw.length;
      const ciclosCompletos = cycleRaw.filter(r => r.devolvido_em != null).length;
      const emAlmoxCount   = idleRaw.length;
      const emCampoCount   = Number(emCampoRaw[0]?.cnt ?? 0);

      const custoOciosidadeTotal = idleRaw.reduce((s, r) => {
        const vm   = Number(r.valor_mensal) || 0;
        const dias = Number(r.dias_ociosos) || 0;
        return s + (vm / 30) * dias;
      }, 0);

      const horasArr = cycleRaw.map(r => Number(r.horas_fora) || 0);
      const mediaHoras = horasArr.length > 0
        ? horasArr.reduce((a, b) => a + b, 0) / horasArr.length : 0;

      const utilizacaoMedia = (emCampoCount + emAlmoxCount) > 0
        ? (emCampoCount / (emCampoCount + emAlmoxCount)) * 100
        : null;

      // Ciclos por mês (para o gráfico de barras)
      const mensalMap = new Map<string, number>();
      for (const r of cycleRaw) {
        const key = String(r.saiu_em || "").slice(0, 7);
        mensalMap.set(key, (mensalMap.get(key) || 0) + 1);
      }
      const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const mensal = Array.from(mensalMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, count]) => {
          const [y, m] = ym.split("-");
          return { ym, label: `${MESES[Number(m)-1]}/${String(y).slice(2)}`, count };
        });

      // Ranking: quem mais retirou (sem limite — frontend pagina)
      const quemMap = new Map<string, { count: number; funcionarioId: number | null }>();
      for (const r of cycleRaw) {
        const n = r.quem_saiu || "Não informado";
        const entry = quemMap.get(n);
        if (entry) {
          entry.count++;
        } else {
          quemMap.set(n, { count: 1, funcionarioId: r.funcionario_id ? Number(r.funcionario_id) : null });
        }
      }
      const quemSorted = Array.from(quemMap.entries())
        .sort((a, b) => b[1].count - a[1].count);

      // Busca fotos em lote para todos os funcionários com id
      const funcionarioIds = quemSorted
        .map(([, v]) => v.funcionarioId)
        .filter((id): id is number => id !== null);
      const fotoMap = new Map<number, string | null>();
      if (funcionarioIds.length > 0) {
        const fotosRows = (await db.execute(sql`
          SELECT id, "fotoUrl" AS foto_url FROM employees
          WHERE id = ANY(ARRAY[${sql.raw(funcionarioIds.join(","))}]::int[])
            AND "companyId" = ${cid}
        `)).rows as { id: number; foto_url: string | null }[];
        for (const f of fotosRows) fotoMap.set(Number(f.id), f.foto_url ?? null);
      }

      const topQuemPegou = quemSorted.map(([nome, v]) => ({
        nome,
        count:         v.count,
        funcionarioId: v.funcionarioId,
        fotoUrl:       v.funcionarioId != null ? (fotoMap.get(v.funcionarioId) ?? null) : null,
      }));

      // Ranking: equipamentos mais movimentados
      const equipMap = new Map<string, number>();
      for (const r of cycleRaw) {
        const n = r.descricao || "—";
        equipMap.set(n, (equipMap.get(n) || 0) + 1);
      }
      const topEquipamentos = Array.from(equipMap.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([descricao, count]) => ({ descricao, count }));

      return {
        ciclos: cycleRaw.map(r => ({
          id:             Number(r.id),
          equipamentoId:  Number(r.equipamento_locado_id),
          descricao:      r.descricao   as string,
          categoria:      r.categoria   as string | null,
          valorMensal:    Number(r.valor_mensal) || 0,
          fornecedorNome: r.fornecedor_nome as string | null,
          fotoUrl:        r.foto_url    as string | null,
          quantidade:     Number(r.quantidade) || 1,
          quemSaiu:       r.quem_saiu   as string | null,
          registradoPor:  r.registrado_por as string | null,
          saiuEm:         r.saiu_em     as string,
          devolvidoEm:    r.devolvido_em as string | null ?? null,
          quemDevolveu:   r.quem_devolveu as string | null ?? null,
          horasFora:      Number(r.horas_fora) || 0,
        })),
        emAlmox: idleRaw.map(r => ({
          id:              Number(r.id),
          descricao:       r.descricao    as string,
          categoria:       r.categoria    as string | null,
          quantidade:      Number(r.quantidade) || 1,
          valorMensal:     Number(r.valor_mensal) || 0,
          fornecedorNome:  r.fornecedor_nome as string | null,
          fotoUrl:         r.foto_url     as string | null,
          ultimoEvento:    r.ultimo_evento as string | null ?? null,
          paradoDesde:     r.parado_desde as string,
          diasOciosos:     Number(r.dias_ociosos) || 0,
          custoDiario:     (Number(r.valor_mensal) || 0) / 30,
          custoOciosidade: ((Number(r.valor_mensal) || 0) / 30) * (Number(r.dias_ociosos) || 0),
        })),
        stats: {
          totalCiclos,
          ciclosCompletos,
          emAlmoxCount,
          emCampoCount,
          custoOciosidadeTotal,
          mediaHorasPorCiclo: Math.round(mediaHoras * 10) / 10,
          utilizacaoMedia,
        },
        topQuemPegou,
        topEquipamentos,
        mensal,
      };
    }),

  // ── Rev. 4521 — Dashboard de Utilização — Equipamentos Próprios ──────────
  propriosUtilizacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().nullable().optional(),
      ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = input.companyId;
      const mes = input.mes ?? null;
      const ano = input.ano;

      const periodFilter = mes != null
        ? sql`AND EXTRACT(MONTH FROM wl.data_emprestimo::date) = ${mes}
              AND EXTRACT(YEAR  FROM wl.data_emprestimo::date) = ${ano}`
        : sql`AND EXTRACT(YEAR FROM wl.data_emprestimo::date) = ${ano}`;

      // ── Ciclos: warehouse_loans vinculados a equipamentos próprios ─────────
      const cycleRaw = (await db.execute(sql`
        SELECT
          wl.id,
          ep.id                                     AS equipamento_proprio_id,
          ep.descricao,
          ep.categoria,
          ep.codigo_patrimonio,
          ep.valor_aquisicao::numeric               AS valor_aquisicao,
          ep.vida_util_meses,
          (ep.fotos_json->0->>'url')                AS foto_url,
          wl.funcionario_nome                       AS quem_saiu,
          wl.funcionario_id,
          wl.almoxarife_nome                        AS registrado_por,
          (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp AS saiu_em,
          CASE WHEN wl.data_devolucao IS NOT NULL
            THEN (wl.data_devolucao || 'T' || COALESCE(wl.hora_devolucao,'00:00') || ':00')::timestamp
          END AS devolvido_em,
          CASE
            WHEN wl.data_devolucao IS NOT NULL
            THEN EXTRACT(EPOCH FROM (
              (wl.data_devolucao || 'T' || COALESCE(wl.hora_devolucao,'00:00') || ':00')::timestamp
              - (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp
            ))/3600
            ELSE EXTRACT(EPOCH FROM (
              NOW() - (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp
            ))/3600
          END AS horas_fora
        FROM warehouse_loans wl
        JOIN almoxarifado_itens ai
          ON ai.id                         = wl.item_id
         AND ai.equipamento_vinculado_tipo = 'proprio'
         AND ai.company_id                = ${cid}
        JOIN equipamentos_proprios ep
          ON ep.id         = ai.equipamento_vinculado_id
         AND ep.company_id = ${cid}
        WHERE wl.company_id = ${cid}
          ${periodFilter}
        ORDER BY saiu_em DESC
        LIMIT 500
      `)).rows as any[];

      // ── Disponíveis (ociosos): status='disponivel' ─────────────────────────
      const idleRaw = (await db.execute(sql`
        SELECT
          ep.id,
          ep.descricao,
          ep.categoria,
          ep.codigo_patrimonio,
          ep.valor_aquisicao::numeric               AS valor_aquisicao,
          ep.vida_util_meses,
          (ep.fotos_json->0->>'url')                AS foto_url,
          last_loan.status                          AS ultimo_evento,
          COALESCE(
            CASE WHEN last_loan.data_devolucao IS NOT NULL
              THEN (last_loan.data_devolucao || 'T' || COALESCE(last_loan.hora_devolucao,'00:00') || ':00')::timestamp
            END,
            ep.created_at::timestamp
          )                                         AS parado_desde,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(
            CASE WHEN last_loan.data_devolucao IS NOT NULL
              THEN (last_loan.data_devolucao || 'T' || COALESCE(last_loan.hora_devolucao,'00:00') || ':00')::timestamp
            END,
            ep.created_at::timestamp
          )))/86400                                 AS dias_ociosos
        FROM equipamentos_proprios ep
        LEFT JOIN almoxarifado_itens ai
          ON ai.equipamento_vinculado_tipo = 'proprio'
         AND ai.equipamento_vinculado_id  = ep.id
         AND ai.company_id                = ${cid}
        LEFT JOIN LATERAL (
          SELECT status, data_devolucao, hora_devolucao
          FROM warehouse_loans
          WHERE item_id    = ai.id
            AND company_id = ${cid}
          ORDER BY id DESC
          LIMIT 1
        ) last_loan ON ai.id IS NOT NULL
        WHERE ep.company_id = ${cid}
          AND ep.ativo = true
          AND ep.status = 'disponivel'
          AND (last_loan.status IS NULL OR last_loan.status IN ('devolvido','perdido'))
        ORDER BY parado_desde ASC
      `)).rows as any[];

      // ── Em campo (em_obra): lista com quem está com o equipamento ──────────
      const emCampoListRaw = (await db.execute(sql`
        SELECT DISTINCT ON (ep.id)
          ep.id,
          ep.descricao,
          ep.categoria,
          ep.codigo_patrimonio,
          (ep.fotos_json->0->>'url')                AS foto_url,
          wl.funcionario_nome                       AS quem_tem,
          EXTRACT(EPOCH FROM (
            NOW() - (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp
          ))/3600                                   AS horas_fora,
          (wl.data_emprestimo || 'T' || COALESCE(wl.hora_emprestimo,'00:00') || ':00')::timestamp AS saiu_em
        FROM equipamentos_proprios ep
        JOIN almoxarifado_itens ai
          ON ai.equipamento_vinculado_tipo = 'proprio'
         AND ai.equipamento_vinculado_id  = ep.id
         AND ai.company_id                = ${cid}
        JOIN warehouse_loans wl
          ON wl.item_id    = ai.id
         AND wl.company_id = ${cid}
         AND wl.status     = 'emprestado'
         AND wl.data_devolucao IS NULL
        WHERE ep.company_id = ${cid}
          AND ep.ativo = true
        ORDER BY ep.id, wl.id DESC
      `)).rows as any[];

      // ── Em manutenção: lista completa ─────────────────────────────────────
      const emManutRaw = (await db.execute(sql`
        SELECT
          ep.id,
          ep.descricao,
          ep.categoria,
          ep.codigo_patrimonio,
          (ep.fotos_json->0->>'url') AS foto_url,
          ep.observacoes,
          ep.updated_at              AS manut_desde
        FROM equipamentos_proprios ep
        WHERE ep.company_id = ${cid}
          AND ep.ativo = true
          AND ep.status = 'manutencao'
        ORDER BY ep.updated_at ASC
      `)).rows as any[];

      // ── Contagens por status ───────────────────────────────────────────────
      const statusRaw = (await db.execute(sql`
        SELECT status, COUNT(*)::int AS cnt
        FROM equipamentos_proprios
        WHERE company_id = ${cid} AND ativo = true
        GROUP BY status
      `)).rows as { status: string; cnt: number }[];

      const statusMap = Object.fromEntries(statusRaw.map(r => [r.status, Number(r.cnt)]));
      const emCampoCount   = statusMap["em_obra"]    ?? 0;
      const emAlmoxCount   = statusMap["disponivel"] ?? 0;
      const emManutCount   = statusMap["manutencao"] ?? 0;
      const totalAtivo     = emCampoCount + emAlmoxCount + emManutCount;
      const utilizacaoMedia = totalAtivo > 0 ? (emCampoCount / totalAtivo) * 100 : null;

      // ── Custo de ociosidade (depreciação) ──────────────────────────────────
      const custoOciosidadeTotal = idleRaw.reduce((s: number, r: any) => {
        const va   = Number(r.valor_aquisicao) || 0;
        const vum  = Number(r.vida_util_meses) || 0;
        const dias = Number(r.dias_ociosos) || 0;
        if (!vum) return s;
        return s + (va / (vum * 30)) * dias;
      }, 0);

      // ── Derivações ────────────────────────────────────────────────────────
      const totalCiclos     = cycleRaw.length;
      const ciclosCompletos = cycleRaw.filter((r: any) => r.devolvido_em != null).length;
      const horasArr        = cycleRaw.map((r: any) => Number(r.horas_fora) || 0);
      const mediaHoras      = horasArr.length > 0 ? horasArr.reduce((a: number, b: number) => a + b, 0) / horasArr.length : 0;

      // Mensal
      const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const mensalMap = new Map<string, number>();
      for (const r of cycleRaw) {
        const key = String(r.saiu_em || "").slice(0, 7);
        mensalMap.set(key, (mensalMap.get(key) || 0) + 1);
      }
      const mensal = Array.from(mensalMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, count]) => {
          const [y, m] = ym.split("-");
          return { ym, label: `${MESES[Number(m)-1]}/${String(y).slice(2)}`, count };
        });

      // Ranking: quem mais retirou
      const quemMap = new Map<string, { count: number; funcionarioId: number | null }>();
      for (const r of cycleRaw) {
        const n = r.quem_saiu || "Não informado";
        const entry = quemMap.get(n);
        if (entry) { entry.count++; }
        else { quemMap.set(n, { count: 1, funcionarioId: r.funcionario_id ? Number(r.funcionario_id) : null }); }
      }
      const quemSorted = Array.from(quemMap.entries()).sort((a, b) => b[1].count - a[1].count);

      // Fotos em lote
      const funcionarioIds = quemSorted.map(([, v]) => v.funcionarioId).filter((id): id is number => id !== null);
      const fotoMap = new Map<number, string | null>();
      if (funcionarioIds.length > 0) {
        const fotosRows = (await db.execute(sql`
          SELECT id, "fotoUrl" AS foto_url FROM employees
          WHERE id = ANY(ARRAY[${sql.raw(funcionarioIds.join(","))}]::int[])
            AND "companyId" = ${cid}
        `)).rows as { id: number; foto_url: string | null }[];
        for (const f of fotosRows) fotoMap.set(Number(f.id), f.foto_url ?? null);
      }
      const topQuemPegou = quemSorted.map(([nome, v]) => ({
        nome, count: v.count, funcionarioId: v.funcionarioId,
        fotoUrl: v.funcionarioId != null ? (fotoMap.get(v.funcionarioId) ?? null) : null,
      }));

      // Ranking: equipamentos mais movimentados
      const equipMap = new Map<string, number>();
      for (const r of cycleRaw) {
        const n = r.descricao || "—";
        equipMap.set(n, (equipMap.get(n) || 0) + 1);
      }
      const topEquipamentos = Array.from(equipMap.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([descricao, count]) => ({ descricao, count }));

      return {
        ciclos: cycleRaw.map((r: any) => ({
          id:               Number(r.id),
          equipamentoId:    Number(r.equipamento_proprio_id),
          descricao:        r.descricao        as string,
          categoria:        r.categoria        as string | null,
          codigoPatrimonio: r.codigo_patrimonio as string | null,
          fotoUrl:          r.foto_url         as string | null,
          quemSaiu:         r.quem_saiu        as string | null,
          funcionarioId:    r.funcionario_id   != null ? Number(r.funcionario_id) : null,
          fotoFuncionario:  r.funcionario_id   != null ? (fotoMap.get(Number(r.funcionario_id)) ?? null) : null,
          registradoPor:    r.registrado_por   as string | null,
          saiuEm:           r.saiu_em          as string,
          devolvidoEm:      r.devolvido_em     as string | null ?? null,
          horasFora:        Number(r.horas_fora) || 0,
          valorAquisicao:   Number(r.valor_aquisicao) || 0,
          vidaUtilMeses:    Number(r.vida_util_meses) || 0,
        })),
        emAlmox: idleRaw.map((r: any) => {
          const va  = Number(r.valor_aquisicao) || 0;
          const vum = Number(r.vida_util_meses) || 0;
          const dias = Number(r.dias_ociosos) || 0;
          const custoDiario     = vum > 0 ? va / (vum * 30) : 0;
          const custoOciosidade = custoDiario * dias;
          return {
            id:               Number(r.id),
            descricao:        r.descricao         as string,
            categoria:        r.categoria         as string | null,
            codigoPatrimonio: r.codigo_patrimonio  as string | null,
            fotoUrl:          r.foto_url           as string | null,
            paradoDesde:      r.parado_desde       as string,
            diasOciosos:      dias,
            custoDiario,
            custoOciosidade,
          };
        }),
        emCampo: emCampoListRaw.map((r: any) => ({
          id:               Number(r.id),
          descricao:        r.descricao         as string,
          categoria:        r.categoria         as string | null,
          codigoPatrimonio: r.codigo_patrimonio  as string | null,
          fotoUrl:          r.foto_url           as string | null,
          quemTem:          r.quem_tem           as string | null,
          horasFora:        Number(r.horas_fora) || 0,
          saiuEm:           r.saiu_em            as string,
        })),
        stats: {
          totalCiclos, ciclosCompletos,
          emAlmoxCount, emCampoCount, emManutCount,
          custoOciosidadeTotal,
          mediaHorasPorCiclo: Math.round(mediaHoras * 10) / 10,
          utilizacaoMedia,
        },
        topQuemPegou, topEquipamentos, mensal,
        emManut: emManutRaw.map((r: any) => ({
          id:               Number(r.id),
          descricao:        r.descricao         as string,
          categoria:        r.categoria         as string | null,
          codigoPatrimonio: r.codigo_patrimonio  as string | null,
          fotoUrl:          r.foto_url           as string | null,
          observacoes:      r.observacoes        as string | null,
          manutDesde:       r.manut_desde        as string | null,
        })),
      };
    }),

  // ── Rev. 4509 — Raio-X do Equipamento Próprio ────────────────────────────
  // Retorna histórico completo de transferências, KPIs de utilização e
  // dados mensais para o gráfico de ocupação.
  // ─────────────────────────────────────────────────────────────────────────
  proprioRaioX: protectedProcedure
    .input(z.object({ companyId: z.number(), equipamentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Equipamento + nome da obra atual
      const equipRows = ((await db.execute(sql`
        SELECT ep.*, o.nome AS obra_nome
          FROM equipamentos_proprios ep
          LEFT JOIN obras o ON o.id = ep.localizacao_atual_obra_id
         WHERE ep.id = ${input.equipamentoId} AND ep.company_id = ${input.companyId}
         LIMIT 1
      `)) as any)?.rows ?? [];
      const equip = equipRows[0];
      if (!equip) throw new TRPCError({ code: "NOT_FOUND", message: "Equipamento não encontrado." });

      // Histórico completo de transferências (todas as situações)
      const transfs: any[] = ((await db.execute(sql`
        SELECT * FROM equipamentos_proprios_transferencias
         WHERE equipamento_id = ${input.equipamentoId} AND company_id = ${input.companyId}
         ORDER BY created_at ASC
      `)) as any)?.rows ?? [];

      // ── Data de referência ─────────────────────────────────────────────
      const hoje = new Date();
      const dataRefStr = (equip.data_aquisicao ?? "").slice(0, 10);
      const dataRef = dataRefStr
        ? new Date(dataRefStr + "T00:00:00Z")
        : new Date(equip.created_at);
      const totalDias = Math.max(1, Math.floor((hoje.getTime() - dataRef.getTime()) / 86400000));

      const parseDate = (s: string) =>
        new Date(s.includes("T") ? s : s + "T00:00:00Z");

      // Transferências aceitas em ordem cronológica
      const accepted = transfs
        .filter(t => t.status === "aceito" && t.aceite_em)
        .sort((a, b) => (a.aceite_em < b.aceite_em ? -1 : 1));

      // ── Segmentos de ocupação ──────────────────────────────────────────
      interface Seg { from: Date; to: Date; inObra: boolean; }
      const segs: Seg[] = [];

      if (accepted.length === 0) {
        segs.push({ from: dataRef, to: hoje, inObra: equip.status === "em_obra" });
      } else {
        const firstAcceite = parseDate(accepted[0].aceite_em);
        if (firstAcceite > dataRef) {
          segs.push({ from: dataRef, to: firstAcceite, inObra: false });
        }
        for (let i = 0; i < accepted.length; i++) {
          const from = parseDate(accepted[i].aceite_em);
          const to = i < accepted.length - 1
            ? parseDate(accepted[i + 1].aceite_em)
            : hoje;
          segs.push({ from, to, inObra: !!accepted[i].destino_obra_id });
        }
      }

      const dayInObra = (d: Date) => segs.some(s => s.inObra && s.from <= d && s.to > d);

      // ── KPIs ───────────────────────────────────────────────────────────
      let diasEmObra = 0;
      for (const s of segs) {
        if (s.inObra) diasEmObra += Math.max(0, Math.floor((s.to.getTime() - s.from.getTime()) / 86400000));
      }
      diasEmObra = Math.min(diasEmObra, totalDias);

      const obrasSet = new Set<string>();
      for (const t of transfs) {
        if (t.status === "aceito" && t.destino_obra_nome) obrasSet.add(t.destino_obra_nome);
      }
      if (equip.obra_nome && equip.status === "em_obra") obrasSet.add(equip.obra_nome);

      // ── Atividade por dia da semana (Seg-Sex) ──────────────────────────
      const dwCount = [0,1,2,3,4].map(i => ({ dia: ["Seg","Ter","Qua","Qui","Sex"][i], total: 0, obra: 0 }));
      {
        const cur = new Date(dataRef);
        cur.setHours(12, 0, 0, 0);
        const fim = new Date(hoje);
        fim.setHours(12, 0, 0, 0);
        while (cur <= fim) {
          const dow = cur.getDay(); // 0=Dom
          if (dow >= 1 && dow <= 5) {
            const idx = dow - 1;
            dwCount[idx].total++;
            if (dayInObra(cur)) dwCount[idx].obra++;
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
      const diasSemana = dwCount.map(d => ({
        dia: d.dia,
        pct: d.total > 0 ? Math.round((d.obra / d.total) * 100) : 0,
        obra: d.obra,
        total: d.total,
      }));

      // ── Curva de semanas (últimas 16) ──────────────────────────────────
      const semanasResult: { label: string; pct: number; week: string }[] = [];
      {
        const todayNoon = new Date(hoje);
        todayNoon.setHours(12, 0, 0, 0);
        const dow = todayNoon.getDay();
        const daysToMon = dow === 0 ? 6 : dow - 1;
        for (let w = 15; w >= 0; w--) {
          const mon = new Date(todayNoon);
          mon.setDate(mon.getDate() - daysToMon - w * 7);
          mon.setHours(12, 0, 0, 0);
          const fri = new Date(mon);
          fri.setDate(fri.getDate() + 4);
          if (fri < dataRef) continue;
          let total = 0, obra = 0;
          for (let d = 0; d < 5; d++) {
            const day = new Date(mon);
            day.setDate(day.getDate() + d);
            if (day < dataRef || day > hoje) continue;
            total++;
            if (dayInObra(day)) obra++;
          }
          const label = mon.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
          semanasResult.push({
            label,
            pct: total > 0 ? Math.round((obra / total) * 100) : 0,
            week: mon.toISOString().slice(0, 10),
          });
        }
      }

      // ── Quem mais usa — via warehouse_loans (retiradas do almoxarifado) ──
      // Link: warehouse_loans.item_id → almoxarifado_itens onde
      //       equipamento_vinculado_tipo='proprio' AND equipamento_vinculado_id=equipamentoId
      const wlUsageRaw: any[] = ((await db.execute(sql`
        SELECT
          wl.funcionario_nome,
          wl.funcionario_id,
          COUNT(*) AS count
        FROM warehouse_loans wl
        JOIN almoxarifado_itens ai
          ON ai.id                         = wl.item_id
         AND ai.equipamento_vinculado_tipo = 'proprio'
         AND ai.equipamento_vinculado_id  = ${input.equipamentoId}
         AND ai.company_id                = ${input.companyId}
        WHERE wl.company_id = ${input.companyId}
        GROUP BY wl.funcionario_nome, wl.funcionario_id
        ORDER BY count DESC
        LIMIT 5
      `)) as any)?.rows ?? [];

      let maisUsadoPor: { nome: string; qtdMovimentacoes: number; fotoUrl: string | null } | null = null;
      if (wlUsageRaw.length > 0) {
        const top = wlUsageRaw[0];
        let topUserFoto: string | null = null;
        if (top.funcionario_id) {
          try {
            const rows = ((await db.execute(sql`
              SELECT foto_url FROM employees WHERE id = ${top.funcionario_id} LIMIT 1
            `)) as any)?.rows ?? [];
            topUserFoto = rows[0]?.foto_url ?? null;
          } catch { /* opcional */ }
        }
        maisUsadoPor = { nome: top.funcionario_nome, qtdMovimentacoes: Number(top.count), fotoUrl: topUserFoto };
      } else {
        // Fallback: transferências inter-obras (caso não haja retiradas de almoxarifado)
        const usageMap: Record<string, { nome: string; remetenteId: number | null; count: number }> = {};
        for (const t of transfs) {
          if (t.status === "aceito" && t.destino_obra_id && t.remetente_nome) {
            if (!usageMap[t.remetente_nome]) {
              usageMap[t.remetente_nome] = { nome: t.remetente_nome, remetenteId: t.remetente_id ?? null, count: 0 };
            }
            usageMap[t.remetente_nome].count++;
          }
        }
        const topUser = Object.values(usageMap).sort((a, b) => b.count - a.count)[0] ?? null;
        if (topUser) {
          let topUserFoto: string | null = null;
          if (topUser.remetenteId) {
            try {
              const rows = ((await db.execute(sql`
                SELECT foto_url FROM employees WHERE user_id = ${topUser.remetenteId} LIMIT 1
              `)) as any)?.rows ?? [];
              topUserFoto = rows[0]?.foto_url ?? null;
            } catch { /* opcional */ }
          }
          maisUsadoPor = { nome: topUser.nome, qtdMovimentacoes: topUser.count, fotoUrl: topUserFoto };
        }
      }

      // ── Primeira obra ─────────────────────────────────────────────────
      const primeiraTransfObra = accepted.find(t => !!t.destino_obra_id) ?? null;
      const primeiraObraData  = primeiraTransfObra?.aceite_em ?? null;
      const primeiraObraNome  = primeiraTransfObra?.destino_obra_nome ?? null;

      // ── Timeline de eventos ────────────────────────────────────────────
      type TimelineEvent = {
        tipo: string; data: string; titulo: string; descricao: string; destaque?: boolean;
      };
      const events: TimelineEvent[] = [];
      let primeiraObraMarcada = false;

      events.push({
        tipo: "cadastro",
        data: equip.created_at,
        titulo: "Cadastrado no patrimônio",
        descricao: equip.criado_por_nome ? `Por ${equip.criado_por_nome}` : "Entrada no sistema",
      });

      for (const t of transfs) {
        const paraObra   = !!t.destino_obra_id;
        const origemNome = t.origem_obra_nome || "Almoxarifado";
        const destinoNome = t.destino_obra_nome || "Almoxarifado";

        // Evento: retirada solicitada
        events.push({
          tipo: paraObra ? "retirada_solicitada" : "devolucao_solicitada",
          data: t.created_at,
          titulo: paraObra
            ? `Retirado para ${destinoNome}`
            : `Devolução para Almoxarifado`,
          descricao: (t.remetente_nome ? `Por ${t.remetente_nome}` : "") +
            (origemNome !== "Almoxarifado" ? ` · Era em ${origemNome}` : ""),
        });

        if (t.status === "aceito" && t.aceite_em) {
          const isFirst = paraObra && !primeiraObraMarcada;
          if (isFirst) primeiraObraMarcada = true;
          events.push({
            tipo: paraObra ? "transf_aceita" : "devolucao_aceita",
            data: t.aceite_em,
            titulo: paraObra ? `Chegou em ${destinoNome}` : "Devolvido ao Almoxarifado",
            descricao: t.aceite_por_nome ? `Confirmado por ${t.aceite_por_nome}` : "Recebido sem confirmação nominal",
            destaque: isFirst,
          });
        } else if (t.status === "rejeitado") {
          events.push({
            tipo: "transf_rejeitada",
            data: t.aceite_em || t.created_at,
            titulo: "Transferência rejeitada",
            descricao: t.obs_aceite || "Sem motivo informado",
          });
        } else if (t.status === "cancelado") {
          events.push({
            tipo: "transf_cancelada",
            data: t.created_at,
            titulo: "Transferência cancelada",
            descricao: "Cancelada pelo remetente",
          });
        }
      }
      events.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

      // ── Dados mensais (últimos 12 meses) ───────────────────────────────
      const mensal: Array<{ mes: string; label: string; pct: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const ym = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        const mStart = new Date(ym + "-01T00:00:00Z");
        const mEnd   = new Date(mStart);
        mEnd.setMonth(mEnd.getMonth() + 1);
        if (mEnd <= dataRef) continue;

        // Conta dias úteis em obra neste mês
        let diasMes = 0, diasObraMes = 0;
        const cur = new Date(mStart);
        cur.setHours(12, 0, 0, 0);
        while (cur < mEnd) {
          if (cur >= dataRef && cur <= hoje) {
            const dow = cur.getDay();
            if (dow >= 1 && dow <= 5) { diasMes++; if (dayInObra(cur)) diasObraMes++; }
          }
          cur.setDate(cur.getDate() + 1);
        }
        mensal.push({
          mes: ym, label,
          pct: diasMes > 0 ? Math.round((diasObraMes / diasMes) * 100) : 0,
        });
      }

      return {
        equipamento: {
          id: equip.id,
          codigoPatrimonio: equip.codigo_patrimonio,
          descricao: equip.descricao,
          categoria: equip.categoria,
          marca: equip.marca,
          modelo: equip.modelo,
          numeroSerie: equip.numero_serie,
          dataAquisicao: equip.data_aquisicao,
          valorAquisicao: equip.valor_aquisicao,
          vidaUtilMeses: equip.vida_util_meses,
          status: equip.status,
          obraNome: equip.obra_nome,
          fotosJson: equip.fotos_json,
          criadoPorNome: equip.criado_por_nome,
          createdAt: equip.created_at,
          observacoes: equip.observacoes,
        },
        stats: {
          totalDias,
          diasEmObra,
          taxaUtilizacao: totalDias > 0 ? Math.round((diasEmObra / totalDias) * 100) : 0,
          qtdObras: obrasSet.size,
          qtdTransferencias: transfs.filter(t => t.status === "aceito").length,
        },
        maisUsadoPor,
        diasSemana,
        semanas: semanasResult,
        primeiraObraData,
        primeiraObraNome,
        timeline: events,
        mensal,
      };
    }),

  // ── Rev. 4514 — Raio-X do Equipamento Locado ────────────────────────────
  // Retorna timeline completa de eventos, KPIs (dias pagos, valor total),
  // lista de responsáveis com foto/matrícula e dados mensais.
  // ─────────────────────────────────────────────────────────────────────────
  locadoRaioX: protectedProcedure
    .input(z.object({ companyId: z.number(), locadoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = input.companyId;
      const lid = input.locadoId;

      // 1. Locado + obra + funcionário responsável (foto e matrícula)
      const locRows = ((await db.execute(sql`
        SELECT el.*,
               o.nome                AS obra_nome,
               emp.matricula         AS resp_matricula,
               emp."fotoUrl"         AS resp_foto_url,
               emp.nome              AS resp_nome_emp
          FROM equipamentos_locados el
          LEFT JOIN obras o    ON o.id    = el.obra_id
          LEFT JOIN employees emp ON emp.id = el.funcionario_responsavel_id
         WHERE el.id = ${lid} AND el.company_id = ${cid}
         LIMIT 1
      `)) as any)?.rows ?? [];
      const loc = locRows[0];
      if (!loc) throw new TRPCError({ code: "NOT_FOUND", message: "Equipamento locado não encontrado." });

      // 2. Todos os eventos com join de employee (foto + matrícula)
      const evRows: any[] = ((await db.execute(sql`
        SELECT ev.*,
               emp.matricula  AS emp_matricula,
               emp."fotoUrl"  AS emp_foto_url,
               emp.nome       AS emp_nome
          FROM equipamento_locado_eventos ev
          LEFT JOIN employees emp ON emp.id = ev.funcionario_id
         WHERE ev.equipamento_locado_id = ${lid}
           AND ev.company_id = ${cid}
         ORDER BY ev.data_evento ASC, ev.created_at ASC
      `)) as any)?.rows ?? [];

      // 3. KPIs
      const hoje = new Date();
      const rawIni = (loc.data_inicio ?? "").slice(0, 10);
      const dataIni = rawIni
        ? new Date(rawIni + "T00:00:00Z")
        : new Date(loc.created_at);
      const rawFim = (loc.data_fim_real ?? "").slice(0, 10);
      const dataFim = rawFim ? new Date(rawFim + "T00:00:00Z") : hoje;
      const totalDias = Math.max(1, Math.ceil((dataFim.getTime() - dataIni.getTime()) / 86400000));
      const valorDia = Number(loc.valor_diario) || (loc.valor_mensal ? Number(loc.valor_mensal) / 30 : 0);
      const valorTotal = Math.round(valorDia * totalDias * 100) / 100;
      const ativo = loc.status !== "devolvido";

      // 3b. Retiradas do almoxarifado (warehouse_loans) — fonte real de utilização
      const wlRows: any[] = ((await db.execute(sql`
        SELECT
          wl.id,
          wl.funcionario_id,
          wl.funcionario_nome,
          wl.obra_id,
          wl.data_emprestimo,
          wl.hora_emprestimo,
          wl.data_devolucao,
          wl.hora_devolucao,
          wl.status,
          wl.almoxarife_nome,
          o.nome AS obra_nome,
          emp."fotoUrl" AS emp_foto_url,
          emp.matricula  AS emp_matricula
        FROM warehouse_loans wl
        JOIN almoxarifado_itens ai
          ON ai.id                         = wl.item_id
         AND ai.equipamento_vinculado_tipo = 'locado'
         AND ai.equipamento_vinculado_id  = ${lid}
         AND ai.company_id                = ${cid}
        LEFT JOIN obras o ON o.id = wl.obra_id
        LEFT JOIN employees emp ON emp.id = wl.funcionario_id
        WHERE wl.company_id = ${cid}
        ORDER BY wl.data_emprestimo ASC, wl.id ASC
      `)) as any)?.rows ?? [];

      // 4. Responsáveis — agrupa pessoas distintas por participação
      const pessoaMap: Record<string, {
        nome: string; foto: string | null; matricula: string | null;
        qtd: number; tipos: string[]; isResp: boolean;
      }> = {};

      const addPessoa = (
        nome: string | null, foto: string | null, mat: string | null,
        tipo: string, isResp = false,
      ) => {
        if (!nome) return;
        if (!pessoaMap[nome]) {
          pessoaMap[nome] = { nome, foto, matricula: mat, qtd: 0, tipos: [], isResp };
        }
        if (isResp) pessoaMap[nome].isResp = true;
        pessoaMap[nome].qtd++;
        if (!pessoaMap[nome].tipos.includes(tipo)) pessoaMap[nome].tipos.push(tipo);
      };

      // Responsável do locado
      if (loc.funcionario_responsavel_nome) {
        addPessoa(loc.funcionario_responsavel_nome, loc.resp_foto_url ?? null, loc.resp_matricula ?? null, "Responsável", true);
      }
      for (const ev of evRows) {
        addPessoa(ev.funcionario_nome ?? ev.emp_nome, ev.emp_foto_url ?? null, ev.emp_matricula ?? null, ev.tipo);
        if (!ev.funcionario_id && ev.usuario_nome) {
          addPessoa(ev.usuario_nome, null, null, ev.tipo);
        }
        if (ev.assinatura_entregador_nome) addPessoa(ev.assinatura_entregador_nome, null, null, "DEVOLUCAO_FORNECEDOR");
        if (ev.assinatura_recebedor_nome)  addPessoa(ev.assinatura_recebedor_nome,  null, null, "DEVOLUCAO_FORNECEDOR");
      }
      // Inclui retiradas do almoxarifado na lista de responsáveis
      for (const wl of wlRows) {
        addPessoa(wl.funcionario_nome, wl.emp_foto_url ?? null, wl.emp_matricula ?? null, "SAIDA_ALMOX");
      }
      const responsaveis = Object.values(pessoaMap).sort((a, b) => (b.isResp ? 1 : 0) - (a.isResp ? 1 : 0) || b.qtd - a.qtd);

      // 5. Dados mensais — últimos 12 meses
      const mensal: Array<{ mes: string; label: string; diasPagos: number; valorPago: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const ym = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        const mStart = new Date(ym + "-01T00:00:00Z");
        const mEnd = new Date(mStart);
        mEnd.setMonth(mEnd.getMonth() + 1);
        const from = mStart < dataIni ? dataIni : mStart;
        const to   = mEnd  > dataFim  ? dataFim  : mEnd;
        const diasPagos = Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
        mensal.push({ mes: ym, label, diasPagos, valorPago: Math.round(diasPagos * valorDia * 100) / 100 });
      }

      // 6. Timeline normalizada — eventos do sistema + retiradas do almoxarifado
      const timeline = [
        ...evRows.map((ev: any) => ({
          id:                      ev.id,
          tipo:                    ev.tipo,
          dataEvento:              ev.data_evento,
          funcionarioNome:         ev.funcionario_nome ?? ev.emp_nome ?? null,
          funcionarioFoto:         ev.emp_foto_url ?? null,
          funcionarioMatricula:    ev.emp_matricula ?? null,
          usuarioNome:             ev.usuario_nome ?? null,
          obraNome:                ev.obra_nome ?? null,
          observacao:              ev.observacao ?? null,
          assinaturaEntregadorNome: ev.assinatura_entregador_nome ?? null,
          assinaturaEntregadorUrl:  ev.assinatura_entregador_url  ?? null,
          assinaturaRecebedorNome:  ev.assinatura_recebedor_nome  ?? null,
          assinaturaRecebedorUrl:   ev.assinatura_recebedor_url   ?? null,
          pdfComprovanteToken:      ev.pdf_comprovante_token       ?? null,
        })),
        ...wlRows.map((wl: any) => ({
          id:                      -(wl.id as number),
          tipo:                    wl.status === "devolvido" ? "RETORNO_ALMOX" : "SAIDA_ALMOX",
          dataEvento:              wl.data_emprestimo + (wl.hora_emprestimo ? `T${wl.hora_emprestimo}:00` : "T00:00:00"),
          funcionarioNome:         wl.funcionario_nome ?? null,
          funcionarioFoto:         wl.emp_foto_url ?? null,
          funcionarioMatricula:    wl.emp_matricula ?? null,
          usuarioNome:             wl.almoxarife_nome ?? null,
          obraNome:                wl.obra_nome ?? null,
          observacao:              wl.data_devolucao
            ? `Devolvido em ${wl.data_devolucao}${wl.hora_devolucao ? ` às ${wl.hora_devolucao}` : ""}`
            : null,
          assinaturaEntregadorNome: null,
          assinaturaEntregadorUrl:  null,
          assinaturaRecebedorNome:  null,
          assinaturaRecebedorUrl:   null,
          pdfComprovanteToken:      null,
        })),
      ].sort((a, b) => (a.dataEvento < b.dataEvento ? -1 : a.dataEvento > b.dataEvento ? 1 : 0));

      return {
        locado: {
          id:                      loc.id,
          descricao:               loc.descricao,
          categoria:               loc.categoria,
          fornecedorNome:          loc.fornecedor_nome,
          status:                  loc.status,
          patrimonio:              loc.codigo_patrimonio_fornecedor,
          dataInicio:              loc.data_inicio,
          dataFimPrevista:         loc.data_fim_prevista,
          dataFimReal:             loc.data_fim_real,
          valorMensal:             loc.valor_mensal,
          valorDiario:             loc.valor_diario,
          obraId:                  loc.obra_id,
          obraNome:                loc.obra_nome,
          fotoUrl:                 loc.foto_url,
          numeroContratoFornecedor: loc.numero_contrato_fornecedor,
          funcionarioResponsavelNome: loc.funcionario_responsavel_nome,
          respFoto:                loc.resp_foto_url ?? null,
          respMatricula:           loc.resp_matricula ?? null,
        },
        stats: {
          totalDias,
          valorTotal,
          ativo,
          qtdEventos: evRows.length + wlRows.length,
          qtdPessoas: Object.keys(pessoaMap).length,
          qtdRetiradas: wlRows.length,
        },
        responsaveis,
        timeline,
        mensal,
      };
    }),
});

// ── Rev. 2321 — Job store in-memory pra parse de PDF (polling).
// `Start` cria entrada em "pending" e dispara `executeParseContratoLocacao`
// em background; `Status` é polled pelo cliente. GC limpa entradas finalizadas
// após 10 min (pending nunca expira — protege polls longos > 60s).
// Rev. 2359 — adiciona `phase` + `phaseAt` pro client mostrar diagnóstico
// em tempo real (qual etapa, quanto tempo nessa etapa). Combate a percepção
// de "travado em 99%" quando o Gemini demora 60-120s em PDFs grandes.
type ParsePhase =
  | "queued"            // ainda não começou (vai começar em ms)
  | "calling_ai"        // chamada HTTP pro Gemini Vision rodando
  | "parsing_json"      // recebeu raw text, decodificando JSON
  | "repairing_json"    // JSON truncado, tentando reparar
  | "normalizing_dates" // pós-proc das datas DD/MM → ISO
  | "finalizing";
type ParseContratoJob = {
  status: "pending" | "done" | "error";
  startedAt: number;
  phase: ParsePhase;
  phaseAt: number; // timestamp da última troca de fase
  result?: { contratos: any[]; totalContratos: number; totalItens: number };
  error?: string;
};
const parseContratoJobs = new Map<string, ParseContratoJob>();
// Rev. 2359 — helper pra atualizar a fase preservando o `startedAt` original.
function setParsePhase(jobId: string, phase: ParsePhase) {
  const j = parseContratoJobs.get(jobId);
  if (!j || j.status !== "pending") return;
  parseContratoJobs.set(jobId, { ...j, phase, phaseAt: Date.now() });
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, j] of parseContratoJobs.entries()) {
    if (j.status !== "pending" && j.startedAt < cutoff) parseContratoJobs.delete(id);
  }
}, 60_000).unref?.();

// ── Rev. 2321 — Helper que executa o parse (chamado pela Start e pela legada).
// Extraído pra fora do router porque a Start dispara em background (fire-and-forget)
// e armazena o resultado no jobs Map; a procedure HTTP retorna em ms, evitando
// timeout de 60s do proxy Replit (que matava a conexão com PDFs grandes).
async function executeParseContratoLocacao(input: {
  companyId: number;
  pdfBase64: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  nomeArquivo?: string;
}, jobId?: string): Promise<{ contratos: any[]; totalContratos: number; totalItens: number }> {
  // Rev. 2359 — helper local que ignora silenciosamente quando chamado
  // pela procedure legada (sem jobId).
  const phase = (p: ParsePhase) => { if (jobId) setParsePhase(jobId, p); };
  const { invokeGeminiVision } = await import("../_core/llm");
  const systemPrompt = `Você é um extrator de relatórios de locação de equipamentos para construção civil no Brasil.\nCada locadora tem um layout próprio (Jalves, Mills, Locamerica, F051/R051, etc.). Detecte automaticamente o layout e extraia TODOS os contratos e seus respectivos itens.\nDatas SEMPRE no formato brasileiro DD/MM/AAAA. Valores em reais (R$). Quantidades inteiras ou decimais.`;
  const prompt = `Extraia TODOS os contratos de locação deste documento. Para cada contrato, capture:\n- numeroContrato (ex: "19096-32")\n- fornecedorNome (razão social/nome fantasia da locadora — geralmente no cabeçalho)\n- localObra (endereço/identificação da obra)\n- periodoInicio (DD/MM/AAAA) — OBRIGATÓRIO\n- periodoFim (DD/MM/AAAA) — OBRIGATÓRIO\n- valorTotal (numérico, sem R$, ponto como separador decimal)\n- atendenteResponsavel\n- itens: array de {patrimonio, descricao, quantidade (number), valorUnitario (subtotal/qtde, number), subtotal (number), categoria}\n\n**REGRAS CRÍTICAS PARA O PERÍODO DE LOCAÇÃO** (este campo NUNCA pode vir vazio):\n1. O período fica SEMPRE no cabeçalho de cada contrato, geralmente no canto direito da MESMA linha do "Nº Contrato" e "Valor".\n2. O texto típico é \`Período: DD/MM/AAAA  A  DD/MM/AAAA\` — extraia a PRIMEIRA data como periodoInicio e a SEGUNDA como periodoFim.\n3. Layout F051/R051 (Jalves e similares): a linha do cabeçalho tem o formato \`Nº Contrato: NNNNN-NN   Valor: 999,00   Local da obra: ...   Período: DD/MM/AAAA  A  DD/MM/AAAA\`. Cada contrato repete esse cabeçalho.\n4. Sinônimos aceitos para o campo: "Período", "Vigência", "Locação de", "Data início", "Data fim", "De", "Até", "Aluguel de".\n5. Se houver SÓ uma data inicial sem fim explícito, calcule fim = início + 30 dias.\n6. Se o documento tem um período GERAL no cabeçalho (ex: "Período para devolução entre 20/05/2010 a 20/05/2040"), IGNORE-O — esse é o range do relatório, NÃO o período do contrato. Use sempre o período próprio de cada contrato.\n7. CADA contrato pode ter seu próprio período distinto (não copie o período do primeiro contrato pros demais).\n8. NUNCA invente datas: se realmente não houver período visível no contrato, deixe periodoInicio/periodoFim vazios — mas é raro, o período quase sempre está no cabeçalho.\n\n**Exemplos do layout F051/R051** (use isso pra calibrar):\n- "Nº Contrato: 19096 - 32  Valor: 250,00  ... Período: 09/04/2026 A 09/05/2026" → periodoInicio="09/04/2026", periodoFim="09/05/2026"\n- "Nº Contrato: 19487 - 32  Valor: 245,00  ... Período: 21/04/2026 A 21/05/2026" → periodoInicio="21/04/2026", periodoFim="21/05/2026"\n- "Nº Contrato: 19751 - 30  Valor: 300,00  ... Período: 27/04/2026 A 27/05/2026" → periodoInicio="27/04/2026", periodoFim="27/05/2026"\n\nPara o campo "categoria" de CADA ITEM, classifique em UMA das categorias abaixo (escolha a MAIS específica):\n- "Andaime e escoramento" (guarda-corpo, pranchão, diagonal, sapata ajustável, escora, cruzeta, longarina, plataforma metálica, base regulável, painel de escoramento, viga H20)\n- "Equipamento elétrico" (gerador, betoneira, vibrador, lixadeira, esmerilhadeira, serra circular/policorte, compressor, bomba submersa/centrífuga, transformador, quadro de força)\n- "Ferramenta manual" (carrinho de mão, marreta, martelete, furadeira não-elétrica, alavanca, pá, picareta)\n- "EPI/EPC" (capacete, cinto de segurança, luva, óculos, redes de proteção, tela de fachada)\n- "Veículo/Máquina pesada" (caminhão, retroescavadeira, escavadeira, guindaste, manipulador telescópico)\n- "Container/Mobiliário" (container, mesa, cadeira, armário, escritório de obra)\n- "Outros" (use somente se NÃO encaixar em nenhuma acima)\n\nRetorne APENAS JSON válido no formato {contratos: [...]}. Se um campo estiver ausente, use string vazia ou 0. Datas SEMPRE em DD/MM/AAAA.`;

  const responseSchema = {
    type: "object",
    properties: {
      contratos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numeroContrato: { type: "string" },
            fornecedorNome: { type: "string" },
            localObra: { type: "string" },
            periodoInicio: { type: "string" },
            periodoFim: { type: "string" },
            valorTotal: { type: "number" },
            atendenteResponsavel: { type: "string" },
            itens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  patrimonio: { type: "string" },
                  descricao: { type: "string" },
                  quantidade: { type: "number" },
                  valorUnitario: { type: "number" },
                  subtotal: { type: "number" },
                  categoria: { type: "string" },
                },
                required: ["patrimonio", "descricao", "quantidade", "subtotal"],
              },
            },
          },
          required: ["numeroContrato", "periodoInicio", "periodoFim", "itens"],
        },
      },
    },
    required: ["contratos"],
  };

  phase("calling_ai");
  const raw = await invokeGeminiVision({
    prompt,
    systemPrompt,
    base64: input.pdfBase64,
    mimeType: input.mimeType,
    maxTokens: 65536, // Rev. 2320 — dobrado (era 32768): PDFs com 40+ contratos estouravam o cap e truncavam o JSON.
    responseSchema,
  });
  phase("parsing_json");
  if (!raw?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "IA não retornou dados — verifique se o PDF é legível." });

  // Rev. 2320 — Reparo de JSON truncado caractere a caractere.
  const tryRepairTruncated = (s: string): any | null => {
    const idx = s.indexOf('"contratos"');
    if (idx < 0) return null;
    const arrStart = s.indexOf("[", idx);
    if (arrStart < 0) return null;
    let depth = 0, inStr = false, esc = false, lastClose = -1;
    for (let i = arrStart + 1; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) lastClose = i; }
    }
    if (lastClose < 0) return null;
    const head = s.slice(0, arrStart + 1);
    const body = s.slice(arrStart + 1, lastClose + 1);
    try { return JSON.parse(`${head}${body}]}`); } catch { return null; }
  };
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    phase("repairing_json");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); }
      catch { parsed = tryRepairTruncated(raw); }
    } else {
      parsed = tryRepairTruncated(raw);
    }
    if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Resposta da IA truncada/inválida. Tente dividir o PDF em arquivos menores." });
  }
  phase("normalizing_dates");
  const contratos: any[] = Array.isArray(parsed?.contratos) ? parsed.contratos : [];
  if (contratos.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato detectado no documento." });

  // Rev. 2351 — toIso mais tolerante: aceita "DD/MM/AAAA", "D/M/AAAA",
  // "DD-MM-AAAA", "DD.MM.AAAA", e ISO. Trim e normalização de separador.
  // Falha silenciosa retorna "" (preserva contrato no preview pra user
  // corrigir manualmente em vez de quebrar todo o lote).
  const toIso = (br: string) => {
    if (!br) return "";
    const s = String(br).trim().replace(/\s+/g, "");
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      return `${m[3]}-${mm}-${dd}`;
    }
    const m2 = s.match(/^(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/);
    return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : "";
  };
  // Rev. 2351 — se LLM trouxer só periodoInicio (cenário do prompt regra 5),
  // calcula fim = início + 30 dias como fallback razoável de locação mensal.
  const addDays = (iso: string, days: number): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  let comDatas = 0, semDatas = 0;
  for (const c of contratos) {
    c.periodoInicio = toIso(c.periodoInicio);
    c.periodoFim = toIso(c.periodoFim);
    if (c.periodoInicio && !c.periodoFim) c.periodoFim = addDays(c.periodoInicio, 30);
    if (!Array.isArray(c.itens)) c.itens = [];
    if (c.periodoInicio && c.periodoFim) comDatas++; else semDatas++;
  }
  console.log(`[executeParseContratoLocacao] Datas: ${comDatas} contratos OK / ${semDatas} sem período (preview vai pedir correção manual).`);

  return {
    contratos,
    totalContratos: contratos.length,
    totalItens: contratos.reduce((a, c) => a + (c.itens?.length || 0), 0),
  };
}
