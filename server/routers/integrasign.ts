import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import {
  integrasignEnvelopes,
  integrasignSignatarios,
  integrasignAuditLog,
  terceiroContratos,
} from "../../drizzle/schema";
import { eq, and, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import {
  enviarConviteAssinatura,
  enviarLembrete,
  enviarNotificacaoProximoSignatario,
  enviarNotificacaoConclusao,
  enviarNotificacaoRecusa,
} from "../services/integrasignEmail";
import { resolveSocioAdministradorSigner } from "../services/signatariosContrato";

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function logAudit(
  db: any,
  params: {
    companyId: number;
    envelopeId: number;
    signatarioId?: number;
    acao: string;
    detalhes?: string;
    ipAddress?: string;
    userAgent?: string;
    userId?: number;
    userName?: string;
  }
) {
  await db.insert(integrasignAuditLog).values({
    companyId: params.companyId,
    envelopeId: params.envelopeId,
    signatarioId: params.signatarioId ?? null,
    acao: params.acao,
    detalhes: params.detalhes ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    userId: params.userId ?? null,
    userName: params.userName ?? null,
  });
}

// Rev. 3053 — guarda de acesso por empresa (anti-IDOR). admin/admin_master liberam;
// usuário COM vínculos em user_companies enforça membership; SEM vínculos libera
// (config global por grupo). Mesma regra do _assertFinanceiroCompanyAccess.
async function assertIntegraSignCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

export const integrasignRouter = router({

  listarEnvelopes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
      obraId: z.number().optional(),
      limite: z.number().optional().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [
        eq(integrasignEnvelopes.companyId, input.companyId),
        isNull(integrasignEnvelopes.excluidoEm),
      ];
      if (input.status) conditions.push(eq(integrasignEnvelopes.status, input.status));
      if (input.obraId) conditions.push(eq(integrasignEnvelopes.obraId, input.obraId));

      const envelopes = await db
        .select()
        .from(integrasignEnvelopes)
        .where(and(...conditions))
        .orderBy(desc(integrasignEnvelopes.criadoEm))
        .limit(input.limite);

      const envelopeIds = envelopes.map((e: any) => e.id);
      let signatarios: any[] = [];
      if (envelopeIds.length > 0) {
        signatarios = await db
          .select({
            id: integrasignSignatarios.id,
            envelopeId: integrasignSignatarios.envelopeId,
            papel: integrasignSignatarios.papel,
            nome: integrasignSignatarios.nome,
            status: integrasignSignatarios.status,
            ordemAssinatura: integrasignSignatarios.ordemAssinatura,
            dataAssinatura: integrasignSignatarios.dataAssinatura,
          })
          .from(integrasignSignatarios)
          .where(inArray(integrasignSignatarios.envelopeId, envelopeIds))
          .orderBy(asc(integrasignSignatarios.ordemAssinatura));
      }

      return envelopes.map((env: any) => ({
        ...env,
        signatarios: signatarios.filter((s: any) => s.envelopeId === env.id),
      }));
    }),

  getEnvelope: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [envelope] = await db
        .select()
        .from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.id),
          eq(integrasignEnvelopes.companyId, input.companyId),
          isNull(integrasignEnvelopes.excluidoEm),
        ));
      if (!envelope) throw new TRPCError({ code: "NOT_FOUND", message: "Envelope não encontrado" });

      const signatarios = await db
        .select()
        .from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, input.id))
        .orderBy(asc(integrasignSignatarios.ordemAssinatura));

      const auditLog = await db
        .select()
        .from(integrasignAuditLog)
        .where(eq(integrasignAuditLog.envelopeId, input.id))
        .orderBy(desc(integrasignAuditLog.criadoEm))
        .limit(100);

      return {
        ...envelope,
        signatarios: signatarios.map((s: any) => ({
          ...s,
          assinaturaImagem: undefined,
          rubricaImagem: undefined,
        })),
        auditLog,
      };
    }),

  criarEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoTerceiroId: z.number().optional(),
      ordemCompraId: z.number().optional(),
      obraId: z.number().optional(),
      titulo: z.string(),
      descricao: z.string().optional(),
      textoContrato: z.string().optional(),
      signatarios: z.array(z.object({
        papel: z.enum(["fornecedor", "gestor_projeto", "financeiro", "diretor", "testemunha"]),
        ordemAssinatura: z.number(),
        nome: z.string(),
        email: z.string().email(),
        cpfCnpj: z.string().optional(),
        cargo: z.string().optional(),
        empresaNome: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      // Rev. 3050 — TODO contrato deve ser assinado por 3 signatários: FORNECEDOR
      // + GESTOR DA OBRA + SÓCIO ADMINISTRADOR (este por ÚLTIMO, autoridade final).
      // O front envia fornecedor + gestor (com seus dados); aqui NORMALIZAMOS de forma
      // DETERMINÍSTICA e IDEMPOTENTE sempre que o envelope for um contrato
      // (contratoTerceiroId): descartamos qualquer "diretor"/"financeiro" que o cliente
      // tenha mandado e injetamos o SÓCIO ADMINISTRADOR resolvido server-side como o
      // ÚNICO "diretor", por último. Assina por link (e-mail vazio), igual ao fluxo da OC.
      const signatariosFinais: Array<{
        papel: "fornecedor" | "gestor_projeto" | "financeiro" | "diretor" | "testemunha";
        ordemAssinatura: number;
        nome: string;
        email: string;
        cpfCnpj?: string;
        cargo?: string;
        empresaNome?: string;
      }> = [...input.signatarios];

      if (input.contratoTerceiroId) {
        const socioAdmin = await resolveSocioAdministradorSigner(db, input.companyId);
        // Mantém só os papéis obrigatórios do contrato (fornecedor + gestor da obra);
        // remove qualquer "diretor"/"financeiro" recebido para garantir EXATAMENTE 1
        // sócio (re-rodar sobre uma lista já normalizada produz o mesmo resultado).
        const obrigatorios = signatariosFinais.filter(
          s => s.papel === "fornecedor" || s.papel === "gestor_projeto",
        );
        const testemunhas = signatariosFinais.filter(s => s.papel === "testemunha");
        const diretor = {
          papel: "diretor" as const,
          ordemAssinatura: 0,
          nome: socioAdmin.nome,
          email: "",
          cpfCnpj: socioAdmin.cpfCnpj ?? undefined,
          cargo: "Sócio Administrador",
          empresaNome: "FC Engenharia",
        };
        // Ordem de assinatura: FORNECEDOR → GESTOR (obrigatórios) → testemunhas →
        // SÓCIO ADMINISTRADOR por ÚLTIMO (autoridade final que fecha o contrato).
        const reordenados = [...obrigatorios, ...testemunhas, diretor];
        signatariosFinais.length = 0;
        signatariosFinais.push(...reordenados.map((s, i) => ({ ...s, ordemAssinatura: i + 1 })));
      }

      const [envelope] = await db.insert(integrasignEnvelopes).values({
        companyId: input.companyId,
        contratoTerceiroId: input.contratoTerceiroId ?? null,
        ordemCompraId: input.ordemCompraId ?? null,
        obraId: input.obraId ?? null,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        textoContrato: input.textoContrato ?? null,
        status: "rascunho",
        totalSignatariosObrigatorios: signatariosFinais.filter(s => s.papel !== "testemunha").length,
        criadoPorId: userId,
        criadoPorNome: userName,
      }).returning();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      for (const sig of signatariosFinais) {
        await db.insert(integrasignSignatarios).values({
          companyId: input.companyId,
          envelopeId: envelope.id,
          papel: sig.papel,
          ordemAssinatura: sig.ordemAssinatura,
          nome: sig.nome,
          email: sig.email,
          cpfCnpj: sig.cpfCnpj ?? null,
          cargo: sig.cargo ?? null,
          empresaNome: sig.empresaNome ?? null,
          token: generateToken(),
          tokenExpiraEm: expiresAt.toISOString(),
          status: "pendente",
        });
      }

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: envelope.id,
        acao: "envelope_criado",
        detalhes: `Envelope "${input.titulo}" criado com ${signatariosFinais.length} signatário(s)`,
        userId,
        userName,
      });

      return { id: envelope.id, status: "rascunho" };
    }),

  atualizarTextoContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeId: z.number(),
      textoContrato: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.envelopeId),
          eq(integrasignEnvelopes.companyId, input.companyId),
          isNull(integrasignEnvelopes.excluidoEm),
        ));
      if (!envelope) throw new TRPCError({ code: "NOT_FOUND" });
      if (envelope.status !== "rascunho") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível editar contratos em rascunho" });
      }

      await db.update(integrasignEnvelopes)
        .set({ textoContrato: input.textoContrato, atualizadoEm: new Date().toISOString() })
        .where(eq(integrasignEnvelopes.id, input.envelopeId));

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: input.envelopeId,
        acao: "texto_editado",
        detalhes: "Texto do contrato atualizado antes do envio",
        userId,
        userName,
      });

      return { success: true };
    }),

  // Rev. 2898 — edição do envelope pelo dashboard. Título/descrição podem ser
  // ajustados em qualquer status (metadado, não afeta o hash do documento). O CORPO
  // do contrato só pode ser editado em rascunho — depois de enviado, a alteração de
  // conteúdo deve passar por "Nova Versão" para preservar a integridade das assinaturas.
  editarEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeId: z.number(),
      titulo: z.string().min(1).optional(),
      descricao: z.string().optional(),
      textoContrato: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.envelopeId),
          eq(integrasignEnvelopes.companyId, input.companyId),
          isNull(integrasignEnvelopes.excluidoEm),
        ));
      if (!envelope) throw new TRPCError({ code: "NOT_FOUND" });

      const patch: any = { atualizadoEm: new Date().toISOString() };
      if (input.titulo !== undefined) patch.titulo = input.titulo;
      if (input.descricao !== undefined) patch.descricao = input.descricao;
      if (input.textoContrato !== undefined) {
        if (envelope.status !== "rascunho") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O corpo do contrato só pode ser editado em rascunho. Para alterar um contrato já enviado, cancele e crie uma Nova Versão.",
          });
        }
        patch.textoContrato = input.textoContrato;
      }

      await db.update(integrasignEnvelopes)
        .set(patch)
        .where(eq(integrasignEnvelopes.id, input.envelopeId));

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: input.envelopeId,
        acao: "envelope_editado",
        detalhes: `Envelope editado por ${userName}`,
        userId,
        userName,
      });

      return { success: true };
    }),

  // Rev. 3053 — adiciona o SÓCIO ADMINISTRADOR como signatário FINAL (papel
  // "diretor", por ÚLTIMO) em um contrato JÁ EXISTENTE criado ANTES da injeção
  // automática (Rev. 3050) e que ficou só com fornecedor + gestor. Gera o
  // token/link na hora. Idempotente: se já houver um "diretor", recusa.
  adicionarSocioAdministrador: protectedProcedure
    .input(z.object({ companyId: z.number(), envelopeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
      const userId = (ctx as any).user?.id ?? (ctx as any).session?.userId;
      const userName = (ctx as any).user?.name || (ctx as any).session?.name || "Sistema";

      // Resolve o sócio ANTES da transação (leitura pura, não precisa do lock).
      const socio = await resolveSocioAdministradorSigner(db, input.companyId);

      // Tudo que muda estado roda numa transação com LOCK da linha do envelope
      // (SELECT ... FOR UPDATE): dois cliques/abas concorrentes serializam aqui,
      // a recheck do "diretor" acontece sob o lock → garante idempotência real
      // (não dá pra inserir 2 sócios).
      const nome = await db.transaction(async (tx: any) => {
        const [envelope] = await tx.select().from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.id, input.envelopeId),
            eq(integrasignEnvelopes.companyId, input.companyId),
            isNull(integrasignEnvelopes.excluidoEm),
          ))
          .for("update");
        if (!envelope) throw new TRPCError({ code: "NOT_FOUND", message: "Envelope não encontrado" });
        if (!envelope.contratoTerceiroId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Só contratos têm o sócio administrador como signatário." });
        }
        if (["cancelado", "expirado", "recusado", "concluido"].includes(envelope.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Envelope ${envelope.status} — não é possível adicionar signatário.` });
        }

        const sigs = await tx.select().from(integrasignSignatarios)
          .where(eq(integrasignSignatarios.envelopeId, input.envelopeId));
        if (sigs.some((s: any) => s.papel === "diretor")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O sócio administrador já é signatário deste contrato." });
        }

        const maxOrdem = sigs.reduce((m: number, s: any) => Math.max(m, s.ordemAssinatura || 0), 0);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Sócio assina por ÚLTIMO (autoridade final). status "pendente" com token
        // válido → link já fica copiável no dashboard; a ordem sequencial garante
        // que ele só fecha depois dos anteriores.
        await tx.insert(integrasignSignatarios).values({
          companyId: input.companyId,
          envelopeId: input.envelopeId,
          papel: "diretor",
          ordemAssinatura: maxOrdem + 1,
          nome: socio.nome,
          email: "",
          cpfCnpj: socio.cpfCnpj ?? null,
          cargo: "Sócio Administrador",
          empresaNome: "FC Engenharia",
          token: generateToken(),
          tokenExpiraEm: expiresAt.toISOString(),
          status: "pendente",
        });

        const novoTotalObrig = sigs.filter((s: any) => s.papel !== "testemunha").length + 1;
        await tx.update(integrasignEnvelopes).set({
          totalSignatariosObrigatorios: novoTotalObrig,
          atualizadoEm: new Date().toISOString(),
        }).where(eq(integrasignEnvelopes.id, input.envelopeId));

        await logAudit(tx, {
          companyId: input.companyId,
          envelopeId: input.envelopeId,
          acao: "signatario_adicionado",
          detalhes: `Sócio administrador (${socio.nome}) adicionado como signatário final do contrato`,
          userId,
          userName,
        });

        return socio.nome;
      });

      return { success: true, nome };
    }),

  enviarParaAssinatura: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeId: z.number(),
      // Rev. 3042: permite escolher entre disparar e-mail (padrão) ou apenas
      // gerar/ativar os links de assinatura p/ envio manual (ex.: WhatsApp).
      enviarEmail: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.envelopeId),
          eq(integrasignEnvelopes.companyId, input.companyId),
          isNull(integrasignEnvelopes.excluidoEm),
        ));
      if (!envelope) throw new TRPCError({ code: "NOT_FOUND" });
      if (envelope.status !== "rascunho") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envelope já foi enviado" });
      }

      const signatarios = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, input.envelopeId))
        .orderBy(asc(integrasignSignatarios.ordemAssinatura));

      if (signatarios.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum signatário definido" });
      }

      const hashDoc = envelope.textoContrato ? hashData(envelope.textoContrato) : null;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.update(integrasignEnvelopes).set({
        status: "enviado",
        hashDocumento: hashDoc,
        dataEnvio: new Date().toISOString(),
        dataExpiracao: expiresAt.toISOString(),
        atualizadoEm: new Date().toISOString(),
      }).where(eq(integrasignEnvelopes.id, input.envelopeId));

      const primeiroObrigatorio = signatarios.find((s: any) => s.ordemAssinatura === 1);
      const testemunhas = signatarios.filter((s: any) => s.papel === "testemunha");

      const toNotify = primeiroObrigatorio ? [primeiroObrigatorio, ...testemunhas] : testemunhas;

      for (const sig of toNotify) {
        await db.update(integrasignSignatarios).set({
          status: "notificado",
          dataNotificacao: new Date().toISOString(),
          tokenExpiraEm: expiresAt.toISOString(),
        }).where(eq(integrasignSignatarios.id, sig.id));

        if (input.enviarEmail !== false) {
          enviarConviteAssinatura({
            email: sig.email,
            nome: sig.nome,
            papel: sig.papel,
            titulo: envelope.titulo,
            token: sig.token,
            remetente: userName,
          }).catch(err => console.error(`[IntegraSign] Erro ao enviar convite para ${sig.email}:`, err?.message));
        }
      }

      if (envelope.contratoTerceiroId) {
        await db.update(terceiroContratos).set({
          status: "aguardando_assinaturas",
        }).where(and(
          eq(terceiroContratos.id, envelope.contratoTerceiroId),
          eq(terceiroContratos.companyId, input.companyId),
        ));
      }

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: input.envelopeId,
        acao: "envelope_enviado",
        detalhes: `Enviado para assinatura${input.enviarEmail === false ? " (somente links — sem e-mail)" : " por e-mail"}. Primeiro: ${primeiroObrigatorio?.nome || "N/A"}. Hash: ${hashDoc || "N/A"}`,
        userId,
        userName,
      });

      return { success: true, notificados: toNotify.length, enviarEmail: input.enviarEmail !== false };
    }),

  // ---- ROTAS PÚBLICAS (token-based) ----

  getDocumentoPublico: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [signatario] = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.token, input.token));

      if (!signatario) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido ou expirado" });
      }

      const agora = new Date();
      if (new Date(signatario.tokenExpiraEm) < agora) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Link expirado. Solicite um novo link ao remetente." });
      }

      if (signatario.status === "recusado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento foi recusado." });
      }

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(eq(integrasignEnvelopes.id, signatario.envelopeId));

      if (!envelope || envelope.excluidoEm) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Este documento não está mais disponível." });
      }
      if (["cancelado", "expirado", "recusado"].includes(envelope.status)) {
        const msgs: Record<string, string> = {
          cancelado: "Este envelope foi cancelado.",
          expirado: "Este envelope expirou.",
          recusado: "Este envelope foi recusado.",
        };
        throw new TRPCError({ code: "BAD_REQUEST", message: msgs[envelope?.status || ""] || "Envelope indisponível." });
      }

      if (signatario.status === "assinado" || envelope.status === "concluido") {
        const todosSignatarios = await db.select({
          id: integrasignSignatarios.id,
          papel: integrasignSignatarios.papel,
          nome: integrasignSignatarios.nome,
          status: integrasignSignatarios.status,
          ordemAssinatura: integrasignSignatarios.ordemAssinatura,
          dataAssinatura: integrasignSignatarios.dataAssinatura,
        }).from(integrasignSignatarios)
          .where(eq(integrasignSignatarios.envelopeId, envelope.id))
          .orderBy(asc(integrasignSignatarios.ordemAssinatura));

        return {
          jaAssinado: true,
          envelope: {
            id: envelope.id,
            titulo: envelope.titulo,
            descricao: envelope.descricao,
            textoContrato: envelope.textoContrato,
            hashDocumento: envelope.hashDocumento,
            versao: envelope.versao,
            status: envelope.status,
          },
          signatario: {
            id: signatario.id,
            nome: signatario.nome,
            papel: signatario.papel,
            status: signatario.status,
            dataAssinatura: signatario.dataAssinatura,
          },
          todosSignatarios,
          podeAssinar: false,
        };
      }

      if (signatario.status === "notificado" || signatario.status === "pendente") {
        await db.update(integrasignSignatarios).set({
          status: "visualizado",
          dataVisualizacao: new Date().toISOString(),
        }).where(eq(integrasignSignatarios.id, signatario.id));

        await logAudit(db, {
          companyId: envelope.companyId,
          envelopeId: envelope.id,
          signatarioId: signatario.id,
          acao: "documento_visualizado",
          detalhes: `${signatario.nome} (${signatario.papel}) visualizou o documento`,
        });
      }

      const todosSignatarios = await db.select({
        id: integrasignSignatarios.id,
        papel: integrasignSignatarios.papel,
        nome: integrasignSignatarios.nome,
        status: integrasignSignatarios.status,
        ordemAssinatura: integrasignSignatarios.ordemAssinatura,
        dataAssinatura: integrasignSignatarios.dataAssinatura,
      }).from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, envelope.id))
        .orderBy(asc(integrasignSignatarios.ordemAssinatura));

      const podeAssinar = (() => {
        if (signatario.papel === "testemunha") return true;
        const anteriores = todosSignatarios.filter(
          (s: any) => s.ordemAssinatura < signatario.ordemAssinatura && s.papel !== "testemunha"
        );
        return anteriores.every((s: any) => s.status === "assinado");
      })();

      return {
        envelope: {
          id: envelope.id,
          titulo: envelope.titulo,
          descricao: envelope.descricao,
          textoContrato: envelope.textoContrato,
          hashDocumento: envelope.hashDocumento,
          versao: envelope.versao,
        },
        signatario: {
          id: signatario.id,
          nome: signatario.nome,
          email: signatario.email,
          cpfCnpj: signatario.cpfCnpj ?? null,
          papel: signatario.papel,
          status: signatario.status,
          podeAssinar,
        },
        todosSignatarios,
        termoLegal: `Ao assinar este documento, declaro que li e concordo com todos os termos do contrato acima. Esta assinatura eletrônica tem validade jurídica nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020. A assinatura será registrada com data/hora, endereço IP, geolocalização e hash criptográfico SHA-256 para fins de autenticidade e integridade.`,
      };
    }),

  assinarDocumento: publicProcedure
    .input(z.object({
      token: z.string(),
      assinaturaImagem: z.string(),
      rubricaImagem: z.string(),
      nomeConfirmado: z.string(),
      cpfCnpjConfirmado: z.string().optional(),
      termoAceito: z.boolean(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      geoAccuracy: z.number().optional(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      dispositivoInfo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      if (!input.termoAceito) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você precisa aceitar os termos para assinar" });
      }

      const [signatario] = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.token, input.token));

      if (!signatario) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido" });

      if (new Date(signatario.tokenExpiraEm) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Link expirado" });
      }

      if (signatario.status === "assinado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Já assinado" });
      }

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(eq(integrasignEnvelopes.id, signatario.envelopeId));

      if (!envelope || envelope.excluidoEm || ["cancelado", "expirado", "recusado", "concluido"].includes(envelope.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este envelope não aceita mais assinaturas" });
      }

      if (signatario.papel !== "testemunha") {
        const anteriores = await db.select().from(integrasignSignatarios)
          .where(and(
            eq(integrasignSignatarios.envelopeId, envelope.id),
            sql`${integrasignSignatarios.ordemAssinatura} < ${signatario.ordemAssinatura}`,
            sql`${integrasignSignatarios.papel} != 'testemunha'`,
          ));
        const naoAssinados = anteriores.filter((s: any) => s.status !== "assinado");
        if (naoAssinados.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ainda há signatários anteriores que precisam assinar primeiro",
          });
        }
      }

      const hashAss = hashData(input.assinaturaImagem);
      const hashRub = hashData(input.rubricaImagem);

      await db.update(integrasignSignatarios).set({
        status: "assinado",
        assinaturaImagem: input.assinaturaImagem,
        rubricaImagem: input.rubricaImagem,
        hashAssinatura: hashAss,
        hashRubrica: hashRub,
        nomeConfirmado: input.nomeConfirmado,
        cpfCnpjConfirmado: input.cpfCnpjConfirmado ?? null,
        termoAceito: true,
        textoTermo: `Assinatura eletrônica realizada em conformidade com a MP 2.200-2/2001 e Lei 14.063/2020.`,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        latitude: input.latitude?.toString() ?? null,
        longitude: input.longitude?.toString() ?? null,
        geoAccuracy: input.geoAccuracy?.toString() ?? null,
        dispositivoInfo: input.dispositivoInfo ?? null,
        dataAssinatura: new Date().toISOString(),
      }).where(eq(integrasignSignatarios.id, signatario.id));

      await logAudit(db, {
        companyId: envelope.companyId,
        envelopeId: envelope.id,
        signatarioId: signatario.id,
        acao: "documento_assinado",
        detalhes: `${signatario.nome} (${signatario.papel}) assinou. Hash: ${hashAss}. IP: ${input.ipAddress || "N/A"}`,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      const todosSignatarios = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, envelope.id));

      const obrigatorios = todosSignatarios.filter((s: any) => s.papel !== "testemunha");
      const assinadosObrig = obrigatorios.filter((s: any) => s.status === "assinado");

      const envelopeUpdate: any = {
        totalAssinaturasRealizadas: assinadosObrig.length,
        atualizadoEm: new Date().toISOString(),
      };
      if (assinadosObrig.length > 0 && assinadosObrig.length < envelope.totalSignatariosObrigatorios && envelope.status === "enviado") {
        envelopeUpdate.status = "em_andamento";
      }
      await db.update(integrasignEnvelopes).set(envelopeUpdate).where(eq(integrasignEnvelopes.id, envelope.id));

      if (assinadosObrig.length >= envelope.totalSignatariosObrigatorios) {
        await db.update(integrasignEnvelopes).set({
          status: "concluido",
          dataConclusao: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        }).where(eq(integrasignEnvelopes.id, envelope.id));

        if (envelope.contratoTerceiroId) {
          await db.update(terceiroContratos).set({
            status: "ativo",
          }).where(and(eq(terceiroContratos.id, envelope.contratoTerceiroId), eq(terceiroContratos.companyId, envelope.companyId)));
        }

        await logAudit(db, {
          companyId: envelope.companyId,
          envelopeId: envelope.id,
          acao: "envelope_concluido",
          detalhes: `Todas as ${envelope.totalSignatariosObrigatorios} assinaturas obrigatórias foram realizadas. Contrato ativado.`,
        });

        const allEmails = todosSignatarios.map((s: any) => ({ email: s.email, nome: s.nome }));
        enviarNotificacaoConclusao({ emails: allEmails, titulo: envelope.titulo })
          .catch(err => console.error(`[IntegraSign] Erro notificação conclusão:`, err?.message));

        return { success: true, concluido: true };
      }

      if (signatario.papel !== "testemunha") {
        const proximoOrdem = signatario.ordemAssinatura + 1;
        const [proximo] = await db.select().from(integrasignSignatarios)
          .where(and(
            eq(integrasignSignatarios.envelopeId, envelope.id),
            eq(integrasignSignatarios.ordemAssinatura, proximoOrdem),
            sql`${integrasignSignatarios.papel} != 'testemunha'`,
          ));

        if (proximo && proximo.status !== "assinado") {
          await db.update(integrasignSignatarios).set({
            status: "notificado",
            dataNotificacao: new Date().toISOString(),
          }).where(eq(integrasignSignatarios.id, proximo.id));

          enviarNotificacaoProximoSignatario({
            email: proximo.email,
            nome: proximo.nome,
            papel: proximo.papel,
            titulo: envelope.titulo,
            token: proximo.token,
            signatarioAnterior: signatario.nome,
          }).catch(err => console.error(`[IntegraSign] Erro notificar próximo:`, err?.message));

          await logAudit(db, {
            companyId: envelope.companyId,
            envelopeId: envelope.id,
            signatarioId: proximo.id,
            acao: "signatario_notificado",
            detalhes: `${proximo.nome} (${proximo.papel}) notificado - é a sua vez de assinar`,
          });
        }
      }

      return { success: true, concluido: false };
    }),

  recusarDocumento: publicProcedure
    .input(z.object({
      token: z.string(),
      motivoRecusa: z.string().min(1),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [signatario] = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.token, input.token));

      if (!signatario) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido" });
      if (signatario.status === "assinado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Já assinado, não pode recusar" });
      }
      if (signatario.status === "recusado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Já recusado" });
      }
      if (new Date(signatario.tokenExpiraEm) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Link expirado" });
      }

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(eq(integrasignEnvelopes.id, signatario.envelopeId));
      if (!envelope || envelope.excluidoEm) throw new TRPCError({ code: "NOT_FOUND" });
      if (["cancelado", "expirado", "recusado", "concluido"].includes(envelope.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envelope indisponível para ações" });
      }

      await db.update(integrasignSignatarios).set({
        status: "recusado",
        motivoRecusa: input.motivoRecusa,
        dataRecusa: new Date().toISOString(),
      }).where(eq(integrasignSignatarios.id, signatario.id));

      await db.update(integrasignEnvelopes).set({
        status: "recusado",
        motivoRecusa: input.motivoRecusa,
        recusadoPorNome: signatario.nome,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(integrasignEnvelopes.id, envelope.id));

      await logAudit(db, {
        companyId: envelope.companyId,
        envelopeId: envelope.id,
        signatarioId: signatario.id,
        acao: "documento_recusado",
        detalhes: `${signatario.nome} (${signatario.papel}) recusou. Motivo: ${input.motivoRecusa}`,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      if (envelope.criadoPorNome) {
        const todosSignatarios = await db.select().from(integrasignSignatarios)
          .where(eq(integrasignSignatarios.envelopeId, envelope.id));
        const criadorSig = todosSignatarios.find((s: any) => s.ordemAssinatura === 2);
        const emailDest = criadorSig?.email || todosSignatarios[0]?.email;
        if (emailDest) {
          enviarNotificacaoRecusa({
            emailRemetente: emailDest,
            nomeRemetente: envelope.criadoPorNome,
            titulo: envelope.titulo,
            recusadoPor: signatario.nome,
            motivo: input.motivoRecusa,
          }).catch(err => console.error(`[IntegraSign] Erro notificação recusa:`, err?.message));
        }
      }

      return { success: true };
    }),

  reenviarNotificacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      signatarioId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      const [signatario] = await db.select().from(integrasignSignatarios)
        .where(and(
          eq(integrasignSignatarios.id, input.signatarioId),
          eq(integrasignSignatarios.companyId, input.companyId),
        ));

      if (!signatario) throw new TRPCError({ code: "NOT_FOUND" });
      if (signatario.status === "assinado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Já assinado" });
      }

      const [envelopeCheck] = await db.select({ status: integrasignEnvelopes.status })
        .from(integrasignEnvelopes).where(eq(integrasignEnvelopes.id, signatario.envelopeId));
      if (envelopeCheck && ["cancelado", "expirado", "recusado", "concluido"].includes(envelopeCheck.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Envelope ${envelopeCheck.status} — não é possível reenviar.` });
      }

      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 7);
      const newToken = generateToken();

      await db.update(integrasignSignatarios).set({
        token: newToken,
        tokenExpiraEm: newExpiry.toISOString(),
        status: "notificado",
        dataLembrete: new Date().toISOString(),
      }).where(eq(integrasignSignatarios.id, signatario.id));

      const [envelopeForReminder] = await db.select({ titulo: integrasignEnvelopes.titulo })
        .from(integrasignEnvelopes).where(eq(integrasignEnvelopes.id, signatario.envelopeId));

      enviarLembrete({
        email: signatario.email,
        nome: signatario.nome,
        titulo: envelopeForReminder?.titulo || "Documento",
        token: newToken,
      }).catch(err => console.error(`[IntegraSign] Erro reenviar lembrete:`, err?.message));

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: signatario.envelopeId,
        signatarioId: signatario.id,
        acao: "lembrete_reenviado",
        detalhes: `Lembrete reenviado para ${signatario.nome} (${signatario.email})`,
        userId,
        userName,
      });

      return { success: true, novoToken: newToken };
    }),

  cancelarEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeId: z.number(),
      motivo: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.envelopeId),
          eq(integrasignEnvelopes.companyId, input.companyId),
          isNull(integrasignEnvelopes.excluidoEm),
        ));

      if (!envelope) throw new TRPCError({ code: "NOT_FOUND" });
      if (envelope.status === "concluido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envelope já concluído, não pode cancelar" });
      }

      await db.update(integrasignEnvelopes).set({
        status: "cancelado",
        motivoCancelamento: input.motivo,
        dataCancelamento: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      }).where(eq(integrasignEnvelopes.id, input.envelopeId));

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: input.envelopeId,
        acao: "envelope_cancelado",
        detalhes: `Cancelado por ${userName}. Motivo: ${input.motivo}`,
        userId,
        userName,
      });

      return { success: true };
    }),

  excluirEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userName = (ctx as any).session?.name || "Sistema";

      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.envelopeId),
          eq(integrasignEnvelopes.companyId, input.companyId),
        ));

      if (!envelope) throw new TRPCError({ code: "NOT_FOUND" });
      if (envelope.excluidoEm) {
        return { success: true };
      }

      // Soft-delete (R-001/R-007/R-010 — JAMAIS DELETE em produção): marca excluido_em e
      // some da lista, mas preserva o registro legal/assinaturas/auditoria no banco.
      const userId = (ctx as any).session?.userId;
      await db.update(integrasignEnvelopes)
        .set({ excluidoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() })
        .where(eq(integrasignEnvelopes.id, input.envelopeId));

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: input.envelopeId,
        acao: "envelope_excluido",
        detalhes: `Envelope removido da lista por ${userName} (soft-delete; registro preservado para auditoria)`,
        userId,
        userName,
      });

      console.log(`[IntegraSign] Envelope #${input.envelopeId} excluído (soft) por ${userName}`);
      return { success: true };
    }),

  criarNovaVersao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeIdAnterior: z.number(),
      textoContrato: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userId = (ctx as any).session?.userId;
      const userName = (ctx as any).session?.name || "Sistema";

      const [anterior] = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.id, input.envelopeIdAnterior),
          eq(integrasignEnvelopes.companyId, input.companyId),
          isNull(integrasignEnvelopes.excluidoEm),
        ));

      if (!anterior) throw new TRPCError({ code: "NOT_FOUND" });
      if (anterior.status !== "recusado" && anterior.status !== "cancelado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível criar nova versão de envelopes recusados ou cancelados" });
      }

      const signatariosAnteriores = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, anterior.id))
        .orderBy(asc(integrasignSignatarios.ordemAssinatura));

      const [novoEnvelope] = await db.insert(integrasignEnvelopes).values({
        companyId: input.companyId,
        contratoTerceiroId: anterior.contratoTerceiroId,
        ordemCompraId: anterior.ordemCompraId,
        obraId: anterior.obraId,
        titulo: anterior.titulo,
        descricao: anterior.descricao,
        textoContrato: input.textoContrato ?? anterior.textoContrato,
        status: "rascunho",
        versao: anterior.versao + 1,
        versaoAnteriorId: anterior.id,
        totalSignatariosObrigatorios: anterior.totalSignatariosObrigatorios,
        criadoPorId: userId,
        criadoPorNome: userName,
      }).returning();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      for (const sig of signatariosAnteriores) {
        await db.insert(integrasignSignatarios).values({
          companyId: input.companyId,
          envelopeId: novoEnvelope.id,
          papel: sig.papel,
          ordemAssinatura: sig.ordemAssinatura,
          nome: sig.nome,
          email: sig.email,
          cpfCnpj: sig.cpfCnpj,
          cargo: sig.cargo,
          empresaNome: sig.empresaNome,
          token: generateToken(),
          tokenExpiraEm: expiresAt.toISOString(),
          status: "pendente",
        });
      }

      await logAudit(db, {
        companyId: input.companyId,
        envelopeId: novoEnvelope.id,
        acao: "nova_versao_criada",
        detalhes: `Versão ${novoEnvelope.versao} criada a partir do envelope #${anterior.id} (v${anterior.versao})`,
        userId,
        userName,
      });

      return { id: novoEnvelope.id, versao: novoEnvelope.versao };
    }),

  getAuditLog: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      envelopeId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      return await db.select().from(integrasignAuditLog)
        .where(and(
          eq(integrasignAuditLog.envelopeId, input.envelopeId),
          eq(integrasignAuditLog.companyId, input.companyId),
        ))
        .orderBy(desc(integrasignAuditLog.criadoEm));
    }),

  getMeusEnvelopesPendentes: protectedProcedure
    .input(z.object({ companyId: z.number(), email: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const pendentes = await db
        .select({
          signatarioId: integrasignSignatarios.id,
          envelopeId: integrasignSignatarios.envelopeId,
          papel: integrasignSignatarios.papel,
          status: integrasignSignatarios.status,
          titulo: integrasignEnvelopes.titulo,
          envelopeStatus: integrasignEnvelopes.status,
          dataEnvio: integrasignEnvelopes.dataEnvio,
        })
        .from(integrasignSignatarios)
        .innerJoin(integrasignEnvelopes, eq(integrasignSignatarios.envelopeId, integrasignEnvelopes.id))
        .where(and(
          eq(integrasignSignatarios.companyId, input.companyId),
          eq(integrasignSignatarios.email, input.email),
          inArray(integrasignSignatarios.status, ["pendente", "notificado", "visualizado"]),
          inArray(integrasignEnvelopes.status, ["enviado", "em_andamento"]),
        ))
        .orderBy(desc(integrasignEnvelopes.dataEnvio));

      return pendentes;
    }),
});
