import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { signatureSessions, signatureSigners, employees, companies, employeeDocuments } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { randomBytes, createHash } from "crypto";

function sha256(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function genToken() {
  return randomBytes(32).toString("hex");
}

function renderFinalHtml(documentHtml: string, signers: Array<{ role: string; nome: string; cpf: string | null; signedAt: string | null; signatureDataUrl: string | null; ip: string | null; signatureHash: string | null }>) {
  const roleLabel: Record<string, string> = {
    empregado: "EMPREGADO(A)",
    empregador: "EMPREGADOR (FC Engenharia)",
    testemunha_1: "Testemunha 1",
    testemunha_2: "Testemunha 2",
  };
  const sigsHtml = signers.map((s) => {
    const dt = s.signedAt ? new Date(s.signedAt).toLocaleString("pt-BR") : "—";
    return `<div style="border:1px solid #ccc;border-radius:4px;padding:12px;margin-bottom:12px;page-break-inside:avoid">
  <div style="font-size:10pt;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${roleLabel[s.role] || s.role}</div>
  <div style="font-weight:bold;font-size:11pt">${s.nome}</div>
  ${s.cpf ? `<div style="font-size:9pt;color:#555">CPF: ${s.cpf}</div>` : ""}
  ${s.signatureDataUrl ? `<img src="${s.signatureDataUrl}" alt="Assinatura" style="max-height:80px;margin-top:6px;display:block" />` : `<div style="color:#a00;font-style:italic">Não assinado</div>`}
  <div style="font-size:8pt;color:#888;margin-top:6px">
    Assinado em: ${dt}${s.ip ? ` · IP: ${s.ip}` : ""}${s.signatureHash ? `<br/>Hash: ${s.signatureHash.substring(0, 32)}…` : ""}
  </div>
</div>`;
  }).join("\n");

  const footer = `<div style="margin-top:40px;border-top:2px solid #1B2A4A;padding-top:16px;page-break-before:auto">
  <h3 style="color:#1B2A4A;margin:0 0 12px 0;font-size:13pt;text-transform:uppercase;letter-spacing:1px">Assinaturas Digitais — FCSign</h3>
  <p style="font-size:9pt;color:#666;margin-bottom:16px">Documento assinado eletronicamente nos termos da Medida Provisória 2.200-2/2001.</p>
  ${sigsHtml}
</div>`;

  if (documentHtml.includes("</body>")) {
    return documentHtml.replace("</body>", footer + "</body>");
  }
  return documentHtml + footer;
}

export const signaturesRouter = router({
  // Criar sessao de assinatura (chamada do contrato)
  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: z.string().min(1).max(50),
      documentTitle: z.string().min(1).max(255),
      documentHtml: z.string().min(1),
      signers: z.array(z.object({
        role: z.enum(["empregado", "empregador", "testemunha_1", "testemunha_2"]),
        nome: z.string().min(1).max(255),
        cpf: z.string().max(20).optional().nullable(),
        email: z.string().max(255).optional().nullable(),
      })).min(1).max(10),
      observacoes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // ACL: garante que o funcionário pertence à empresa informada (evita cross-company)
      const [emp] = await db.select({ id: employees.id, companyId: employees.companyId }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      if (Number(emp.companyId) !== Number(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Colaborador não pertence a esta empresa." });
      }
      // Hardening contra XSS armazenado: rejeita HTML com scripts/handlers (defense-in-depth)
      if (/<\s*script\b/i.test(input.documentHtml) || /\son\w+\s*=/i.test(input.documentHtml) || /javascript:/i.test(input.documentHtml)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Documento contém conteúdo não permitido (script/handler/javascript:)." });
      }
      const hash = sha256(input.documentHtml);
      const [session] = await db.insert(signatureSessions).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        tipo: input.tipo,
        documentTitle: input.documentTitle,
        documentHtml: input.documentHtml,
        documentHash: hash,
        status: "em_andamento",
        createdByUserId: ctx.user.id,
        createdByName: ctx.user.name ?? "Sistema",
        observacoes: input.observacoes || null,
      }).returning();

      const signersToInsert = input.signers.map((s, i) => ({
        sessionId: session.id,
        role: s.role,
        ordem: i + 1,
        nome: s.nome,
        cpf: s.cpf || null,
        email: s.email || null,
        token: genToken(),
      }));
      const createdSigners = await db.insert(signatureSigners).values(signersToInsert).returning();

      return {
        sessionId: session.id,
        documentHash: hash,
        signers: createdSigners.map((s) => ({
          id: s.id,
          role: s.role,
          nome: s.nome,
          token: s.token,
          link: `/assinar/${s.token}`,
        })),
      };
    }),

  // PUBLICO: signatario abre o link e busca os dados
  getByToken: publicProcedure
    .input(z.object({ token: z.string().length(64) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [signer] = await db.select().from(signatureSigners).where(eq(signatureSigners.token, input.token)).limit(1);
      if (!signer) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido ou expirado." });
      const [session] = await db.select().from(signatureSessions).where(eq(signatureSessions.id, signer.sessionId)).limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, session.employeeId)).limit(1);
      const [comp] = await db.select({ razaoSocial: companies.razaoSocial, cnpj: companies.cnpj }).from(companies).where(eq(companies.id, session.companyId)).limit(1);
      const allSigners = await db.select({
        id: signatureSigners.id, role: signatureSigners.role, nome: signatureSigners.nome, signedAt: signatureSigners.signedAt,
      }).from(signatureSigners).where(eq(signatureSigners.sessionId, session.id));
      return {
        signer: {
          id: signer.id, role: signer.role, nome: signer.nome, cpf: signer.cpf,
          signedAt: signer.signedAt, signatureDataUrl: signer.signatureDataUrl,
        },
        session: {
          id: session.id, tipo: session.tipo, documentTitle: session.documentTitle,
          documentHtml: session.documentHtml, status: session.status, createdAt: session.createdAt,
          completedAt: session.completedAt,
        },
        employee: emp ?? null,
        company: comp ?? null,
        allSigners,
      };
    }),

  // PUBLICO: signatario envia a assinatura
  sign: publicProcedure
    .input(z.object({
      token: z.string().length(64),
      signatureDataUrl: z.string().regex(/^data:image\/(png|jpeg);base64,/),
      userAgent: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [signer] = await db.select().from(signatureSigners).where(eq(signatureSigners.token, input.token)).limit(1);
      if (!signer) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido." });
      if (signer.signedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento já foi assinado por você." });

      const [session] = await db.select().from(signatureSessions).where(eq(signatureSessions.id, signer.sessionId)).limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      if (session.status === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta solicitação foi cancelada." });
      if (session.status === "completo") throw new TRPCError({ code: "BAD_REQUEST", message: "Documento já está completo." });

      // Captura IP do request (Express)
      const req = (ctx as any).req;
      const ip = (req?.headers?.["x-forwarded-for"]?.toString().split(",")[0].trim()) || req?.socket?.remoteAddress || req?.ip || null;

      const sigHash = sha256(input.signatureDataUrl);
      const nowIso = new Date().toISOString();
      // UPDATE condicional: só assina se ainda não estiver assinado (atômico) — previne race em retries duplos
      const updated = await db.update(signatureSigners).set({
        signedAt: nowIso,
        signatureDataUrl: input.signatureDataUrl,
        signatureHash: sigHash,
        ip,
        userAgent: input.userAgent || req?.headers?.["user-agent"] || null,
      }).where(and(eq(signatureSigners.id, signer.id), sql`${signatureSigners.signedAt} IS NULL`)).returning({ id: signatureSigners.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento já foi assinado por você." });
      }

      // Checa se todos ja assinaram
      const allSigners = await db.select().from(signatureSigners).where(eq(signatureSigners.sessionId, session.id));
      const allSigned = allSigners.every((s) => s.signedAt);

      if (allSigned) {
        // Idempotência: tenta marcar a sessão como "em finalização" atômico — se já estiver completo, outro request finalizou
        const claim = await db.update(signatureSessions).set({
          status: "completo",
          completedAt: nowIso,
        }).where(and(eq(signatureSessions.id, session.id), sql`${signatureSessions.status} <> 'completo'`)).returning({ id: signatureSessions.id });
        if (claim.length > 0) {
          const finalHtml = renderFinalHtml(session.documentHtml, allSigners.map((s) => ({
            role: s.role, nome: s.nome, cpf: s.cpf, signedAt: s.signedAt,
            signatureDataUrl: s.signatureDataUrl, ip: s.ip, signatureHash: s.signatureHash,
          })));

          const buf = Buffer.from(finalHtml, "utf-8");
          const fileKey = `fcsign/${session.companyId}/${session.employeeId}/sessao-${session.id}-assinado.html`;
          const { url } = await storagePut(fileKey, buf, "text/html");

          // Anexa ao RAIO-X (employeeDocuments)
          const [doc] = await db.insert(employeeDocuments).values({
            companyId: session.companyId,
            employeeId: session.employeeId,
            tipo: "contrato_trabalho",
            nome: `${session.documentTitle} (assinado)`,
            descricao: `FCSign #${session.id} · ${allSigners.length} assinaturas · hash ${session.documentHash.substring(0, 16)}…`,
            fileUrl: url,
            fileKey,
            mimeType: "text/html",
            fileSize: buf.length,
            uploadPor: "FCSign",
            uploadPorUserId: session.createdByUserId,
          }).returning();

          await db.update(signatureSessions).set({
            finalDocumentUrl: url,
            finalEmployeeDocumentId: doc.id,
          }).where(eq(signatureSessions.id, session.id));
        }
      }

      return { success: true, allSigned };
    }),

  // Listar sessoes de um colaborador
  listByEmployee: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const sessions = await db.select().from(signatureSessions)
        .where(and(
          companyFilter(signatureSessions.companyId, input),
          eq(signatureSessions.employeeId, input.employeeId),
        ))
        .orderBy(desc(signatureSessions.createdAt));
      if (sessions.length === 0) return [];
      const sessionIds = sessions.map((s) => s.id);
      const allSigners = await db.select().from(signatureSigners)
        .where(sql`${signatureSigners.sessionId} = ANY(${sessionIds})`);
      return sessions.map((s) => ({
        ...s,
        signers: allSigners.filter((sg) => sg.sessionId === s.id).map((sg) => ({
          id: sg.id, role: sg.role, nome: sg.nome, cpf: sg.cpf,
          signedAt: sg.signedAt, token: sg.token,
        })),
      }));
    }),

  // Cancelar sessao
  cancel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(signatureSessions).set({
        status: "cancelado",
        cancelledAt: new Date().toISOString(),
      }).where(and(
        companyFilter(signatureSessions.companyId, input),
        eq(signatureSessions.id, input.id),
      ));
      return { success: true };
    }),
});
