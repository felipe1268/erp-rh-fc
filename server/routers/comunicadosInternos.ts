import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { comunicadosInternos, comunicadoAssinaturas, employees, obraFuncionarios, obras, integrasignEnvelopes, integrasignSignatarios, jobFunctions } from "../../drizzle/schema";
import { eq, and, sql, desc, isNull, asc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { enviarConviteAssinatura } from "../services/integrasignEmail";

async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string | null> {
  try {
    if (ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return data.text?.trim() || null;
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || null;
    }
    if (ext === "doc") {
      const WordExtractor = (await import("word-extractor")).default;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody()?.trim() || null;
    }
  } catch (e: any) {
    console.error(`[ComunicadosInternos] Erro ao extrair texto (${ext}):`, e.message);
  }
  return null;
}

function formatNumero(seq: number, ano: number): string {
  return `${String(seq).padStart(3, "0")}/${ano}`;
}

async function ensureOwnership(db: any, id: number, companyId: number) {
  const [row] = await db.select({
    id: comunicadosInternos.id,
    companyId: comunicadosInternos.companyId,
    status: comunicadosInternos.status,
    numero: comunicadosInternos.numero,
    titulo: comunicadosInternos.titulo,
    conteudo: comunicadosInternos.conteudo,
    emissorNome: comunicadosInternos.emissorNome,
    emissorCargo: comunicadosInternos.emissorCargo,
    criadoPor: comunicadosInternos.criadoPor,
    fcsignEnvelopeId: comunicadosInternos.fcsignEnvelopeId,
  })
    .from(comunicadosInternos).where(eq(comunicadosInternos.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Comunicado não encontrado" });
  if (row.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
  return row;
}

export const comunicadosInternosRouter = router({
  listar: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), ano: z.number().int().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds = [eq(comunicadosInternos.companyId, input.companyId), isNull(comunicadosInternos.deletedAt)];
      if (input.ano) conds.push(eq(comunicadosInternos.ano, input.ano));
      return await db.select().from(comunicadosInternos)
        .where(and(...conds))
        .orderBy(desc(comunicadosInternos.ano), desc(comunicadosInternos.sequencia));
    }),

  // Rev. 4264 — lista todos os funcionários ativos com sua categoriaMO.
  // Usa 2 queries Drizzle ORM (evita raw SQL com ambiguidade de casing de coluna)
  // e faz o join em JS pelo nome da função.
  listarFuncionariosSimples: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // 1. Todos os funcionários ativos (sem filtro deletedAt — status='Ativo' é suficiente)
      const emps = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cargo: employees.cargo,
        funcao: employees.funcao,
        matricula: employees.matricula,
      })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, "Ativo"),
        ))
        .orderBy(asc(employees.nomeCompleto));

      if (emps.length === 0) return [];

      // 2. Mapa funcao.nome → categoriaMO para esta empresa
      const jfs = await db.select({
        nome: jobFunctions.nome,
        categoriaMO: (jobFunctions as any).categoriaMO,
      })
        .from(jobFunctions)
        .where(and(
          eq(jobFunctions.companyId, input.companyId),
          eq(jobFunctions.isActive, 1),
          isNull(jobFunctions.deletedAt),
        ));

      const catMap = new Map<string, string | null>(
        jfs.map((j: any) => [j.nome?.trim().toLowerCase(), j.categoriaMO ?? null])
      );

      return emps.map(e => ({
        ...e,
        categoriaMO: catMap.get(e.funcao?.trim().toLowerCase() ?? "") ?? null,
      }));
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255),
      dataEmissao: z.string(),
      conteudo: z.string().optional(),
      setor: z.string().max(255).optional(),
      emissorNome: z.string().max(255).optional(),
      emissorCargo: z.string().max(255).optional(),
      destinatariosJson: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ano = new Date(input.dataEmissao + "T12:00:00Z").getUTCFullYear();
      if (!ano || isNaN(ano)) throw new TRPCError({ code: "BAD_REQUEST", message: "Data inválida" });

      const lockKey1 = input.companyId;
      const lockKey2 = ano;

      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey1}::int, ${lockKey2}::int)`);

        const [{ maxSeq }] = await tx.select({
          maxSeq: sql<number>`COALESCE(MAX(${comunicadosInternos.sequencia}), 0)::int`,
        }).from(comunicadosInternos)
          .where(and(
            eq(comunicadosInternos.companyId, input.companyId),
            eq(comunicadosInternos.ano, ano),
          ));

        const sequencia = (maxSeq || 0) + 1;
        const numero = formatNumero(sequencia, ano);

        const [row] = await tx.insert(comunicadosInternos).values({
          companyId: input.companyId,
          numero, ano, sequencia,
          titulo: input.titulo,
          dataEmissao: input.dataEmissao,
          conteudo: input.conteudo || null,
          criadoPor: ctx.user.name ?? "Sistema",
          criadoPorUserId: ctx.user.id,
          status: "rascunho",
          setor: input.setor || null,
          emissorNome: input.emissorNome || null,
          emissorCargo: input.emissorCargo || null,
          destinatariosJson: input.destinatariosJson || null,
        }).returning();

        return row;
      });
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      conteudo: z.string().optional().nullable(),
      setor: z.string().max(255).optional().nullable(),
      emissorNome: z.string().max(255).optional().nullable(),
      emissorCargo: z.string().max(255).optional().nullable(),
      destinatariosJson: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser editado. Reverta o status primeiro." });
      }
      const data: any = { updatedAt: sql`NOW()` };
      if (input.titulo !== undefined) data.titulo = input.titulo;
      if (input.conteudo !== undefined) data.conteudo = input.conteudo;
      if (input.setor !== undefined) data.setor = input.setor;
      if (input.emissorNome !== undefined) data.emissorNome = input.emissorNome;
      if (input.emissorCargo !== undefined) data.emissorCargo = input.emissorCargo;
      if (input.destinatariosJson !== undefined) data.destinatariosJson = input.destinatariosJson;
      await db.update(comunicadosInternos).set(data).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  concluir: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comunicado já está concluído" });
      }
      await db.update(comunicadosInternos).set({
        status: "concluido",
        concluidoPor: ctx.user.name ?? "Sistema",
        concluidoPorUserId: ctx.user.id,
        concluidoEm: sql`NOW()`,
        updatedAt: sql`NOW()`,
      }).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  // Rev. 4264 — Solicita assinatura formal do emissor responsável via FCSign (integrasign).
  // Cria envelope com 1 signatário (o emissor/responsável). Email obrigatório no input.
  solicitarAssinaturaFCSign: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      emissorEmail: z.string().email({ message: "E-mail do emissor obrigatório para assinatura FCSign" }),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);

      if (row.fcsignEnvelopeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este comunicado já possui um envelope FCSign ativo." });
      }

      const emissorNome = row.emissorNome || row.criadoPor || ctx.user.name || "Responsável";
      const emissorCargo = row.emissorCargo || "Responsável";
      const titulo = `CI Nº ${row.numero} — ${row.titulo}`;
      const textoContrato = row.conteudo
        ? String(row.conteudo).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 5000)
        : `Comunicado Interno Nº ${row.numero}: ${row.titulo}`;

      const token = crypto.randomBytes(48).toString("hex");
      const tokenExpira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

      const [envelope] = await db.insert(integrasignEnvelopes).values({
        companyId: input.companyId,
        titulo,
        descricao: `Assinatura formal de Comunicado Interno — módulo RH/Comunicados.`,
        textoContrato,
        status: "pendente",
        totalSignatariosObrigatorios: 1,
        criadoPorId: ctx.user.id,
        criadoPorNome: ctx.user.name ?? "Sistema",
        dataEnvio: sql`NOW()`,
      } as any).returning();

      await db.insert(integrasignSignatarios).values({
        companyId: input.companyId,
        envelopeId: envelope.id,
        papel: "diretor",
        ordemAssinatura: 1,
        nome: emissorNome,
        email: input.emissorEmail,
        cargo: emissorCargo,
        token,
        tokenExpiraEm: tokenExpira.toISOString(),
        status: "pendente",
      } as any).returning();

      // Salva o id do envelope no comunicado
      await db.update(comunicadosInternos)
        .set({ fcsignEnvelopeId: envelope.id } as any)
        .where(eq(comunicadosInternos.id, input.id));

      // Envia convite (try/catch não-bloqueante — não falha a mutation se email cair)
      try {
        await enviarConviteAssinatura({
          email: input.emissorEmail,
          nome: emissorNome,
          papel: "diretor",
          titulo,
          token,
        });
      } catch (emailErr: any) {
        console.warn(`[ComunicadosInternos] FCSign criado (id=${envelope.id}), falha no email:`, emailErr?.message || emailErr);
      }

      return { envelopeId: envelope.id };
    }),

  reverter: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Admin Master podem reverter um comunicado concluído" });
      }
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status !== "concluido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comunicado não está concluído" });
      }
      await db.update(comunicadosInternos).set({
        status: "rascunho",
        concluidoPor: null,
        concluidoPorUserId: null,
        concluidoEm: null,
        updatedAt: sql`NOW()`,
      }).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  uploadDoc: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser alterado. Reverta o status primeiro." });
      }
      const ext = (input.fileName.split(".").pop() || "").toLowerCase();
      const allowedExts = ["pdf", "doc", "docx"];
      if (!allowedExts.includes(ext)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não permitido. Use PDF, DOC ou DOCX." });
      }
      const buffer = Buffer.from(input.fileBase64, "base64");
      const maxSize = 10 * 1024 * 1024;
      if (buffer.length > maxSize) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Tamanho máximo: 10 MB." });
      }
      const ct = ext === "pdf" ? "application/pdf"
        : ext === "doc" ? "application/msword"
        : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
      const key = `documentos/comunicados/c${input.companyId}/${input.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ct);
      await db.update(comunicadosInternos)
        .set({ documentoUrl: url, fileName: input.fileName, updatedAt: sql`NOW()` })
        .where(eq(comunicadosInternos.id, input.id));

      const extractedText = await extractTextFromBuffer(buffer, ext);
      return { url, extractedText };
    }),

  removerAnexo: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser alterado. Reverta o status primeiro." });
      }
      await db.update(comunicadosInternos)
        .set({ documentoUrl: null, fileName: null, updatedAt: sql`NOW()` })
        .where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser excluído. Reverta o status primeiro." });
      }
      await db.update(comunicadosInternos).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? "Sistema",
        deletedByUserId: ctx.user.id,
      } as any).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  // Rev. 2079 — Lista para Assinatura: devolve funcionários ATIVOS da empresa
  // (todos ou apenas os da lista de destinatários do comunicado) com status de assinatura.
  // Rev. 4264 — quando destinatariosJson está preenchido, filtra para só esses IDs.
  listarFuncionariosParaAssinatura: protectedProcedure
    .input(z.object({
      comunicadoId: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      await ensureOwnership(db, input.comunicadoId, input.companyId);

      // Busca destinatariosJson do comunicado para filtrar quando configurado
      const [comRow] = await db.select({ destinatariosJson: comunicadosInternos.destinatariosJson })
        .from(comunicadosInternos)
        .where(eq(comunicadosInternos.id, input.comunicadoId));
      const destinatariosJson = comRow?.destinatariosJson ?? null;
      let destinatariosIds: number[] | null = null;
      if (destinatariosJson) {
        try {
          const parsed = JSON.parse(destinatariosJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            destinatariosIds = parsed
              .map((d: any) => Number(typeof d === "object" ? (d.id ?? d) : d))
              .filter((n: number) => !isNaN(n) && n > 0);
          }
        } catch { /* ignora JSON inválido */ }
      }

      const baseConds: any[] = [
        eq(employees.companyId, input.companyId),
        eq(employees.status, "Ativo"),
      ];
      if (destinatariosIds && destinatariosIds.length > 0) {
        baseConds.push(inArray(employees.id, destinatariosIds));
      }

      const ativos = await db.select({
        id: employees.id,
        matricula: employees.matricula,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        cargo: employees.cargo,
        funcao: employees.funcao,
        setor: employees.setor,
        fotoUrl: employees.fotoUrl,
      })
        .from(employees)
        .where(and(...baseConds))
        .orderBy(asc(employees.nomeCompleto));

      const assinaturas = await db.select({
        id: comunicadoAssinaturas.id,
        employeeId: comunicadoAssinaturas.employeeId,
        assinaturaBase64: comunicadoAssinaturas.assinaturaBase64,
        assinadoEm: comunicadoAssinaturas.assinadoEm,
        registradoPor: comunicadoAssinaturas.registradoPor,
      })
        .from(comunicadoAssinaturas)
        .where(and(
          eq(comunicadoAssinaturas.comunicadoId, input.comunicadoId),
          eq(comunicadoAssinaturas.companyId, input.companyId),
        ));

      const ativoIdsParaObra = ativos.map(a => a.id);
      const alocacoes = ativoIdsParaObra.length > 0
        ? await db.select({
            employeeId: obraFuncionarios.employeeId,
            obraId: obraFuncionarios.obraId,
            obraNome: obras.nome,
          })
            .from(obraFuncionarios)
            .innerJoin(obras, and(
              eq(obras.id, obraFuncionarios.obraId),
              eq(obras.companyId, input.companyId),
              isNull(obras.deletedAt),
            ))
            .where(and(
              eq(obraFuncionarios.companyId, input.companyId),
              eq(obraFuncionarios.isActive, 1),
              inArray(obraFuncionarios.employeeId, ativoIdsParaObra),
            ))
            .orderBy(desc(obraFuncionarios.dataInicio), desc(obraFuncionarios.id))
        : [];

      const mapObra = new Map<number, { obraId: number; obraNome: string }>();
      for (const a of alocacoes) {
        if (!mapObra.has(a.employeeId)) mapObra.set(a.employeeId, { obraId: a.obraId, obraNome: a.obraNome });
      }
      const mapAssin = new Map<number, any>(assinaturas.map(a => [a.employeeId, a]));
      const ativoIds = new Set(ativos.map(a => a.id));
      const totalAssinadosAtivos = assinaturas.filter(a => ativoIds.has(a.employeeId)).length;

      return {
        funcionarios: ativos.map(f => ({
          ...f,
          assinatura: mapAssin.get(f.id) || null,
          obraId: mapObra.get(f.id)?.obraId ?? null,
          obraNome: mapObra.get(f.id)?.obraNome ?? null,
        })),
        totalAtivos: ativos.length,
        totalAssinados: totalAssinadosAtivos,
        filtradoPorDestinatarios: !!(destinatariosIds && destinatariosIds.length > 0),
      };
    }),

  // Rev. 2079 — Registra (ou substitui) a assinatura digital de um colaborador.
  assinar: protectedProcedure
    .input(z.object({
      comunicadoId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      assinaturaBase64: z.string().min(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensureOwnership(db, input.comunicadoId, input.companyId);
      const maxLen = 500 * 1024;
      if (input.assinaturaBase64.length > maxLen) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura muito grande (máx. 500 KB)." });
      }
      if (!input.assinaturaBase64.startsWith("data:image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de assinatura inválido (esperado data:image/...)." });
      }
      const [emp] = await db.select({ id: employees.id, status: employees.status, companyId: employees.companyId })
        .from(employees).where(eq(employees.id, input.employeeId));
      if (!emp || emp.companyId !== input.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });
      }
      if (emp.status !== "Ativo") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas funcionários ATIVOS podem assinar." });
      }
      await db.delete(comunicadoAssinaturas).where(and(
        eq(comunicadoAssinaturas.comunicadoId, input.comunicadoId),
        eq(comunicadoAssinaturas.employeeId, input.employeeId),
      ));
      const [row] = await db.insert(comunicadoAssinaturas).values({
        comunicadoId: input.comunicadoId,
        companyId: input.companyId,
        employeeId: input.employeeId,
        assinaturaBase64: input.assinaturaBase64,
        registradoPor: ctx.user.name ?? "Sistema",
        registradoPorUserId: ctx.user.id,
      }).returning();
      return row;
    }),

  // Rev. 2079 — Remove a assinatura digital de um colaborador.
  removerAssinatura: protectedProcedure
    .input(z.object({
      comunicadoId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensureOwnership(db, input.comunicadoId, input.companyId);
      await db.delete(comunicadoAssinaturas).where(and(
        eq(comunicadoAssinaturas.comunicadoId, input.comunicadoId),
        eq(comunicadoAssinaturas.companyId, input.companyId),
        eq(comunicadoAssinaturas.employeeId, input.employeeId),
      ));
      return { success: true };
    }),
});
