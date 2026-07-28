import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { curriculos, curriculoFuncoes, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, isNull, or } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { invokeAnthropicVision } from "../_core/llm";
import { assertAiModuleEnabled } from "../_core/aiConfig";

const FUNCOES_PADRAO = [
  "SERVENTE", "PEDREIRO", "CARPINTEIRO", "ARMADOR",
  "ENGENHEIRO", "PINTOR", "AUX. ADMINISTRATIVO",
];

function assertCompanyAccess(ctx: any, companyId: number) {
  if (ctx.user?.companyId && String(ctx.user.companyId) !== String(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa" });
  }
}

async function ensureFuncoesPadrao(db: any, companyId: number) {
  const existing = await db.select({ nome: curriculoFuncoes.nome })
    .from(curriculoFuncoes)
    .where(and(
      eq(curriculoFuncoes.companyId, companyId),
      isNull(curriculoFuncoes.deletedAt),
    ));
  const existingNames = new Set(existing.map((r: any) => (r.nome || "").toUpperCase()));
  const toAdd = FUNCOES_PADRAO.filter(n => !existingNames.has(n));
  if (toAdd.length > 0) {
    await db.insert(curriculoFuncoes).values(
      toAdd.map(nome => ({ companyId, nome, ativo: 1 }))
    );
  }
}

async function ensureFuncaoOwnership(db: any, funcaoId: number, companyId: number) {
  const [row] = await db.select({ id: curriculoFuncoes.id, companyId: curriculoFuncoes.companyId })
    .from(curriculoFuncoes).where(eq(curriculoFuncoes.id, funcaoId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Função não encontrada" });
  if (row.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
  return row;
}

async function ensureCurriculoOwnership(db: any, id: number, companyId: number) {
  const [row] = await db.select({ id: curriculos.id, companyId: curriculos.companyId })
    .from(curriculos).where(eq(curriculos.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Currículo não encontrado" });
  if (row.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
}

function getMimeType(fileName: string): string {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0+/, "");
}

// Rev. 1724 — chave canônica para comparar nomes de função e detectar
// duplicatas com abreviações (ex.: "AUX. ADMINISTRATIVO" vs
// "AUXILIAR ADMINISTRATIVO"). Aplica:
//  - UPPERCASE + remove acentos
//  - troca pontuação por espaço, colapsa espaços
//  - expande abreviações comuns (AUX → AUXILIAR, ADM → ADMINISTRATIVO,
//    ENC → ENCARREGADO, AJ → AJUDANTE, OP → OPERADOR, MEC → MECANICO,
//    ELET → ELETRICISTA, MOT → MOTORISTA, MO → MAO DE OBRA)
const FUNC_ALIASES: Record<string, string> = {
  AUX: "AUXILIAR",
  ADM: "ADMINISTRATIVO",
  ENC: "ENCARREGADO",
  AJ: "AJUDANTE",
  OP: "OPERADOR",
  MEC: "MECANICO",
  ELET: "ELETRICISTA",
  MOT: "MOTORISTA",
  ENG: "ENGENHEIRO",
};
function normalizeFuncaoNome(s: string): string {
  let n = (s || "").toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\wÀ-ÿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = n.split(" ").map(t => FUNC_ALIASES[t] ?? t);
  return tokens.join(" ");
}

export const curriculosRouter = router({
  listarFuncoes: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureFuncoesPadrao(db, input.companyId);
      return await db.select().from(curriculoFuncoes)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          isNull(curriculoFuncoes.deletedAt),
        ))
        .orderBy(curriculoFuncoes.nome);
    }),

  criarFuncao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), nome: z.string().min(1).max(120) }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const nome = input.nome.trim().toUpperCase();
      // Rev. 1724 — comparação canônica (alias + sem pontuação) evita
      // duplicar "AUX. ADMINISTRATIVO" vs "AUXILIAR ADMINISTRATIVO" etc.
      const chave = normalizeFuncaoNome(nome);
      const todasAtivas = await db.select({ id: curriculoFuncoes.id, nome: curriculoFuncoes.nome })
        .from(curriculoFuncoes)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          isNull(curriculoFuncoes.deletedAt),
        ));
      const dup = todasAtivas.find((r: any) => normalizeFuncaoNome(r.nome) === chave);
      if (dup) return dup;
      const [row] = await db.insert(curriculoFuncoes).values({
        companyId: input.companyId, nome, ativo: 1,
      }).returning();
      return row;
    }),

  // Rev. 1724 — Mescla várias funções em uma só. Move todos os currículos
  // das funções de origem para a função de destino e soft-deleta as origens.
  // Usado pelo botão "Mesclar selecionadas" da sidebar.
  mesclarFuncoes: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      destinoId: z.number().int().positive(),
      origemIds: z.array(z.number().int().positive()).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureFuncaoOwnership(db, input.destinoId, input.companyId);
      const origens = input.origemIds.filter(id => id !== input.destinoId);
      if (origens.length === 0) return { moved: 0, removed: 0 };
      for (const oid of origens) await ensureFuncaoOwnership(db, oid, input.companyId);
      const [destino] = await db.select({ nome: curriculoFuncoes.nome })
        .from(curriculoFuncoes).where(eq(curriculoFuncoes.id, input.destinoId));
      const destinoNome = destino?.nome || "Sem função";
      const moved = await db.update(curriculos).set({
        funcaoId: input.destinoId,
        funcaoNome: destinoNome,
        updatedAt: sql`NOW()`,
      } as any).where(and(
        eq(curriculos.companyId, input.companyId),
        sql`${curriculos.funcaoId} IN (${sql.join(origens.map(id => sql`${id}`), sql`, `)})`,
        isNull(curriculos.deletedAt),
      )).returning({ id: curriculos.id });
      await db.update(curriculoFuncoes).set({ deletedAt: sql`NOW()` } as any)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          sql`${curriculoFuncoes.id} IN (${sql.join(origens.map(id => sql`${id}`), sql`, `)})`,
        ));
      return { moved: moved.length, removed: origens.length, destinoNome };
    }),

  excluirFuncao: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureFuncaoOwnership(db, input.id, input.companyId);
      await db.update(curriculoFuncoes).set({ deletedAt: sql`NOW()` } as any)
        .where(eq(curriculoFuncoes.id, input.id));
      return { success: true };
    }),

  // Rev. 1776 — Renomeia uma função. Atualiza o nome canônico (UPPERCASE) e
  // propaga `funcaoNome` em todos os currículos vinculados. Bloqueia se o novo
  // nome (canônico) já existe em outra função ativa da mesma empresa.
  editarFuncao: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      nome: z.string().min(1).max(120),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureFuncaoOwnership(db, input.id, input.companyId);
      const novoNome = input.nome.trim().toUpperCase();
      if (!novoNome) throw new TRPCError({ code: "BAD_REQUEST", message: "Nome obrigatório" });
      const chave = normalizeFuncaoNome(novoNome);
      const todasAtivas = await db.select({ id: curriculoFuncoes.id, nome: curriculoFuncoes.nome })
        .from(curriculoFuncoes)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          isNull(curriculoFuncoes.deletedAt),
        ));
      const dup = todasAtivas.find((r: any) => r.id !== input.id && normalizeFuncaoNome(r.nome) === chave);
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `Já existe uma função equivalente: "${dup.nome}". Use "Mesclar selecionadas" para unificar.` });
      await db.update(curriculoFuncoes).set({ nome: novoNome } as any)
        .where(eq(curriculoFuncoes.id, input.id));
      await db.update(curriculos).set({ funcaoNome: novoNome, updatedAt: sql`NOW()` } as any)
        .where(and(
          eq(curriculos.companyId, input.companyId),
          eq(curriculos.funcaoId, input.id),
          isNull(curriculos.deletedAt),
        ));
      return { id: input.id, nome: novoNome };
    }),

  listar: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      funcaoId: z.number().int().positive().optional(),
      funcaoIds: z.array(z.number().int().positive()).optional(),
      statusCandidato: z.enum(["ativo", "em_analise", "entrevista", "entrevistado", "aprovado", "contratado", "banco", "reprovado", "desistiu", "blacklist", "todos"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds = [eq(curriculos.companyId, input.companyId), isNull(curriculos.deletedAt)];
      if (input.funcaoIds && input.funcaoIds.length > 0) {
        conds.push(sql`${curriculos.funcaoId} IN (${sql.join(input.funcaoIds.map(id => sql`${id}`), sql`, `)})`);
      } else if (input.funcaoId) {
        conds.push(eq(curriculos.funcaoId, input.funcaoId));
      }
      if (input.statusCandidato && input.statusCandidato !== "todos") {
        conds.push(eq(curriculos.statusCandidato, input.statusCandidato));
      }
      return await db.select().from(curriculos)
        .where(and(...conds))
        .orderBy(desc(curriculos.createdAt));
    }),

  contagens: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const statusRows = await db.select({
        status: curriculos.statusCandidato,
        count: sql<number>`count(*)::int`,
      }).from(curriculos)
        .where(and(eq(curriculos.companyId, input.companyId), isNull(curriculos.deletedAt)))
        .groupBy(curriculos.statusCandidato);

      const funcaoRows = await db.select({
        funcaoId: curriculos.funcaoId,
        count: sql<number>`count(*)::int`,
      }).from(curriculos)
        .where(and(eq(curriculos.companyId, input.companyId), isNull(curriculos.deletedAt)))
        .groupBy(curriculos.funcaoId);

      const porStatus: Record<string, number> = {};
      let total = 0;
      for (const r of statusRows) {
        porStatus[r.status] = r.count;
        total += r.count;
      }
      porStatus["todos"] = total;

      const porFuncao: Record<number, number> = {};
      for (const r of funcaoRows) {
        if (r.funcaoId) porFuncao[r.funcaoId] = r.count;
      }

      return { porStatus, porFuncao };
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      funcaoId: z.number().int().positive(),
      nomeCandidato: z.string().max(255).optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      endereco: z.string().max(500).optional(),
      cidade: z.string().max(150).optional(),
      estado: z.string().max(2).optional(),
      dataNascimento: z.string().optional(),
      habilidades: z.string().optional(),
      escolaridade: z.string().max(255).optional(),
      cursoFormacao: z.string().optional(),
      experienciasJson: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureFuncaoOwnership(db, input.funcaoId, input.companyId);
      const [funcRow] = await db.select({ nome: curriculoFuncoes.nome })
        .from(curriculoFuncoes).where(eq(curriculoFuncoes.id, input.funcaoId));
      const funcaoNome = funcRow?.nome || "Sem função";

      const [row] = await db.insert(curriculos).values({
        companyId: input.companyId,
        funcaoId: input.funcaoId,
        funcaoNome,
        nomeCandidato: input.nomeCandidato || "",
        telefone: input.telefone || null,
        email: input.email || null,
        endereco: input.endereco?.trim() || null,
        cidade: input.cidade?.trim() || null,
        estado: input.estado?.trim().toUpperCase().substring(0, 2) || null,
        dataNascimento: input.dataNascimento || null,
        habilidades: input.habilidades || null,
        escolaridade: input.escolaridade || null,
        cursoFormacao: input.cursoFormacao || null,
        experienciasJson: input.experienciasJson || null,
        observacoes: input.observacoes || null,
        criadoPor: ctx.user.name ?? "Sistema",
        criadoPorUserId: ctx.user.id,
      }).returning();
      return row;
    }),

  uploadDoc: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureCurriculoOwnership(db, input.id, input.companyId);
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = (input.fileName.split(".").pop() || "pdf").toLowerCase();
      const ct = getMimeType(input.fileName);
      const key = `documentos/curriculos/c${input.companyId}/${input.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ct);
      await db.update(curriculos)
        .set({ documentoUrl: url, fileName: input.fileName, updatedAt: sql`NOW()` })
        .where(eq(curriculos.id, input.id));
      return { url };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      funcaoId: z.number().int().positive().optional(),
      nomeCandidato: z.string().max(255).optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      endereco: z.string().max(500).optional(),
      cidade: z.string().max(150).optional(),
      estado: z.string().max(2).optional(),
      dataNascimento: z.string().nullable().optional(),
      habilidades: z.string().nullable().optional(),
      escolaridade: z.string().max(255).nullable().optional(),
      cursoFormacao: z.string().nullable().optional(),
      experienciasJson: z.string().nullable().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureCurriculoOwnership(db, input.id, input.companyId);

      const updates: any = { updatedAt: sql`NOW()` };
      if (input.nomeCandidato !== undefined) updates.nomeCandidato = input.nomeCandidato.trim();
      if (input.telefone !== undefined) updates.telefone = input.telefone.trim() || null;
      if (input.email !== undefined) updates.email = input.email.trim().toLowerCase() || null;
      if (input.endereco !== undefined) updates.endereco = input.endereco.trim() || null;
      if (input.cidade !== undefined) updates.cidade = input.cidade.trim() || null;
      if (input.estado !== undefined) updates.estado = input.estado.trim().toUpperCase().substring(0, 2) || null;
      if (input.dataNascimento !== undefined) updates.dataNascimento = input.dataNascimento || null;
      if (input.habilidades !== undefined) updates.habilidades = input.habilidades || null;
      if (input.escolaridade !== undefined) updates.escolaridade = input.escolaridade || null;
      if (input.cursoFormacao !== undefined) updates.cursoFormacao = input.cursoFormacao || null;
      if (input.experienciasJson !== undefined) updates.experienciasJson = input.experienciasJson || null;
      if (input.observacoes !== undefined) updates.observacoes = input.observacoes || null;

      if (input.funcaoId) {
        await ensureFuncaoOwnership(db, input.funcaoId, input.companyId);
        const [funcRow] = await db.select({ nome: curriculoFuncoes.nome })
          .from(curriculoFuncoes).where(eq(curriculoFuncoes.id, input.funcaoId));
        updates.funcaoId = input.funcaoId;
        updates.funcaoNome = funcRow?.nome || "Sem função";
      }

      const [row] = await db.update(curriculos).set(updates)
        .where(eq(curriculos.id, input.id)).returning();
      return row;
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await ensureCurriculoOwnership(db, input.id, input.companyId);
      await db.update(curriculos).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? "Sistema",
        deletedByUserId: ctx.user.id,
      } as any).where(eq(curriculos.id, input.id));
      return { success: true };
    }),

  excluirVarios: protectedProcedure
    .input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(200),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(curriculos).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? "Sistema",
        deletedByUserId: ctx.user.id,
      } as any).where(and(
        sql`${curriculos.id} IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`,
        eq(curriculos.companyId, input.companyId),
        isNull(curriculos.deletedAt),
      ));
      return { success: true, count: input.ids.length };
    }),

  atualizarStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(200),
      companyId: z.number().int().positive(),
      statusCandidato: z.enum(["ativo", "em_analise", "entrevista", "entrevistado", "aprovado", "contratado", "banco", "reprovado", "desistiu", "blacklist"]),
      motivoReprovacao: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const rows = await db.select({
        id: curriculos.id,
        statusCandidato: curriculos.statusCandidato,
        historicoStatusJson: curriculos.historicoStatusJson,
      }).from(curriculos).where(and(
        sql`${curriculos.id} IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`,
        eq(curriculos.companyId, input.companyId),
        isNull(curriculos.deletedAt),
      ));

      const agora = new Date().toISOString();
      const usuario = ctx.user.name ?? "Sistema";

      let changed = 0;
      for (const row of rows) {
        if (row.statusCandidato === input.statusCandidato) continue;

        let historico: any[] = [];
        try { historico = JSON.parse(row.historicoStatusJson || "[]"); } catch {}
        historico.push({
          de: row.statusCandidato,
          para: input.statusCandidato,
          data: agora,
          usuario,
          motivo: input.motivoReprovacao?.trim() || null,
        });

        const updates: any = {
          statusCandidato: input.statusCandidato,
          statusAtualizadoEm: sql`NOW()`,
          statusAtualizadoPor: usuario,
          historicoStatusJson: JSON.stringify(historico),
          updatedAt: sql`NOW()`,
        };
        if (input.statusCandidato === "reprovado" && input.motivoReprovacao) {
          updates.motivoReprovacao = input.motivoReprovacao.trim();
        }
        if (input.statusCandidato !== "reprovado") {
          updates.motivoReprovacao = null;
        }

        await db.update(curriculos).set(updates).where(eq(curriculos.id, row.id));
        changed++;
      }

      return { success: true, count: changed };
    }),

  processarArquivosIA: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      arquivos: z.array(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
      })).min(1).max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      await assertAiModuleEnabled(input.companyId, "recrutamento");
      const db = (await getDb())!;
      const funcoesDb = await db.select().from(curriculoFuncoes)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          isNull(curriculoFuncoes.deletedAt),
        ));

      type ResultItem = {
        fileName: string;
        status: "ok" | "erro" | "duplicado" | "blacklist" | "desligado";
        dados: { nome: string; telefone: string; email: string; dataNascimento: string | null; endereco: string; cidade: string; estado: string; funcaoDetectada: string; experiencia: string } | null;
        alertas: { tipo: "duplicado" | "desligado" | "blacklist"; mensagem: string; detalhes?: string }[];
        curriculoId: number | null;
        funcaoId: number | null;
        funcaoNome: string | null;
        erro: string | null;
      };

      const resultados: ResultItem[] = [];

      for (const arq of input.arquivos) {
        try {
          const maxBase64Size = 10 * 1024 * 1024 * 1.37;
          if (arq.fileBase64.length > maxBase64Size) {
            resultados.push({
              fileName: arq.fileName, status: "erro", dados: null, alertas: [],
              curriculoId: null, funcaoId: null, funcaoNome: null,
              erro: "Arquivo muito grande (máx 10MB).",
            });
            continue;
          }

          const mimeType = getMimeType(arq.fileName);
          if (mimeType !== "application/pdf" && !mimeType.startsWith("image/")) {
            resultados.push({
              fileName: arq.fileName, status: "erro", dados: null, alertas: [],
              curriculoId: null, funcaoId: null, funcaoNome: null,
              erro: "Formato não suportado pela IA. Use PDF, JPG ou PNG.",
            });
            continue;
          }

          const prompt = `Analise este currículo/CV e extraia as seguintes informações em JSON puro (sem markdown, sem \`\`\`):
{
  "nome": "nome completo do candidato",
  "telefone": "telefone com DDD",
  "email": "email do candidato",
  "dataNascimento": "data de nascimento no formato AAAA-MM-DD (ex: 1990-05-15)",
  "endereco": "endereço completo (rua, número, bairro)",
  "cidade": "cidade onde mora",
  "estado": "sigla do estado com 2 letras (ex: SP, RJ, MG)",
  "funcao": "função/cargo pretendido ou área de atuação principal (ex: PEDREIRO, SERVENTE, ENGENHEIRO, CARPINTEIRO, ARMADOR, PINTOR, AUXILIAR ADMINISTRATIVO, SOLDADOR, ELETRICISTA, ENCANADOR, MOTORISTA, OPERADOR, etc)",
  "experiencia": "resumo breve das experiências (máx 200 caracteres)",
  "escolaridade": "nível de escolaridade (ex: Ensino Fundamental, Ensino Médio, Técnico, Superior Completo, Superior Incompleto, Pós-Graduação)",
  "cursoFormacao": "cursos, formações técnicas, certificações e treinamentos relevantes separados por ponto-e-vírgula",
  "habilidades": "habilidades e competências técnicas e comportamentais separadas por ponto-e-vírgula (ex: Leitura de projetos; Operação de betoneira; NR-35; Trabalho em equipe)",
  "experiencias": [
    {
      "empresa": "nome da empresa",
      "cargo": "cargo exercido",
      "periodo": "período (ex: 01/2020 - 12/2022 ou 2020 - 2022)",
      "duracao": "tempo aproximado (ex: 2 anos, 6 meses)",
      "descricao": "breve descrição das atividades (máx 150 caracteres)"
    }
  ]
}
Se não conseguir identificar algum campo, use string vazia "" (para experiencias, use array vazio []).
Para o campo "funcao", analise a experiência profissional e o objetivo do candidato para inferir a função mais adequada na construção civil ou área administrativa.
IMPORTANTE: Retorne APENAS o JSON, sem nenhum texto adicional.`;

          const resposta = await invokeAnthropicVision({
            prompt,
            base64: arq.fileBase64,
            mimeType,
            systemPrompt: "Você é um especialista em RH que analisa currículos para a construção civil. Extraia dados de forma precisa, detalhada e objetiva. Liste TODAS as experiências profissionais encontradas. Retorne apenas JSON válido.",
            maxTokens: 2048,
          });

          let dados: any;
          try {
            const jsonStr = resposta.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            dados = JSON.parse(jsonStr);
          } catch {
            resultados.push({
              fileName: arq.fileName, status: "erro", dados: null, alertas: [],
              curriculoId: null, funcaoId: null, funcaoNome: null,
              erro: "IA não conseguiu extrair dados deste arquivo. Verifique se é um currículo legível.",
            });
            continue;
          }

          const nome = (dados.nome || "").trim();
          const telefone = (dados.telefone || "").trim();
          const email = (dados.email || "").trim().toLowerCase();
          const dataNascimentoRaw = (dados.dataNascimento || "").trim();
          const dataNascimento = /^\d{4}-\d{2}-\d{2}$/.test(dataNascimentoRaw) ? dataNascimentoRaw : null;
          const endereco = (dados.endereco || "").trim();
          const cidade = (dados.cidade || "").trim();
          const estado = (dados.estado || "").trim().toUpperCase().substring(0, 2);
          const funcaoDetectada = (dados.funcao || "").trim().toUpperCase();
          const experiencia = (dados.experiencia || "").trim().substring(0, 300);
          const habilidades = (dados.habilidades || "").trim();
          const escolaridade = (dados.escolaridade || "").trim();
          const cursoFormacao = (dados.cursoFormacao || "").trim();
          let experienciasJson: string | null = null;
          try {
            if (Array.isArray(dados.experiencias) && dados.experiencias.length > 0) {
              experienciasJson = JSON.stringify(dados.experiencias);
            }
          } catch { /* ignore */ }

          const alertas: ResultItem["alertas"] = [];

          const dupConds: any[] = [];
          if (nome) {
            dupConds.push(
              sql`LOWER(${curriculos.nomeCandidato}) = ${nome.toLowerCase()}`
            );
          }
          if (telefone) {
            const telNorm = normalizePhone(telefone);
            if (telNorm.length >= 8) {
              dupConds.push(
                sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${curriculos.telefone},' ',''),'-',''),'(',''),')',''),'+','') LIKE ${"%" + telNorm.slice(-8)}`
              );
            }
          }
          if (email) {
            dupConds.push(
              sql`LOWER(${curriculos.email}) = ${email}`
            );
          }

          if (dupConds.length > 0) {
            const duplicados = await db.select({ id: curriculos.id, nomeCandidato: curriculos.nomeCandidato, funcaoNome: curriculos.funcaoNome, telefone: curriculos.telefone, email: curriculos.email })
              .from(curriculos)
              .where(and(
                eq(curriculos.companyId, input.companyId),
                isNull(curriculos.deletedAt),
                or(...dupConds),
              ))
              .limit(5);
            if (duplicados.length > 0) {
              const nomes = duplicados.map((d: any) => `${d.nomeCandidato || "(sem nome)"} (${d.funcaoNome})`).join(", ");
              alertas.push({
                tipo: "duplicado",
                mensagem: `Possível duplicidade: candidato similar já cadastrado`,
                detalhes: nomes,
              });
            }
          }

          const empConds: any[] = [];
          if (nome) {
            const nomeParts = nome.split(/\s+/);
            if (nomeParts.length >= 2) {
              empConds.push(
                sql`LOWER(${employees.nomeCompleto}) = ${nome.toLowerCase()}`
              );
              const firstName = nomeParts[0];
              const lastName = nomeParts[nomeParts.length - 1];
              empConds.push(
                sql`(LOWER(${employees.nomeCompleto}) LIKE ${firstName.toLowerCase() + "%"} AND LOWER(${employees.nomeCompleto}) LIKE ${"%" + lastName.toLowerCase()})`
              );
            }
          }
          if (telefone) {
            const telNorm = normalizePhone(telefone);
            if (telNorm.length >= 8) {
              empConds.push(
                sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${employees.celular},' ',''),'-',''),'(',''),')',''),'+','') LIKE ${"%" + telNorm.slice(-8)}`
              );
              empConds.push(
                sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${employees.telefone},' ',''),'-',''),'(',''),')',''),'+','') LIKE ${"%" + telNorm.slice(-8)}`
              );
            }
          }
          if (email) {
            empConds.push(
              sql`LOWER(${employees.email}) = ${email}`
            );
          }

          if (empConds.length > 0) {
            const empResults = await db.select({
              id: employees.id,
              nomeCompleto: employees.nomeCompleto,
              status: employees.status,
              listaNegra: employees.listaNegra,
              motivoListaNegra: employees.motivoListaNegra,
              funcao: employees.funcao,
              dataDemissao: employees.dataDemissao,
            })
              .from(employees)
              .where(and(
                eq(employees.companyId, input.companyId),
                isNull(employees.deletedAt),
                or(...empConds),
              ))
              .limit(10);

            for (const emp of empResults) {
              if ((emp as any).listaNegra === 1) {
                alertas.push({
                  tipo: "blacklist",
                  mensagem: `LISTA NEGRA: ${(emp as any).nomeCompleto}`,
                  detalhes: (emp as any).motivoListaNegra || "Sem motivo registrado",
                });
              } else if ((emp as any).status === "Desligado" || (emp as any).dataDemissao) {
                alertas.push({
                  tipo: "desligado",
                  mensagem: `Ex-funcionário desligado: ${(emp as any).nomeCompleto}`,
                  detalhes: `Função: ${(emp as any).funcao || "N/A"} | Demissão: ${(emp as any).dataDemissao || "N/A"}`,
                });
              }
            }
          }

          let funcaoId: number | null = null;
          let funcaoNome: string | null = null;

          if (funcaoDetectada) {
            // Rev. 1724 — match por chave canônica (alias-aware) para
            // evitar criar "AUXILIAR ADMINISTRATIVO" quando já existe
            // "AUX. ADMINISTRATIVO" (ou vice-versa).
            const chaveDet = normalizeFuncaoNome(funcaoDetectada);
            const match = funcoesDb.find((f: any) => {
              const fn = f.nome.toUpperCase();
              if (fn === funcaoDetectada) return true;
              if (normalizeFuncaoNome(f.nome) === chaveDet) return true;
              return funcaoDetectada.includes(fn) || fn.includes(funcaoDetectada);
            });
            if (match) {
              funcaoId = (match as any).id;
              funcaoNome = (match as any).nome;
            } else {
              const [newFunc] = await db.insert(curriculoFuncoes).values({
                companyId: input.companyId, nome: funcaoDetectada, ativo: 1,
              }).returning();
              funcaoId = newFunc.id;
              funcaoNome = funcaoDetectada;
              funcoesDb.push(newFunc);
            }
          }

          const hasBlacklist = alertas.some(a => a.tipo === "blacklist");

          const statusFinal = hasBlacklist ? "blacklist" as const
            : alertas.some(a => a.tipo === "duplicado") ? "duplicado" as const
            : alertas.some(a => a.tipo === "desligado") ? "desligado" as const
            : "ok" as const;

          let curriculoId: number | null = null;

          if (!hasBlacklist) {
            if (!funcaoId) {
              const defaultFunc = funcoesDb[0];
              if (defaultFunc) {
                funcaoId = (defaultFunc as any).id;
                funcaoNome = (defaultFunc as any).nome;
              }
            }

            if (funcaoId) {
              const [row] = await db.insert(curriculos).values({
                companyId: input.companyId,
                funcaoId,
                funcaoNome: funcaoNome || "Sem função",
                nomeCandidato: nome || "",
                telefone: telefone || null,
                email: email || null,
                endereco: endereco || null,
                cidade: cidade || null,
                estado: estado || null,
                dataNascimento: dataNascimento || null,
                habilidades: habilidades || null,
                escolaridade: escolaridade || null,
                cursoFormacao: cursoFormacao || null,
                experienciasJson: experienciasJson,
                observacoes: experiencia || null,
                criadoPor: ctx.user.name ?? "IA",
                criadoPorUserId: ctx.user.id,
              }).returning();
              curriculoId = row.id;

              try {
                const buffer = Buffer.from(arq.fileBase64, "base64");
                const ext = (arq.fileName.split(".").pop() || "pdf").toLowerCase();
                const ct = getMimeType(arq.fileName);
                const key = `documentos/curriculos/c${input.companyId}/${row.id}-${Date.now()}.${ext}`;
                const { url } = await storagePut(key, buffer, ct);
                await db.update(curriculos)
                  .set({ documentoUrl: url, fileName: arq.fileName, updatedAt: sql`NOW()` })
                  .where(eq(curriculos.id, row.id));
              } catch (storageErr: any) {
                console.warn(`[Curriculos IA] Falha no storage para ${arq.fileName}, registro ${row.id} criado sem anexo:`, storageErr.message);
              }
            }
          }

          resultados.push({
            fileName: arq.fileName,
            status: statusFinal,
            dados: { nome, telefone, email, dataNascimento, endereco, cidade, estado, funcaoDetectada, experiencia },
            alertas,
            curriculoId,
            funcaoId,
            funcaoNome,
            erro: null,
          });
        } catch (err: any) {
          console.error(`[Curriculos IA] Erro ao processar ${arq.fileName}:`, err.message);
          resultados.push({
            fileName: arq.fileName, status: "erro", dados: null, alertas: [],
            curriculoId: null, funcaoId: null, funcaoNome: null,
            erro: err.message || "Erro ao processar arquivo",
          });
        }
      }

      return { resultados };
    }),
});
