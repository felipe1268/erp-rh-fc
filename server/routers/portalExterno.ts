import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export const portalExternoRouter = router({
  // ========== AUTH ==========
  auth: router({
    login: publicProcedure.input(z.object({
      cnpj: z.string(),
      senha: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { portalCredentials } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      const [cred] = await db.select().from(portalCredentials).where(
        and(eq(portalCredentials.cnpj, cnpjClean), eq(portalCredentials.ativo, 1))
      );
      if (!cred) throw new TRPCError({ code: "UNAUTHORIZED", message: "CNPJ não encontrado ou acesso inativo" });
      const valid = await bcrypt.compare(input.senha, cred.senhaHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });
      // Update ultimo login
      await db.update(portalCredentials).set({
        ultimoLogin: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).where(eq(portalCredentials.id, cred.id));
      // Generate JWT token
      const secret = process.env.JWT_SECRET || "portal-secret";
      const token = jwt.sign({
        portalId: cred.id,
        tipo: cred.tipo,
        cnpj: cnpjClean,
        companyId: cred.companyId,
        empresaTerceiraId: cred.empresaTerceiraId,
        parceiroId: cred.parceiroId,
        nomeEmpresa: cred.nomeEmpresa,
      }, secret, { expiresIn: "24h" });
      return {
        token,
        primeiroAcesso: cred.primeiroAcesso === 1,
        tipo: cred.tipo,
        nomeEmpresa: cred.nomeEmpresa,
        cnpj: cnpjClean,
      };
    }),

    trocarSenha: publicProcedure.input(z.object({
      cnpj: z.string(),
      senhaAtual: z.string(),
      novaSenha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { portalCredentials } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      const [cred] = await db.select().from(portalCredentials).where(
        and(eq(portalCredentials.cnpj, cnpjClean), eq(portalCredentials.ativo, 1))
      );
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Credencial não encontrada" });
      const valid = await bcrypt.compare(input.senhaAtual, cred.senhaHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta" });
      const novaSenhaHash = await bcrypt.hash(input.novaSenha, 10);
      await db.update(portalCredentials).set({
        senhaHash: novaSenhaHash,
        primeiroAcesso: 0,
      }).where(eq(portalCredentials.id, cred.id));
      return { success: true };
    }),

    verificarToken: publicProcedure.input(z.object({ token: z.string() })).query(({ input }) => {
      try {
        const secret = process.env.JWT_SECRET || "portal-secret";
        const decoded = jwt.verify(input.token, secret) as any;
        return { valid: true, data: decoded };
      } catch {
        return { valid: false, data: null };
      }
    }),
  }),

  // ========== PORTAL DO TERCEIRO ==========
  terceiro: router({
    meusDados: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { empresasTerceiras } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [emp] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, decoded.empresaTerceiraId));
      return emp || null;
    }),

    meusFuncionarios: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { funcionariosTerceiros } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const funcs = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.empresaTerceiraId, decoded.empresaTerceiraId));
      return funcs;
    }),

    cadastrarFuncionario: publicProcedure.input(z.object({
      token: z.string(),
      nomeCompleto: z.string(),
      cpf: z.string(),
      rg: z.string().optional(),
      funcao: z.string().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      dataAdmissao: z.string().optional(),
      asoValidade: z.string().optional(),
      asoDocUrl: z.string().optional(),
      nr35Validade: z.string().optional(),
      nr35DocUrl: z.string().optional(),
      nr10Validade: z.string().optional(),
      nr10DocUrl: z.string().optional(),
      nr33Validade: z.string().optional(),
      nr33DocUrl: z.string().optional(),
      integracaoDocUrl: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { funcionariosTerceiros } = await import("../../drizzle/schema");
      const { token, ...data } = input;
      const [result] = await db.insert(funcionariosTerceiros).values({
        ...data,
        empresaTerceiraId: decoded.empresaTerceiraId,
        companyId: decoded.companyId,
        status: "pendente",
        cadastradoPor: "portal",
      });
      return { id: result.insertId, success: true };
    }),

    atualizarFuncionario: publicProcedure.input(z.object({
      token: z.string(),
      id: z.number(),
      nomeCompleto: z.string().optional(),
      cpf: z.string().optional(),
      rg: z.string().optional(),
      funcao: z.string().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      asoValidade: z.string().optional(),
      asoDocUrl: z.string().optional(),
      nr35Validade: z.string().optional(),
      nr35DocUrl: z.string().optional(),
      nr10Validade: z.string().optional(),
      nr10DocUrl: z.string().optional(),
      nr33Validade: z.string().optional(),
      nr33DocUrl: z.string().optional(),
      integracaoDocUrl: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { funcionariosTerceiros } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { token, id, ...data } = input;
      await db.update(funcionariosTerceiros).set(data).where(
        and(eq(funcionariosTerceiros.id, id), eq(funcionariosTerceiros.empresaTerceiraId, decoded.empresaTerceiraId))
      );
      return { success: true };
    }),

    uploadDocumento: publicProcedure.input(z.object({
      token: z.string(),
      funcionarioId: z.number(),
      tipoDocumento: z.string(),
      base64: z.string(),
      fileName: z.string(),
      contentType: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { storagePut } = await import("../storage");
      const buffer = Buffer.from(input.base64, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const key = `portal-terceiro/${decoded.empresaTerceiraId}/${input.funcionarioId}/${input.tipoDocumento}-${suffix}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType || "application/pdf");
      return { url, key };
    }),
  }),

  // ========== ADMIN (FC RH) ==========
  admin: router({
    gerarAcesso: protectedProcedure.input(z.object({
      tipo: z.enum(["terceiro", "parceiro"]),
      empresaTerceiraId: z.number().optional(),
      parceiroId: z.number().optional(),
      companyId: z.number(),
      cnpj: z.string(),
      emailResponsavel: z.string().optional(),
      nomeResponsavel: z.string().optional(),
      nomeEmpresa: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { portalCredentials } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      // Check if already exists
      const existing = await db.select().from(portalCredentials).where(
        and(eq(portalCredentials.cnpj, cnpjClean), eq(portalCredentials.tipo, input.tipo))
      );
      const senhaTemp = generateTempPassword();
      const senhaHash = await bcrypt.hash(senhaTemp, 10);
      if (existing.length > 0) {
        // Update existing credential with new password
        await db.update(portalCredentials).set({
          senhaHash,
          primeiroAcesso: 1,
          ativo: 1,
          emailResponsavel: input.emailResponsavel || existing[0].emailResponsavel,
          nomeResponsavel: input.nomeResponsavel || existing[0].nomeResponsavel,
          nomeEmpresa: input.nomeEmpresa || existing[0].nomeEmpresa,
        }).where(eq(portalCredentials.id, existing[0].id));
      } else {
        await db.insert(portalCredentials).values({
          tipo: input.tipo,
          empresaTerceiraId: input.empresaTerceiraId || null,
          parceiroId: input.parceiroId || null,
          companyId: input.companyId,
          cnpj: cnpjClean,
          senhaHash,
          nomeEmpresa: input.nomeEmpresa || null,
          emailResponsavel: input.emailResponsavel || null,
          nomeResponsavel: input.nomeResponsavel || null,
          primeiroAcesso: 1,
          ativo: 1,
        });
      }
      return { senhaTemporaria: senhaTemp, cnpj: cnpjClean, nomeEmpresa: input.nomeEmpresa || "" };
    }),

    listarAcessos: protectedProcedure.input(z.object({
      companyId: z.number(),
      tipo: z.enum(["terceiro", "parceiro"]).optional(),
    })).query(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { portalCredentials } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      let conditions: any[] = [eq(portalCredentials.companyId, input.companyId)];
      if (input.tipo) conditions.push(eq(portalCredentials.tipo, input.tipo));
      const creds = await db.select().from(portalCredentials).where(and(...conditions));
      return creds.map((c: any) => ({ ...c, senhaHash: undefined }));
    }),

    desativarAcesso: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { portalCredentials } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(portalCredentials).set({ ativo: 0 }).where(eq(portalCredentials.id, input.id));
      return { success: true };
    }),

    // Approve/reject funcionario from portal
    aprovarFuncionario: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["apto", "inapto", "pendente"]),
      observacao: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (ctx as any).db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { funcionariosTerceiros } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(funcionariosTerceiros).set({
        status: input.status,
        observacaoAprovacao: input.observacao || null,
        aprovadoPor: ctx.user.name ?? "RH",
        dataAprovacao: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).where(eq(funcionariosTerceiros.id, input.id));
      return { success: true };
    }),
  }),
});
