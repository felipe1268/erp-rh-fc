import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db";
import { portalCredentials, funcionariosTerceiros, empresasTerceiras, parceirosConveniados, lancamentosParceiros, employees, employeeAptidao, companies, clientes, obras, clienteComentarios, clienteAvaliacoes, portalPasswordResets } from "../../drizzle/schema";
import { eq, and, or, inArray, desc, sql, isNull, ilike } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";
import { sendEmail } from "../services/smtpService";
import crypto from "crypto";

function getPortalBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL || "");
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export const portalExternoRouter = router({
  // ========== AUTH ==========
  auth: router({
    login: publicProcedure.input(z.object({
      cnpj: z.string(),
      senha: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
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
        clienteId: (cred as any).clienteId,
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
      const db = (await getDb())!;
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

    // ========== ESQUECI MINHA SENHA — todos os tipos ==========
    solicitarRedefinicao: publicProcedure.input(z.object({
      cnpj: z.string(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      const [cred] = await db.select().from(portalCredentials).where(
        and(eq(portalCredentials.cnpj, cnpjClean), eq(portalCredentials.ativo, 1))
      );
      // Resposta sempre genérica para não vazar quem está cadastrado
      if (!cred || !cred.emailResponsavel) {
        return { success: true, mensagem: "Se houver cadastro, enviaremos um e-mail com instruções." };
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await db.insert(portalPasswordResets).values({
        credId: cred.id,
        token,
        expiresAt: expiresAt.toISOString().slice(0, 19).replace("T", " "),
      });
      const link = `${getPortalBaseUrl()}/portal/redefinir-senha/${token}`;
      try {
        await sendEmail({
          to: cred.emailResponsavel,
          subject: "Redefinição de senha — Portal Externo",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
              <h2 style="color:#1e3a8a;margin:0 0 12px">Redefinição de senha</h2>
              <p>Olá${cred.nomeResponsavel ? `, <b>${cred.nomeResponsavel}</b>` : ""},</p>
              <p>Recebemos uma solicitação para redefinir a senha do acesso vinculado ao identificador <b>${cnpjClean}</b>.</p>
              <p>Clique no botão abaixo para criar uma nova senha (link válido por 1 hora):</p>
              <p style="text-align:center;margin:24px 0">
                <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Redefinir senha</a>
              </p>
              <p style="font-size:12px;color:#64748b">Se você não solicitou, ignore este e-mail. Sua senha continua a mesma.</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
              <p style="font-size:11px;color:#94a3b8">FC Engenharia — Portal Externo. Não responda a este e-mail.</p>
            </div>
          `,
          text: `Acesse: ${link} (válido por 1 hora)`,
        });
      } catch (e) {
        console.error("[solicitarRedefinicao] SMTP falhou:", e);
      }
      return { success: true, mensagem: "Se houver cadastro, enviaremos um e-mail com instruções." };
    }),

    redefinirSenha: publicProcedure.input(z.object({
      token: z.string(),
      novaSenha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [reset] = await db.select().from(portalPasswordResets).where(eq(portalPasswordResets.token, input.token));
      if (!reset) throw new TRPCError({ code: "NOT_FOUND", message: "Link inválido" });
      if (reset.usadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Este link já foi utilizado" });
      if (new Date(reset.expiresAt) < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Link expirado. Solicite um novo." });
      const senhaHash = await bcrypt.hash(input.novaSenha, 10);
      await db.update(portalCredentials).set({
        senhaHash,
        primeiroAcesso: 0,
        updatedAt: new Date().toISOString(),
      }).where(eq(portalCredentials.id, reset.credId));
      await db.update(portalPasswordResets).set({
        usadoEm: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).where(eq(portalPasswordResets.id, reset.id));
      return { success: true };
    }),
  }),

  // ========== PORTAL DO TERCEIRO ==========
  terceiro: router({
    meusDados: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const [emp] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, decoded.empresaTerceiraId));
      return emp || null;
    }),

    meusFuncionarios: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
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
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { token, nomeCompleto, asoValidade, asoDocUrl, nr35Validade, nr35DocUrl, nr10Validade, nr10DocUrl, nr33Validade, nr33DocUrl, integracaoDocUrl, dataAdmissao, ...rest } = input;
      const [result] = await db.insert(funcionariosTerceiros).values({
        nome: nomeCompleto,
        nomeCompleto: nomeCompleto,
        cpf: rest.cpf,
        rg: rest.rg || null,
        funcao: rest.funcao || null,
        telefone: rest.telefone || null,
        email: rest.email || null,
        dataAdmissao: dataAdmissao || null,
        asoValidade: asoValidade || null,
        asoDocUrl: asoDocUrl || null,
        nr35Validade: nr35Validade || null,
        nr35DocUrl: nr35DocUrl || null,
        nr10Validade: nr10Validade || null,
        nr10DocUrl: nr10DocUrl || null,
        nr33Validade: nr33Validade || null,
        nr33DocUrl: nr33DocUrl || null,
        integracaoDocUrl: integracaoDocUrl || null,
        empresaTerceiraId: decoded.empresaTerceiraId,
        companyId: decoded.companyId,
        statusAptidao: "pendente",
        cadastradoPor: "portal",
      });
      return { id: result[0].id, success: true };
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
      status: z.enum(['ativo','inativo','afastado','desligado']).optional(),
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
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { token, id, ...data } = input;
      await db.update(funcionariosTerceiros).set(data).where(
        and(eq(funcionariosTerceiros.id, id), eq(funcionariosTerceiros.empresaTerceiraId, decoded.empresaTerceiraId))
      );
      return { success: true };
    }),

    excluirFuncionario: publicProcedure.input(z.object({
      token: z.string(),
      id: z.number(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
      await db.delete(funcionariosTerceiros).where(
        and(eq(funcionariosTerceiros.id, input.id), eq(funcionariosTerceiros.empresaTerceiraId, decoded.empresaTerceiraId))
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
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "terceiro") throw new TRPCError({ code: "FORBIDDEN" });
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
      const db = (await getDb())!;
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      try {
        const existing = await db.select().from(portalCredentials).where(
          and(
            eq(portalCredentials.cnpj, cnpjClean),
            eq(portalCredentials.tipo, input.tipo),
            eq(portalCredentials.companyId, input.companyId),
          )
        );
        const senhaTemp = generateTempPassword();
        const senhaHash = await bcrypt.hash(senhaTemp, 10);
        if (existing.length > 0) {
          await db.update(portalCredentials).set({
            senhaHash,
            primeiroAcesso: 1,
            ativo: 1,
            empresaTerceiraId: input.empresaTerceiraId ?? existing[0].empresaTerceiraId,
            parceiroId: input.parceiroId ?? existing[0].parceiroId,
            emailResponsavel: input.emailResponsavel || existing[0].emailResponsavel,
            nomeResponsavel: input.nomeResponsavel || existing[0].nomeResponsavel,
            nomeEmpresa: input.nomeEmpresa || existing[0].nomeEmpresa,
            updatedAt: new Date().toISOString(),
          }).where(eq(portalCredentials.id, existing[0].id));
        } else {
          await db.insert(portalCredentials).values({
            tipo: input.tipo,
            empresaTerceiraId: input.empresaTerceiraId ?? null,
            parceiroId: input.parceiroId ?? null,
            companyId: input.companyId,
            cnpj: cnpjClean,
            senhaHash,
            nomeEmpresa: input.nomeEmpresa ?? null,
            emailResponsavel: input.emailResponsavel ?? null,
            nomeResponsavel: input.nomeResponsavel ?? null,
            primeiroAcesso: 1,
            ativo: 1,
          });
        }
        return { senhaTemporaria: senhaTemp, cnpj: cnpjClean, nomeEmpresa: input.nomeEmpresa || "" };
      } catch (err: any) {
        console.error("[gerarAcesso] Erro:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao gerar acesso para CNPJ ${cnpjClean}: ${err?.detail || err?.message || "erro desconhecido"}`,
        });
      }
    }),

    listarAcessos: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), tipo: z.enum(["terceiro", "parceiro"]).optional(),
    })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      let conditions: any[] = [companyFilter(portalCredentials.companyId, input)];
      if (input.tipo) conditions.push(eq(portalCredentials.tipo, input.tipo));
      const creds = await db.select().from(portalCredentials).where(and(...conditions));
      return creds.map((c: any) => ({ ...c, senhaHash: undefined }));
    }),

    desativarAcesso: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(portalCredentials).set({ ativo: 0 }).where(eq(portalCredentials.id, input.id));
      return { success: true };
    }),

    // ========== PORTAL DO CLIENTE — Admin ==========
    gerarAcessoCliente: protectedProcedure.input(z.object({
      clienteId: z.number(),
      companyId: z.number(),
      enviarEmail: z.boolean().default(true),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [cli] = await db.select().from(clientes).where(and(
        eq(clientes.id, input.clienteId),
        eq(clientes.companyId, input.companyId),
      ));
      if (!cli) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
      const idDoc = (cli.cnpj || cli.cpf || "").replace(/\D/g, "");
      if (!idDoc) throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem CNPJ/CPF cadastrado — preencha antes de gerar acesso." });
      const emailDestino = cli.contatoEmail || cli.email;
      if (input.enviarEmail && !emailDestino) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem e-mail (contato/principal) — cadastre antes de enviar boas-vindas." });
      }
      const senhaTemp = generateTempPassword();
      const senhaHash = await bcrypt.hash(senhaTemp, 10);
      const [existing] = await db.select().from(portalCredentials).where(and(
        eq(portalCredentials.tipo, "cliente"),
        eq(portalCredentials.clienteId, input.clienteId),
        eq(portalCredentials.companyId, input.companyId),
      ));
      if (existing) {
        await db.update(portalCredentials).set({
          senhaHash,
          primeiroAcesso: 1,
          ativo: 1,
          cnpj: idDoc,
          emailResponsavel: emailDestino || existing.emailResponsavel,
          nomeResponsavel: cli.contatoNome || existing.nomeResponsavel,
          nomeEmpresa: cli.nomeFantasia || cli.razaoSocial,
          updatedAt: new Date().toISOString(),
        }).where(eq(portalCredentials.id, existing.id));
      } else {
        await db.insert(portalCredentials).values({
          tipo: "cliente",
          clienteId: input.clienteId,
          companyId: input.companyId,
          cnpj: idDoc,
          senhaHash,
          nomeEmpresa: cli.nomeFantasia || cli.razaoSocial,
          emailResponsavel: emailDestino || null,
          nomeResponsavel: cli.contatoNome || null,
          primeiroAcesso: 1,
          ativo: 1,
        });
      }
      let emailEnviado = false;
      let emailErro: string | undefined;
      if (input.enviarEmail && emailDestino) {
        const link = `${getPortalBaseUrl()}/portal/login`;
        const r = await sendEmail({
          to: emailDestino,
          subject: "Bem-vindo ao Portal do Cliente — FC Engenharia",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
              <h2 style="color:#1e3a8a;margin:0 0 12px">Bem-vindo ao Portal do Cliente</h2>
              <p>Olá${cli.contatoNome ? `, <b>${cli.contatoNome}</b>` : ""},</p>
              <p>A <b>FC Engenharia</b> liberou o acesso da empresa <b>${cli.razaoSocial}</b> ao Portal do Cliente.</p>
              <p>No portal você pode acompanhar suas obras, registrar comentários e enviar uma avaliação anônima da equipe e dos serviços prestados.</p>
              <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin:20px 0">
                <p style="margin:4px 0"><b>Identificador (CNPJ/CPF):</b> ${idDoc}</p>
                <p style="margin:4px 0"><b>Senha provisória:</b> <span style="font-family:Menlo,monospace;background:#fef3c7;padding:4px 8px;border-radius:6px">${senhaTemp}</span></p>
                <p style="margin:4px 0;font-size:12px;color:#475569">No primeiro acesso, será solicitada a criação de uma nova senha.</p>
              </div>
              <p style="text-align:center;margin:24px 0">
                <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Acessar o Portal</a>
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
              <p style="font-size:11px;color:#94a3b8">FC Engenharia — Portal do Cliente. Caso não esperasse este e-mail, ignore-o.</p>
            </div>
          `,
          text: `Acesse ${link} com o identificador ${idDoc} e a senha provisória ${senhaTemp}.`,
        });
        emailEnviado = r.success;
        emailErro = r.error;
      }
      return { senhaTemporaria: senhaTemp, identificador: idDoc, emailEnviado, emailErro, emailDestino };
    }),

    listarAcessosCliente: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(portalCredentials).where(and(
        companyFilter(portalCredentials.companyId, input),
        eq(portalCredentials.tipo, "cliente"),
      ));
      return rows.map((c: any) => ({ ...c, senhaHash: undefined }));
    }),

    listarComentariosCliente: protectedProcedure.input(z.object({
      companyId: z.number(), companyIds: z.array(z.number()).optional(),
      clienteId: z.number().optional(), apenasNaoLidos: z.boolean().optional(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(clienteComentarios.companyId, input)];
      if (input.clienteId) conds.push(eq(clienteComentarios.clienteId, input.clienteId));
      if (input.apenasNaoLidos) conds.push(and(eq(clienteComentarios.autorTipo, "cliente"), isNull(clienteComentarios.lidoEm))!);
      const rows = await db.select().from(clienteComentarios).where(and(...conds)).orderBy(desc(clienteComentarios.criadoEm)).limit(500);
      return rows;
    }),

    marcarComentarioLido: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(clienteComentarios).set({ lidoEm: new Date().toISOString().slice(0, 19).replace("T", " ") })
        .where(eq(clienteComentarios.id, input.id));
      return { success: true };
    }),

    responderComentarioCliente: protectedProcedure.input(z.object({
      companyId: z.number(),
      clienteId: z.number(),
      obraId: z.number().nullable().optional(),
      mensagem: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.insert(clienteComentarios).values({
        companyId: input.companyId,
        clienteId: input.clienteId,
        obraId: input.obraId ?? null,
        autorTipo: "fc",
        autorNome: ctx.user.name ?? "FC Engenharia",
        mensagem: input.mensagem,
      });
      return { success: true };
    }),

    dashboardAvaliacoesCliente: protectedProcedure.input(z.object({
      companyId: z.number(), companyIds: z.array(z.number()).optional(),
      dataInicio: z.string().optional(), dataFim: z.string().optional(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(clienteAvaliacoes.companyId, input)];
      if (input.dataInicio) conds.push(sql`${clienteAvaliacoes.criadoEm} >= ${input.dataInicio}`);
      if (input.dataFim)    conds.push(sql`${clienteAvaliacoes.criadoEm} <= ${input.dataFim + " 23:59:59"}`);
      const rows = await db.select().from(clienteAvaliacoes).where(and(...conds)).orderBy(desc(clienteAvaliacoes.criadoEm));
      const total = rows.length;
      const med = (k: string) => {
        const vals = rows.map((r: any) => r[k]).filter((v: any) => v !== null && v !== undefined);
        if (!vals.length) return null;
        return Math.round((vals.reduce((s: number, x: number) => s + x, 0) / vals.length) * 10) / 10;
      };
      const notas = rows.map((r: any) => r.notaGeral).filter((v: any) => v !== null && v !== undefined) as number[];
      const promotores = notas.filter(n => n >= 9).length;
      const detratores = notas.filter(n => n <= 6).length;
      const neutros = notas.filter(n => n === 7 || n === 8).length;
      const nps = notas.length ? Math.round(((promotores - detratores) / notas.length) * 100) : null;
      // Por obra
      const porObra = new Map<string, { obraNome: string; obraId: number | null; respostas: number; mediaGeral: number; nps: number }>();
      for (const r of rows as any[]) {
        const key = r.obraId ? `o${r.obraId}` : `n_${r.obraNome ?? "Sem obra"}`;
        const cur = porObra.get(key) || { obraNome: r.obraNome ?? "Sem obra", obraId: r.obraId, respostas: 0, mediaGeral: 0, nps: 0 };
        cur.respostas += 1;
        cur.mediaGeral += r.notaGeral ?? 0;
        porObra.set(key, cur);
      }
      const obrasList = Array.from(porObra.values()).map((o) => {
        const subset = (rows as any[]).filter(r => (o.obraId ? r.obraId === o.obraId : r.obraNome === o.obraNome));
        const ns = subset.map(r => r.notaGeral).filter((v: any) => v !== null) as number[];
        const p = ns.filter(n => n >= 9).length;
        const d = ns.filter(n => n <= 6).length;
        return {
          obraId: o.obraId, obraNome: o.obraNome, respostas: o.respostas,
          mediaGeral: Math.round((o.mediaGeral / o.respostas) * 10) / 10,
          nps: ns.length ? Math.round(((p - d) / ns.length) * 100) : null,
        };
      }).sort((a, b) => b.respostas - a.respostas);
      return {
        total,
        nps,
        promotores, neutros, detratores,
        medias: {
          geral:        med("notaGeral"),
          equipe:       med("notaEquipe"),
          obra:         med("notaObra"),
          atendimento:  med("notaAtendimento"),
          prazo:        med("notaPrazo"),
          qualidade:    med("notaQualidade"),
        },
        porObra: obrasList,
        avaliacoes: rows.slice(0, 100),
      };
    }),

    // Approve/reject funcionario from portal
    aprovarFuncionario: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["apto", "inapto", "pendente"]),
      observacao: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(funcionariosTerceiros).set({
        statusAptidao: input.status,
        observacaoAprovacao: input.observacao || null,
        aprovadoPor: ctx.user.name ?? "RH",
        dataAprovacao: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).where(eq(funcionariosTerceiros.id, input.id));
      // Notificar o owner
      try {
        const { notifyOwner } = await import("../_core/notification");
        const statusLabel = input.status === "apto" ? "APROVADO" : input.status === "inapto" ? "REJEITADO" : "PENDENTE";
        const [func] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.id));
        await notifyOwner({
          title: `Funcionário Terceiro ${statusLabel}`,
          content: `O funcionário ${func?.nomeCompleto || func?.nome || "ID:"+input.id} foi ${statusLabel} por ${ctx.user.name || "RH"}.${input.observacao ? " Obs: " + input.observacao : ""}`,
        });
      } catch (e) { /* notification is best-effort */ }
      return { success: true };
    }),

    // Approve/reject in bulk
    aprovarEmLote: protectedProcedure.input(z.object({
      ids: z.array(z.number()),
      status: z.enum(["apto", "inapto"]),
      observacao: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(funcionariosTerceiros).set({
        statusAptidao: input.status,
        observacaoAprovacao: input.observacao || null,
        aprovadoPor: ctx.user.name ?? "RH",
        dataAprovacao: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).where(inArray(funcionariosTerceiros.id, input.ids));
      try {
        const { notifyOwner } = await import("../_core/notification");
        const statusLabel = input.status === "apto" ? "APROVADOS" : "REJEITADOS";
        await notifyOwner({ title: `${input.ids.length} Funcionários Terceiros ${statusLabel}`, content: `${input.ids.length} funcionários foram ${statusLabel} em lote por ${ctx.user.name || "RH"}.` });
      } catch (e) { /* best-effort */ }
      return { success: true, count: input.ids.length };
    }),

    // List all pending funcionarios for approval panel
    listarPendentes: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const funcs = await db.select().from(funcionariosTerceiros).where(
        companyFilter(funcionariosTerceiros.companyId, input)
      );
      // Get empresa names
      const empresaIds = Array.from(new Set(funcs.map((f: any) => f.empresaTerceiraId)));
      const empresas = empresaIds.length > 0 ? await db.select().from(empresasTerceiras).where(
        companyFilter(empresasTerceiras.companyId, input)
      ) : [];
      const empresaMap = Object.fromEntries(empresas.map((e: any) => [e.id, e.razaoSocial || e.nomeFantasia]));
      return funcs.map((f: any) => ({ ...f, nomeEmpresa: empresaMap[f.empresaTerceiraId] || "Desconhecida" }));
    }),
  }),

  // ========== PORTAL DO PARCEIRO ==========
  parceiro: router({
    meusDados: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const [parc] = await db.select().from(parceirosConveniados).where(eq(parceirosConveniados.id, decoded.parceiroId));
      return parc || null;
    }),

    meusLancamentos: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const lancs = await db.select().from(lancamentosParceiros).where(eq(lancamentosParceiros.parceiroId, decoded.parceiroId)).orderBy(desc(lancamentosParceiros.createdAt));
      return lancs;
    }),

    criarLancamento: publicProcedure.input(z.object({
      token: z.string(),
      employeeId: z.number(),
      employeeNome: z.string().optional(),
      dataCompra: z.string(),
      descricaoItens: z.string().optional(),
      valor: z.string(),
      observacoes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const { token, observacoes, ...data } = input;
      // Get employee name if not provided
      let empNome = data.employeeNome || "";
      if (!empNome) {
        const [emp] = await db.select().from(employees).where(eq(employees.id, data.employeeId)).limit(1);
        empNome = emp?.nomeCompleto || "Funcionário";
      }
      const [result] = await db.insert(lancamentosParceiros).values({
        employeeId: data.employeeId,
        employeeNome: empNome,
        dataCompra: data.dataCompra,
        descricaoItens: data.descricaoItens || null,
        valor: data.valor,
        parceiroId: decoded.parceiroId,
        companyId: decoded.companyId,
        status: "pendente",
      });
      return { id: result[0].id, success: true };
    }),

    uploadNotaFiscal: publicProcedure.input(z.object({
      token: z.string(),
      lancamentoId: z.number(),
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "pdf";
      const fileKey = `parceiros/notas/${decoded.parceiroId}/${input.lancamentoId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.contentType);
      await db.update(lancamentosParceiros).set({ comprovanteUrl: url }).where(eq(lancamentosParceiros.id, input.lancamentoId));
      return { url, success: true };
    }),

    editarLancamento: publicProcedure.input(z.object({
      token: z.string(),
      lancamentoId: z.number(),
      employeeId: z.number().optional(),
      employeeNome: z.string().optional(),
      dataCompra: z.string().optional(),
      descricaoItens: z.string().optional(),
      valor: z.string().optional(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      // Only allow editing own lancamentos that are pendente
      const [lanc] = await db.select().from(lancamentosParceiros).where(and(eq(lancamentosParceiros.id, input.lancamentoId), eq(lancamentosParceiros.parceiroId, decoded.parceiroId)));
      if (!lanc) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
      if (lanc.status !== "pendente") throw new TRPCError({ code: "FORBIDDEN", message: "Só é possível editar lançamentos pendentes" });
      const updateData: any = {};
      if (input.employeeId) updateData.employeeId = input.employeeId;
      if (input.employeeNome) updateData.employeeNome = input.employeeNome;
      if (input.dataCompra) updateData.dataCompra = input.dataCompra;
      if (input.descricaoItens !== undefined) updateData.descricaoItens = input.descricaoItens;
      if (input.valor) updateData.valor = input.valor;
      await db.update(lancamentosParceiros).set(updateData).where(eq(lancamentosParceiros.id, input.lancamentoId));
      return { success: true };
    }),

    excluirLancamento: publicProcedure.input(z.object({
      token: z.string(),
      lancamentoId: z.number(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const [lanc] = await db.select().from(lancamentosParceiros).where(and(eq(lancamentosParceiros.id, input.lancamentoId), eq(lancamentosParceiros.parceiroId, decoded.parceiroId)));
      if (!lanc) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
      if (lanc.status !== "pendente") throw new TRPCError({ code: "FORBIDDEN", message: "Só é possível excluir lançamentos pendentes" });
      await db.delete(lancamentosParceiros).where(eq(lancamentosParceiros.id, input.lancamentoId));
      return { success: true };
    }),

    buscarFuncionarios: publicProcedure.input(z.object({
      token: z.string(),
      busca: z.string().optional(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "parceiro") throw new TRPCError({ code: "FORBIDDEN" });
      const allEmps = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        cargo: employees.cargo,
        status: employees.status,
      }).from(employees).where(and(
        eq(employees.companyId, decoded.companyId),
        eq(employees.status, "Ativo")
      ));
      if (!input.busca) return allEmps;
      const term = input.busca.toLowerCase().replace(/\D/g, "") || input.busca.toLowerCase();
      return allEmps.filter((e: any) => {
        const nome = (e.nomeCompleto || "").toLowerCase();
        const cpf = (e.cpf || "").replace(/\D/g, "");
        return nome.includes(input.busca!.toLowerCase()) || cpf.includes(term);
      });
    }),
  }),

  // ========== PORTAL DO CLIENTE ==========
  cliente: router({
    meusDados: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      return c || null;
    }),

    minhasObras: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) return [];
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      // Filtra obras da company onde obras.cliente bate com razaoSocial ou nomeFantasia (case-insensitive)
      const conds: any[] = [eq(obras.companyId, decoded.companyId), isNull(obras.deletedAt)];
      if (nomes.length === 0) return [];
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const list = await db.select().from(obras).where(and(...conds, or(...orConds)!)).orderBy(desc(obras.createdAt));
      return list.map((o: any) => ({
        id: o.id, nome: o.nome, codigo: o.codigo, cidade: o.cidade, estado: o.estado,
        status: o.status, dataInicio: o.dataInicio, dataPrevisaoFim: o.dataPrevisaoFim,
        clienteLogoUrl: o.clienteLogoUrl, gerenciadoraNome: o.gerenciadoraNome,
      }));
    }),

    listarComentarios: publicProcedure.input(z.object({ token: z.string(), obraId: z.number().nullable().optional() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const conds: any[] = [
        eq(clienteComentarios.companyId, decoded.companyId),
        eq(clienteComentarios.clienteId, decoded.clienteId),
      ];
      if (input.obraId) conds.push(eq(clienteComentarios.obraId, input.obraId));
      const rows = await db.select().from(clienteComentarios).where(and(...conds)).orderBy(desc(clienteComentarios.criadoEm));
      // Marca como lidos os da empresa
      try {
        await db.update(clienteComentarios).set({ lidoEm: new Date().toISOString().slice(0, 19).replace("T", " ") })
          .where(and(...conds, eq(clienteComentarios.autorTipo, "fc"), isNull(clienteComentarios.lidoEm)));
      } catch {}
      return rows;
    }),

    criarComentario: publicProcedure.input(z.object({
      token: z.string(),
      obraId: z.number().nullable().optional(),
      mensagem: z.string().min(1),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      await db.insert(clienteComentarios).values({
        companyId: decoded.companyId,
        clienteId: decoded.clienteId,
        obraId: input.obraId ?? null,
        autorTipo: "cliente",
        autorNome: c?.nomeFantasia || c?.razaoSocial || c?.contatoNome || "Cliente",
        mensagem: input.mensagem,
      });
      return { success: true };
    }),

    criarAvaliacao: publicProcedure.input(z.object({
      token: z.string(),
      obraId: z.number().nullable().optional(),
      notaEquipe: z.number().int().min(0).max(10).nullable().optional(),
      notaObra: z.number().int().min(0).max(10).nullable().optional(),
      notaAtendimento: z.number().int().min(0).max(10).nullable().optional(),
      notaPrazo: z.number().int().min(0).max(10).nullable().optional(),
      notaQualidade: z.number().int().min(0).max(10).nullable().optional(),
      notaGeral: z.number().int().min(0).max(10),
      comentarioPositivo: z.string().optional(),
      comentarioMelhoria: z.string().optional(),
      recomendaria: z.number().int().min(0).max(2).nullable().optional(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      // ANÔNIMA: NÃO armazena clienteId, credId, IP nem user-agent.
      let obraNome: string | null = null;
      if (input.obraId) {
        const [o] = await db.select().from(obras).where(eq(obras.id, input.obraId));
        obraNome = o?.nome ?? null;
      }
      await db.insert(clienteAvaliacoes).values({
        companyId: decoded.companyId,
        obraId: input.obraId ?? null,
        obraNome,
        notaEquipe: input.notaEquipe ?? null,
        notaObra: input.notaObra ?? null,
        notaAtendimento: input.notaAtendimento ?? null,
        notaPrazo: input.notaPrazo ?? null,
        notaQualidade: input.notaQualidade ?? null,
        notaGeral: input.notaGeral,
        comentarioPositivo: input.comentarioPositivo || null,
        comentarioMelhoria: input.comentarioMelhoria || null,
        recomendaria: input.recomendaria ?? null,
      });
      return { success: true };
    }),
  }),

  // ========== VERIFICAÇÃO PÚBLICA (QR CODE) ==========
  verificar: router({
    // Verificar aptidão de funcionário CLT/PJ pelo QR Code
    funcionario: publicProcedure.input(z.object({
      id: z.number(),
      tipo: z.enum(["clt", "pj"]),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const [emp] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      if (!emp) return { found: false, message: "Funcionário não encontrado" };
      
      // Get company name
      const [company] = await db.select().from(companies).where(eq(companies.id, emp.companyId)).limit(1);
      
      // Get aptidão
      const [aptidao] = await db.select().from(employeeAptidao).where(eq(employeeAptidao.employeeId, emp.id)).limit(1);
      
      return {
        found: true,
        nome: emp.nomeCompleto,
        cpf: emp.cpf ? `***${emp.cpf.substring(3, 9)}***` : undefined,
        funcao: emp.funcao || emp.cargo,
        setor: emp.setor,
        foto: emp.fotoUrl,
        tipo: input.tipo.toUpperCase(),
        empresa: company?.nomeFantasia || company?.razaoSocial || "N/A",
        status: emp.status,
        aptidao: aptidao?.status || "pendente",
        motivoInapto: aptidao?.motivoInapto,
        asoVigente: aptidao?.asoVigente === 1,
        treinamentosOk: aptidao?.treinamentosObrigatoriosOk === 1,
        documentosOk: aptidao?.documentosPessoaisOk === 1,
        nrOk: aptidao?.nrObrigatoriasOk === 1,
        ultimaVerificacao: aptidao?.ultimaVerificacao,
      };
    }),

    // Verificar aptidão de funcionário terceiro pelo QR Code
    terceiro: publicProcedure.input(z.object({
      id: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const [func] = await db.select().from(funcionariosTerceiros).where(eq(funcionariosTerceiros.id, input.id)).limit(1);
      if (!func) return { found: false, message: "Funcionário não encontrado" };
      
      // Get empresa terceira name
      const [empTerceira] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, func.empresaTerceiraId)).limit(1);
      
      // Get company name
      const [company] = await db.select().from(companies).where(eq(companies.id, func.companyId)).limit(1);
      
      return {
        found: true,
        nome: func.nome || (func as any).nomeCompleto || "N/A",
        cpf: func.cpf ? `***${func.cpf.substring(3, 9)}***` : undefined,
        funcao: func.funcao,
        foto: (func as any).fotoUrl,
        tipo: "TERCEIRO",
        empresa: company?.nomeFantasia || company?.razaoSocial || "N/A",
        empresaTerceira: empTerceira?.razaoSocial || "N/A",
        status: func.status,
        aptidao: func.statusAptidao || "pendente",
        motivoInapto: func.motivoInapto,
      };
    }),
  }),
});
