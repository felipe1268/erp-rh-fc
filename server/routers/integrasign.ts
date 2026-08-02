import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import {
  integrasignEnvelopes,
  integrasignSignatarios,
  integrasignAuditLog,
  terceiroContratos,
  companies,
  employees,
  gestorSubstituicaoSolicitacoes,
  medicaoCampo,
  signatureSessions,
  signatureSigners,
  rhDocumentos,
  epiDeliveries,
  epiAssinaturas,
  comunicadosInternos,
  comunicadoAssinaturas,
  ptPermissoes,
  ptAssinaturas,
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // Rev. 4854 — tenancy guard (review): resposta expõe tokens de assinatura.
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
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

  // Rev. 3059 — dados do contrato ASSINADO (concluído) p/ gerar o PDF autenticado
  // direto na tela do contrato (visualizar/baixar), sem precisar do token público.
  // Retorna a MESMA forma consumida por `gerarContratoAssinadoPdf` (envelope +
  // todosSignatarios com imagem da assinatura/rúbrica + trilha de auditoria).
  getContratoAssinadoPdfData: protectedProcedure
    .input(z.object({ companyId: z.number(), contratoTerceiroId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
      const db = await getDb();

      const [envelope] = await db
        .select()
        .from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.contratoTerceiroId, input.contratoTerceiroId),
          eq(integrasignEnvelopes.companyId, input.companyId),
          eq(integrasignEnvelopes.status, "concluido"),
          isNull(integrasignEnvelopes.excluidoEm),
        ))
        .orderBy(desc(integrasignEnvelopes.criadoEm))
        .limit(1);

      if (!envelope) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum contrato assinado (concluído) encontrado." });
      }

      const todosSignatarios = await db.select({
        id: integrasignSignatarios.id,
        papel: integrasignSignatarios.papel,
        nome: integrasignSignatarios.nome,
        cargo: integrasignSignatarios.cargo,
        cpfCnpj: integrasignSignatarios.cpfCnpj,
        status: integrasignSignatarios.status,
        ordemAssinatura: integrasignSignatarios.ordemAssinatura,
        dataAssinatura: integrasignSignatarios.dataAssinatura,
        assinaturaImagem: integrasignSignatarios.assinaturaImagem,
        rubricaImagem: integrasignSignatarios.rubricaImagem,
        hashAssinatura: integrasignSignatarios.hashAssinatura,
        hashRubrica: integrasignSignatarios.hashRubrica,
        ipAddress: integrasignSignatarios.ipAddress,
        latitude: integrasignSignatarios.latitude,
        longitude: integrasignSignatarios.longitude,
        geoAccuracy: integrasignSignatarios.geoAccuracy,
        dispositivoInfo: integrasignSignatarios.dispositivoInfo,
        nomeConfirmado: integrasignSignatarios.nomeConfirmado,
        cpfCnpjConfirmado: integrasignSignatarios.cpfCnpjConfirmado,
        termoAceito: integrasignSignatarios.termoAceito,
        dataVisualizacao: integrasignSignatarios.dataVisualizacao,
      }).from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, envelope.id))
        .orderBy(asc(integrasignSignatarios.ordemAssinatura));

      return {
        envelope: {
          id: envelope.id,
          titulo: envelope.titulo,
          descricao: envelope.descricao,
          textoContrato: envelope.textoContrato,
          hashDocumento: envelope.hashDocumento,
          versao: envelope.versao,
          status: envelope.status,
          concluidoEm: envelope.atualizadoEm ?? null,
        },
        todosSignatarios,
      };
    }),

  criarEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoTerceiroId: z.number().optional(),
      ordemCompraId: z.number().optional(),
      obraId: z.number().optional(),
      medicaoTerceiroId: z.number().optional(),
      medicaoCampoId: z.number().optional(),
      titulo: z.string(),
      descricao: z.string().optional(),
      textoContrato: z.string().optional(),
      signatarios: z.array(z.object({
        papel: z.enum(["fornecedor", "gestor_projeto", "financeiro", "rh", "diretor", "testemunha"]),
        ordemAssinatura: z.number(),
        nome: z.string(),
        // Rev. 4851 — e-mail OPCIONAL: sem e-mail o signatário assina por link
        // (copiado/encaminhado) ou pelo pop-up de pendências dentro do sistema.
        email: z.string().email().or(z.literal("")),
        cpfCnpj: z.string().optional(),
        cargo: z.string().optional(),
        empresaNome: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rev. 4794 — tenancy guard (antes o endpoint confiava em input.companyId)
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
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

        // Rev. 4479 — Busca gestores RH e Financeiro configurados (com substituições ativas)
        const [company] = await db!.select({
          gestorFinanceiroId: companies.gestorFinanceiroId,
          gestorFinanceiroNome: companies.gestorFinanceiroNome,
          gestorRhId: (companies as any).gestorRhId,
          gestorRhNome: (companies as any).gestorRhNome,
        }).from(companies).where(eq(companies.id, input.companyId)).limit(1);

        const hoje = new Date().toISOString().slice(0, 10);
        const subs = await db!.select().from(gestorSubstituicaoSolicitacoes)
          .where(and(
            eq(gestorSubstituicaoSolicitacoes.companyId, input.companyId),
            eq(gestorSubstituicaoSolicitacoes.status, "aprovado"),
            sql`(periodo_fim IS NULL OR periodo_fim >= ${hoje})`,
          ))
          .orderBy(desc(gestorSubstituicaoSolicitacoes.criadoEm));

        const subFin = subs.find(s => s.papel === "financeiro");
        const subRh  = subs.find(s => s.papel === "rh");

        const finId = subFin ? subFin.substitutoId : (company?.gestorFinanceiroId ?? null);
        const rhId  = subRh  ? subRh.substitutoId  : ((company as any)?.gestorRhId  ?? null);

        const empIds = [...new Set([finId, rhId].filter(Boolean))] as number[];
        const empRows = empIds.length > 0
          ? await db!.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, email: employees.email, cpf: employees.cpf })
              .from(employees).where(inArray(employees.id, empIds))
          : [];
        const empMap = new Map(empRows.map(e => [e.id, e]));

        const finEmp = finId ? empMap.get(finId) : null;
        const rhEmp  = rhId  ? empMap.get(rhId)  : null;

        // Mantém fornecedor + gestor_projeto; descarta qualquer rh/financeiro/diretor
        // que o cliente tenha eventualmente enviado (garante injeção determinística).
        const fornecedores    = signatariosFinais.filter(s => s.papel === "fornecedor");
        const gestoresProjeto = signatariosFinais.filter(s => s.papel === "gestor_projeto");
        const testemunhas     = signatariosFinais.filter(s => s.papel === "testemunha");

        const diretor = {
          papel: "diretor" as const,
          ordemAssinatura: 0,
          nome: socioAdmin.nome,
          email: "",
          cpfCnpj: socioAdmin.cpfCnpj ?? undefined,
          cargo: "Sócio Administrador",
          empresaNome: "FC Engenharia",
        };

        // Gestores injetados server-side (só inclui se configurados)
        const gestoresInjetados: typeof signatariosFinais = [];
        if (rhId) {
          gestoresInjetados.push({
            papel: "rh" as any,
            ordemAssinatura: 0,
            nome: rhEmp?.nomeCompleto || subRh?.substitutoNome || (company as any)?.gestorRhNome || "Gestor RH",
            email: subRh?.substitutoEmail || rhEmp?.email || "",
            cpfCnpj: rhEmp?.cpf ?? undefined,
            cargo: "Gestor RH",
            empresaNome: "FC Engenharia",
          });
        }
        if (finId) {
          gestoresInjetados.push({
            papel: "financeiro" as any,
            ordemAssinatura: 0,
            nome: finEmp?.nomeCompleto || subFin?.substitutoNome || company?.gestorFinanceiroNome || "Gestor Financeiro",
            email: subFin?.substitutoEmail || finEmp?.email || "",
            cpfCnpj: finEmp?.cpf ?? undefined,
            cargo: "Gestor Financeiro",
            empresaNome: "FC Engenharia",
          });
        }

        // Ordem Rev. 4479: FORNECEDOR → RH → FINANCEIRO → GESTOR_PROJETO → testemunhas → DIRETOR (último)
        const reordenados = [...fornecedores, ...gestoresInjetados, ...gestoresProjeto, ...testemunhas, diretor];
        signatariosFinais.length = 0;
        signatariosFinais.push(...reordenados.map((s, i) => ({ ...s, ordemAssinatura: i + 1 })));
      }

      // Rev. 4849 — BOLETIM DE MEDIÇÃO: mesmo padrão dos contratos — o SÓCIO
      // ADMINISTRADOR é injetado server-side como assinatura FINAL (liberação
      // da medição), depois do fornecedor e de quem elaborou (gestor/auxiliar).
      // Descarta qualquer "diretor" que o cliente tenha enviado (determinístico).
      if (input.medicaoTerceiroId && !input.contratoTerceiroId) {
        const socioAdmin = await resolveSocioAdministradorSigner(db, input.companyId);
        const fornecedores    = signatariosFinais.filter(s => s.papel === "fornecedor");
        const gestoresProjeto = signatariosFinais.filter(s => s.papel === "gestor_projeto");
        const testemunhas     = signatariosFinais.filter(s => s.papel === "testemunha");
        const diretor = {
          papel: "diretor" as const,
          ordemAssinatura: 0,
          nome: socioAdmin.nome,
          email: "",
          cpfCnpj: socioAdmin.cpfCnpj ?? undefined,
          cargo: "Sócio Administrador",
          empresaNome: "FC Engenharia",
        };
        const reordenados = [...fornecedores, ...gestoresProjeto, ...testemunhas, diretor];
        signatariosFinais.length = 0;
        signatariosFinais.push(...reordenados.map((s, i) => ({ ...s, ordemAssinatura: i + 1 })));
      }

      // Rev. 4835 — Memória de Cálculo: valida que o levantamento pertence à
      // empresa do envelope (anti-IDOR) antes de vincular.
      if (input.medicaoCampoId) {
        const [campo] = await db.select({ id: medicaoCampo.id }).from(medicaoCampo)
          .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)));
        if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado nesta empresa." });
        // Rev. 4835 — política server-side (review): envelope de Memória de Cálculo
        // exige EXATAMENTE 2 signatários obrigatórios — elaborador (gestor_projeto)
        // e responsável pelo contrato (fornecedor). Sem isso, o gate de consolidação
        // poderia ser burlado com envelope de 1 assinatura só.
        const obrigatorios = (input.signatarios || []).filter((s: any) => s.papel !== "testemunha");
        const papeis = obrigatorios.map((s: any) => s.papel).sort();
        if (obrigatorios.length !== 2 || papeis[0] !== "fornecedor" || papeis[1] !== "gestor_projeto") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A Memória de Cálculo exige exatamente 2 signatários: o elaborador do levantamento (gestor de projeto) e o responsável pelo contrato (fornecedor)." });
        }
      }

      // Rev. 4793 — Boletim de Medição de terceiros: o documento é gerado
      // server-side a partir do banco (fiel aos dados no momento do envio).
      let textoDocumento = input.textoContrato ?? null;
      let tituloFinal = input.titulo;
      if (input.medicaoTerceiroId && !textoDocumento) {
        const { buildBoletimMedicaoHtml } = await import("../boletimMedicaoHtml");
        const boletim = await buildBoletimMedicaoHtml(db, input.medicaoTerceiroId, input.companyId);
        textoDocumento = boletim.html;
        if (!tituloFinal || tituloFinal === "auto") tituloFinal = boletim.titulo;
      }

      const [envelope] = await db.insert(integrasignEnvelopes).values({
        companyId: input.companyId,
        contratoTerceiroId: input.contratoTerceiroId ?? null,
        ordemCompraId: input.ordemCompraId ?? null,
        obraId: input.obraId ?? null,
        medicaoTerceiroId: input.medicaoTerceiroId ?? null,
        medicaoCampoId: input.medicaoCampoId ?? null,
        titulo: tituloFinal,
        descricao: input.descricao ?? null,
        textoContrato: textoDocumento,
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

  // Rev. 4835 — status da assinatura da Memória de Cálculo de um levantamento:
  // o botão "Consolidar" só libera depois de elaborador + responsável assinarem.
  getEnvelopeDoLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
      const db = await getDb();
      // Review Rev. 4835 — se existir envelope CONCLUÍDO, ele prevalece sobre um
      // rascunho mais recente (senão a UI bloquearia indevidamente a consolidação).
      const candidatos = await db.select().from(integrasignEnvelopes)
        .where(and(
          eq(integrasignEnvelopes.companyId, input.companyId),
          eq((integrasignEnvelopes as any).medicaoCampoId, input.medicaoCampoId),
          isNull(integrasignEnvelopes.excluidoEm),
          sql`${integrasignEnvelopes.status} NOT IN ('cancelado')`,
        )).orderBy(desc(integrasignEnvelopes.id));
      const env = candidatos.find((e: any) => e.status === "concluido") ?? candidatos[0];
      if (!env) return null;
      const signatarios = await db.select({
        id: integrasignSignatarios.id,
        papel: integrasignSignatarios.papel,
        nome: integrasignSignatarios.nome,
        status: integrasignSignatarios.status,
        dataAssinatura: integrasignSignatarios.dataAssinatura,
        // Rev. 4835 — assinatura NA TELA: o usuário com acesso à empresa pode abrir
        // a tela de assinatura direto (mesmo padrão do "copiar link" do dashboard).
        token: integrasignSignatarios.token,
        ordemAssinatura: integrasignSignatarios.ordemAssinatura,
        // Rev. 4844 — imagem da assinatura p/ exibir no campo de assinatura
        // da Memória de Cálculo (só sai preenchida quando já assinado).
        assinaturaImagem: integrasignSignatarios.assinaturaImagem,
      }).from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.envelopeId, env.id))
        .orderBy(asc(integrasignSignatarios.ordemAssinatura));
      return { id: env.id, status: env.status, titulo: env.titulo, dataConclusao: (env as any).dataConclusao, signatarios };
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

  // Rev. 4851 — pendências do usuário logado (consumido pelo pop-up global de
  // assinaturas): envelopes enviados/em andamento onde é a VEZ do usuário.
  // Match por e-mail (case-insensitive); o papel 'diretor' (sócio administrador,
  // criado sem e-mail) casa pelo role admin_master. Tenancy: intersecta com as
  // empresas do usuário (admin/admin_master são globais).
  pendingForCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const user = (ctx as any).user;
    if (!db || !user?.id) return [];
    const email = String(user.email || "").trim().toLowerCase();
    const isAdminLike = user.role === "admin" || user.role === "admin_master";
    if (!email && !isAdminLike) return [];
    const envs = await db.select().from(integrasignEnvelopes)
      .where(and(
        inArray(integrasignEnvelopes.status, ["enviado", "em_andamento"]),
        isNull(integrasignEnvelopes.excluidoEm),
      ));
    if (envs.length === 0) return [];
    // Review Rev. 4851 — FAIL-CLOSED: usuário comum sem vínculo de empresa não
    // vê NADA (tokens de assinatura são sensíveis; sem fallback permissivo).
    let allowed: Set<number> | null = null;
    if (!isAdminLike) {
      const links = await getUserCompanyLinks(user.id);
      allowed = new Set((links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number"));
      if (allowed.size === 0) return [];
    }
    const sigs = await db.select().from(integrasignSignatarios)
      .where(inArray(integrasignSignatarios.envelopeId, envs.map((e: any) => e.id)));
    const out: any[] = [];
    // Review Rev. 4851 — diretor casa por IDENTIDADE, não só por role: além de
    // admin_master, o sócio administrador RESOLVIDO da empresa precisa ser o
    // próprio usuário (comparação de nome normalizado com o signatário injetado).
    const norm = (v: any) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const socioCache = new Map<number, string>();
    const socioDaEmpresa = async (companyId: number) => {
      if (!socioCache.has(companyId)) {
        try {
          const socio = await resolveSocioAdministradorSigner(db, companyId);
          socioCache.set(companyId, norm(socio?.nome));
        } catch { socioCache.set(companyId, ""); }
      }
      return socioCache.get(companyId) || "";
    };
    const userNome = norm((user as any).name || (user as any).nome);
    for (const env of envs) {
      if (allowed && !allowed.has(env.companyId)) continue;
      const doEnv = sigs.filter((s: any) => s.envelopeId === env.id)
        .sort((a: any, b: any) => a.ordemAssinatura - b.ordemAssinatura);
      for (const s of doEnv) {
        if (s.status === "assinado" || s.status === "recusado" || s.papel === "testemunha") continue;
        let meu = !!email && String(s.email || "").trim().toLowerCase() === email;
        if (!meu && user.role === "admin_master" && s.papel === "diretor" && userNome) {
          const socioNome = await socioDaEmpresa(env.companyId);
          meu = !!socioNome && (socioNome === norm(s.nome)) && (socioNome === userNome || norm(s.nome) === userNome);
        }
        if (!meu) continue;
        // Só quando for a vez dele: obrigatórios de ordem menor todos assinados
        const bloqueado = doEnv.some((p: any) => p.papel !== "testemunha" && p.ordemAssinatura < s.ordemAssinatura && p.status !== "assinado");
        if (bloqueado) continue;
        out.push({
          envelopeId: env.id,
          companyId: env.companyId,
          signatarioId: s.id,
          token: s.token,
          ordem: s.ordemAssinatura,
          titulo: env.titulo,
        });
      }
    }
    return out;
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

        if (input.enviarEmail !== false && sig.email) {
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
          cargo: integrasignSignatarios.cargo,
          cpfCnpj: integrasignSignatarios.cpfCnpj,
          status: integrasignSignatarios.status,
          ordemAssinatura: integrasignSignatarios.ordemAssinatura,
          dataAssinatura: integrasignSignatarios.dataAssinatura,
          assinaturaImagem: integrasignSignatarios.assinaturaImagem,
          rubricaImagem: integrasignSignatarios.rubricaImagem,
          hashAssinatura: integrasignSignatarios.hashAssinatura,
          hashRubrica: integrasignSignatarios.hashRubrica,
          ipAddress: integrasignSignatarios.ipAddress,
          latitude: integrasignSignatarios.latitude,
          longitude: integrasignSignatarios.longitude,
          geoAccuracy: integrasignSignatarios.geoAccuracy,
          dispositivoInfo: integrasignSignatarios.dispositivoInfo,
          nomeConfirmado: integrasignSignatarios.nomeConfirmado,
          cpfCnpjConfirmado: integrasignSignatarios.cpfCnpjConfirmado,
          termoAceito: integrasignSignatarios.termoAceito,
          dataVisualizacao: integrasignSignatarios.dataVisualizacao,
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
        cargo: integrasignSignatarios.cargo,
        cpfCnpj: integrasignSignatarios.cpfCnpj,
        status: integrasignSignatarios.status,
        ordemAssinatura: integrasignSignatarios.ordemAssinatura,
        dataAssinatura: integrasignSignatarios.dataAssinatura,
        assinaturaImagem: integrasignSignatarios.assinaturaImagem,
        rubricaImagem: integrasignSignatarios.rubricaImagem,
        hashAssinatura: integrasignSignatarios.hashAssinatura,
        hashRubrica: integrasignSignatarios.hashRubrica,
        ipAddress: integrasignSignatarios.ipAddress,
        latitude: integrasignSignatarios.latitude,
        longitude: integrasignSignatarios.longitude,
        geoAccuracy: integrasignSignatarios.geoAccuracy,
        dispositivoInfo: integrasignSignatarios.dispositivoInfo,
        nomeConfirmado: integrasignSignatarios.nomeConfirmado,
        cpfCnpjConfirmado: integrasignSignatarios.cpfCnpjConfirmado,
        termoAceito: integrasignSignatarios.termoAceito,
        dataVisualizacao: integrasignSignatarios.dataVisualizacao,
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
        // Rev. 4854 — boletim de medição tem PDF completo (planilha + levantamento)
        temBoletimPdf: !!(envelope as any).medicaoTerceiroId,
        termoLegal: `Ao assinar este documento, declaro que li e concordo com todos os termos do contrato acima. Esta assinatura eletrônica tem validade jurídica nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020. A assinatura será registrada com data/hora, endereço IP, geolocalização e hash criptográfico SHA-256 para fins de autenticidade e integridade.`,
      };
    }),

  // Rev. 4855 — BIBLIOTECA CONSULTIVA DE ASSINADOS: catálogo automático de TUDO
  // que foi assinado no sistema, separado por setor e pasta. Cada fonte é
  // resiliente (try/catch) — uma tabela ausente não derruba o catálogo.
  bibliotecaAssinados: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
      const cid = input.companyId;
      type Item = {
        setor: string; pasta: string; titulo: string; data: string | null;
        pessoas: string[]; url: string | null; envelopeId?: number; origem: string;
      };
      const items: Item[] = [];
      const empIds = new Set<number>();
      const empName = new Map<number, string>();

      // 1) IntegraSign — envelopes concluídos (Terceiros/Planejamento/Compras)
      try {
        const envs = await db.select().from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.companyId, cid),
            eq(integrasignEnvelopes.status, "concluido"),
            isNull(integrasignEnvelopes.excluidoEm),
          ));
        const envIds = envs.map((e: any) => e.id);
        const sigs = envIds.length
          ? await db.select({
              envelopeId: integrasignSignatarios.envelopeId,
              nome: integrasignSignatarios.nome,
              status: integrasignSignatarios.status,
            }).from(integrasignSignatarios)
            .where(inArray(integrasignSignatarios.envelopeId, envIds))
          : [];
        for (const e of envs as any[]) {
          const pessoas = sigs.filter((s: any) => s.envelopeId === e.id && s.status === "assinado").map((s: any) => s.nome);
          let setor = "Terceiros & Medições"; let pasta = "Outros Documentos";
          if (e.medicaoTerceiroId) pasta = "Boletins de Medição";
          else if (e.medicaoCampoId) { setor = "Planejamento"; pasta = "Memórias de Cálculo"; }
          else if (e.ordemCompraId) { setor = "Compras"; pasta = "Ordens de Compra"; }
          else if (e.contratoTerceiroId) pasta = "Contratos de Serviço";
          items.push({ setor, pasta, titulo: e.titulo, data: e.dataConclusao || e.atualizadoEm || e.criadoEm, pessoas, url: null, envelopeId: e.id, origem: "IntegraSign" });
        }
      } catch (err: any) { console.error("[Biblioteca] envelopes:", err?.message); }

      // 2) FCSign legado — sessões completas (RH & DP)
      try {
        const sess = await db.select().from(signatureSessions)
          .where(and(eq(signatureSessions.companyId, cid), eq(signatureSessions.status, "completo")));
        const sIds = sess.map((s: any) => s.id);
        const signers = sIds.length
          ? await db.select({ sessionId: signatureSigners.sessionId, nome: signatureSigners.nome, signedAt: signatureSigners.signedAt })
              .from(signatureSigners).where(inArray(signatureSigners.sessionId, sIds))
          : [];
        const tipoLbl: Record<string, string> = {
          contrato_experiencia: "Contratos de Experiência", contract_experiencia: "Contratos de Experiência",
          comunicado: "Comunicados", epi: "EPI", pt: "Permissões de Trabalho", outros: "Outros Documentos",
        };
        for (const s of sess as any[]) {
          items.push({
            setor: "RH & DP", pasta: tipoLbl[s.tipo] || "Outros Documentos",
            titulo: s.documentTitle, data: s.completedAt || s.createdAt,
            pessoas: signers.filter((g: any) => g.sessionId === s.id && g.signedAt).map((g: any) => g.nome),
            url: s.finalDocumentUrl || null, origem: "FCSign",
          });
        }
      } catch (err: any) { console.error("[Biblioteca] sessions:", err?.message); }

      // 3) Documentos do Colaborador assinados (RH & DP)
      try {
        const docs = await db.select().from(rhDocumentos)
          .where(and(eq(rhDocumentos.companyId, cid), eq(rhDocumentos.status, "assinado")));
        for (const d of docs as any[]) {
          empIds.add(d.employeeId);
          items.push({
            setor: "RH & DP", pasta: "Documentos do Colaborador",
            titulo: d.titulo, data: d.assinadoEm, pessoas: [`__emp:${d.employeeId}`],
            url: `/api/download/rh-documento-pdf?id=${d.id}`, origem: "RH Docs",
          });
        }
      } catch (err: any) { console.error("[Biblioteca] rhDocumentos:", err?.message); }

      // 4) EPI — entregas assinadas
      try {
        const dels = await db.select({
          id: epiDeliveries.id, employeeId: epiDeliveries.employeeId,
          dataEntrega: epiDeliveries.dataEntrega, fichaUrl: epiDeliveries.fichaUrl,
          assinaturaUrl: epiDeliveries.assinaturaUrl,
        }).from(epiDeliveries)
          .where(and(eq(epiDeliveries.companyId, cid), sql`${epiDeliveries.assinaturaUrl} IS NOT NULL`));
        for (const d of dels as any[]) {
          empIds.add(d.employeeId);
          items.push({
            setor: "EPI", pasta: "Fichas de Entrega de EPI",
            titulo: `Entrega de EPI — ${d.dataEntrega?.split("-").reverse().join("/") || ""}`,
            data: d.dataEntrega, pessoas: [`__emp:${d.employeeId}`],
            url: d.fichaUrl || null, origem: "EPI",
          });
        }
      } catch (err: any) { console.error("[Biblioteca] epiDeliveries:", err?.message); }

      // 5) SST — Ordens de Serviço assinadas
      try {
        const oss = await db.select({
          employeeId: epiAssinaturas.employeeId, assinadoEm: epiAssinaturas.assinadoEm,
        }).from(epiAssinaturas)
          .where(and(eq(epiAssinaturas.companyId, cid), eq(epiAssinaturas.tipo, "ordem_servico")));
        for (const o of oss as any[]) {
          empIds.add(o.employeeId);
          items.push({
            setor: "Segurança do Trabalho", pasta: "Ordens de Serviço",
            titulo: "Ordem de Serviço (NR-1)", data: o.assinadoEm, pessoas: [`__emp:${o.employeeId}`],
            url: `/api/download/ordem-servico-pdf?companyId=${cid}&employeeId=${o.employeeId}`, origem: "SST",
          });
        }
      } catch (err: any) { console.error("[Biblioteca] ordemServico:", err?.message); }

      // 6) SST — Permissões de Trabalho com assinaturas colhidas
      try {
        const assins = await db.select({ ptId: ptAssinaturas.ptId, nomeManual: ptAssinaturas.nomeManual, employeeId: ptAssinaturas.employeeId, assinadoEm: ptAssinaturas.assinadoEm })
          .from(ptAssinaturas)
          .where(and(eq(ptAssinaturas.companyId, cid), sql`${ptAssinaturas.assinadoEm} IS NOT NULL`));
        const ptIds = Array.from(new Set(assins.map((a: any) => a.ptId)));
        const pts = ptIds.length
          ? await db.select({ id: ptPermissoes.id, numero: ptPermissoes.numero, dataEmissao: ptPermissoes.dataEmissao })
              .from(ptPermissoes).where(and(eq(ptPermissoes.companyId, cid), inArray(ptPermissoes.id, ptIds)))
          : [];
        for (const pt of pts as any[]) {
          const doPt = assins.filter((a: any) => a.ptId === pt.id);
          doPt.forEach((a: any) => { if (a.employeeId) empIds.add(a.employeeId); });
          items.push({
            setor: "Segurança do Trabalho", pasta: "Permissões de Trabalho (PT)",
            titulo: `PT ${pt.numero}`, data: doPt[0]?.assinadoEm || pt.dataEmissao || null,
            pessoas: doPt.map((a: any) => a.nomeManual || (a.employeeId ? `__emp:${a.employeeId}` : "")).filter(Boolean),
            url: null, origem: "SST",
          });
        }
      } catch (err: any) { console.error("[Biblioteca] PT:", err?.message); }

      // 7) Comunicados Internos com assinaturas de ciência
      try {
        const assins = await db.select({ comunicadoId: comunicadoAssinaturas.comunicadoId, employeeId: comunicadoAssinaturas.employeeId, assinadoEm: comunicadoAssinaturas.assinadoEm })
          .from(comunicadoAssinaturas).where(eq(comunicadoAssinaturas.companyId, cid));
        const cIds = Array.from(new Set(assins.map((a: any) => a.comunicadoId)));
        const coms = cIds.length
          ? await db.select({ id: comunicadosInternos.id, numero: comunicadosInternos.numero, titulo: comunicadosInternos.titulo, documentoUrl: comunicadosInternos.documentoUrl, dataEmissao: comunicadosInternos.dataEmissao })
              .from(comunicadosInternos).where(and(eq(comunicadosInternos.companyId, cid), inArray(comunicadosInternos.id, cIds)))
          : [];
        for (const c of coms as any[]) {
          const doCom = assins.filter((a: any) => a.comunicadoId === c.id);
          doCom.forEach((a: any) => empIds.add(a.employeeId));
          items.push({
            setor: "RH & DP", pasta: "Comunicados Internos",
            titulo: `${c.numero} — ${c.titulo}`, data: doCom[0]?.assinadoEm || c.dataEmissao,
            pessoas: doCom.map((a: any) => `__emp:${a.employeeId}`),
            url: c.documentoUrl || null, origem: "Comunicados",
          });
        }
      } catch (err: any) { console.error("[Biblioteca] comunicados:", err?.message); }

      // Resolve nomes de funcionários (regra de ouro: nome, nunca #ID)
      try {
        if (empIds.size) {
          const emps = await db.select({ id: employees.id, nome: employees.nomeCompleto })
            .from(employees).where(inArray(employees.id, Array.from(empIds)));
          for (const e of emps as any[]) empName.set(e.id, e.nome);
        }
      } catch {}
      for (const it of items) {
        it.pessoas = it.pessoas.map((p) => p.startsWith("__emp:")
          ? (empName.get(Number(p.slice(6))) || "Funcionário")
          : p);
      }

      items.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
      return items;
    }),

  // Rev. 4854 — DOCUMENTO COMPLETO PARA O ASSINANTE: o mesmo PDF do boletim
  // (planilha + retenções + levantamento de campo com fotos) acessível pelo
  // token público do signatário, para conferência antes de assinar.
  gerarBoletimPdfPublico: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [signatario] = await db.select().from(integrasignSignatarios)
        .where(eq(integrasignSignatarios.token, input.token));
      if (!signatario) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido" });
      // Rev. 4854 — mesmas regras do getDocumentoPublico (review): expiração e
      // estados terminais bloqueiam também o PDF, não só a tela de assinatura.
      if (new Date(signatario.tokenExpiraEm) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Link expirado." });
      }
      if (signatario.status === "recusado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Documento recusado." });
      }
      const [envelope] = await db.select().from(integrasignEnvelopes)
        .where(and(eq(integrasignEnvelopes.id, signatario.envelopeId), isNull(integrasignEnvelopes.excluidoEm)));
      if (!envelope || !(envelope as any).medicaoTerceiroId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Este documento não tem boletim em PDF" });
      }
      if (["cancelado", "expirado", "recusado"].includes(envelope.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envelope indisponível." });
      }
      // Import dinâmico para evitar ciclo de módulos integrasign ↔ terceiroContratos
      const { gerarPdfMedicaoBuffer } = await import("./terceiroContratos");
      return await gerarPdfMedicaoBuffer(db, {
        medicaoId: (envelope as any).medicaoTerceiroId,
        companyId: envelope.companyId,
      });
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

        // Rev. 4850 — BOLETIM DE MEDIÇÃO: a assinatura final (sócio administrador)
        // aprova a medição automaticamente e garante o título no Contas a Pagar.
        // Falha aqui NÃO desfaz a assinatura: loga + alerta o criador do envelope
        // para aprovar manualmente.
        if ((envelope as any).medicaoTerceiroId) {
          try {
            const { aprovarMedicaoPorAssinatura } = await import("./terceiroContratos");
            await aprovarMedicaoPorAssinatura(envelope.companyId, (envelope as any).medicaoTerceiroId, signatario.nome || "FCSign", envelope.criadoPorId ?? null);
          } catch (e: any) {
            console.error(`[IntegraSign] pós-conclusão do boletim (medição #${(envelope as any).medicaoTerceiroId}):`, e?.message || e);
            try {
              const { criarUserAlert } = await import("../db");
              if (envelope.criadoPorId) {
                await criarUserAlert({
                  userId: envelope.criadoPorId,
                  companyId: envelope.companyId,
                  tipo: "erro",
                  titulo: "Boletim assinado, mas a medição não foi aprovada automaticamente",
                  mensagem: `Medição #${(envelope as any).medicaoTerceiroId}: ${e?.message || e}. Aprove manualmente na tela do contrato para liberar o pagamento.`,
                });
              }
            } catch { /* alerta é melhor-esforço */ }
          }
        }

        await logAudit(db, {
          companyId: envelope.companyId,
          envelopeId: envelope.id,
          acao: "envelope_concluido",
          detalhes: `Todas as ${envelope.totalSignatariosObrigatorios} assinaturas obrigatórias foram realizadas. Contrato ativado.`,
        });

        // Rev. 4851 — signatário sem e-mail (assina por link/pop-up) fica fora do disparo
        const allEmails = todosSignatarios.filter((s: any) => s.email).map((s: any) => ({ email: s.email, nome: s.nome }));
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

          if (proximo.email) enviarNotificacaoProximoSignatario({
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
      // Rev. 4854 — tenancy guard (review): rotaciona token — precisa validar acesso.
      await assertIntegraSignCompanyAccess((ctx as any).user, input.companyId);
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

      if (signatario.email) enviarLembrete({
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
