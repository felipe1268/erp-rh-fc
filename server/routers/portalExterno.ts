import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb, getEquipeObra } from "../db";
import { portalCredentials, funcionariosTerceiros, empresasTerceiras, parceirosConveniados, lancamentosParceiros, employees, employeeAptidao, companies, clientes, obras, clienteComentarios, clienteAvaliacoes, portalClienteConfig, portalPasswordResets, planejamentoProjetos, planejamentoRevisoes, planejamentoAtividades, planejamentoAvancos, planejamentoRefis, planejamentoCustosMo, planejamentoMedicoes, asos, atestados, trainings, warnings, obraFuncionarios, gdDocumentos, gdRevisoes, gdTiposDocumento, gdDisciplinas, jobFunctions, orcamentos, sstIntegracaoRegistros } from "../../drizzle/schema";
import { eq, and, or, inArray, desc, sql, isNull, ilike } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";
import { sendEmail } from "../services/smtpService";
import crypto from "crypto";

// ── Helpers idênticos aos do server/routers/planejamento.ts ─────────────────
// Mantemos cópias locais para garantir que o Portal do Cliente produza
// EXATAMENTE os mesmos números da tela interna de Planejamento.
const _n = (v: any) => parseFloat(v || "0") || 0;
const _toDateStr = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  try { return new Date(v).toISOString().slice(0, 10); } catch { return ""; }
};
function _toMondayStr(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d.getTime() + diff * 86_400_000);
  return m.toISOString().split("T")[0];
}

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
      tipoEsperado: z.enum(["cliente", "terceiro", "parceiro"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Identificador pode ser CNPJ/CPF (só números) OU e-mail cadastrado
      const raw = (input.cnpj || "").trim();
      const isEmail = raw.includes("@");
      const cnpjClean = raw.replace(/\D/g, "");
      const emailNorm = raw.toLowerCase();
      // Pode haver vários acessos para o mesmo CNPJ (até 4 usuários por cliente).
      // Tentamos validar a senha contra cada credencial ativa — a senha é o discriminador.
      const tipoCond = input.tipoEsperado ? eq(portalCredentials.tipo, input.tipoEsperado) : undefined;
      const ativoCond = eq(portalCredentials.ativo, 1);
      const idCond = isEmail
        ? sql`LOWER(${portalCredentials.emailResponsavel}) = ${emailNorm}`
        : eq(portalCredentials.cnpj, cnpjClean);
      const baseFilter = tipoCond ? and(idCond, ativoCond, tipoCond) : and(idCond, ativoCond);
      const creds = await db.select().from(portalCredentials).where(baseFilter);
      if (creds.length === 0) {
        const tipoLabel = isEmail ? "E-mail" : "CNPJ";
        const msg = input.tipoEsperado === "cliente"
          ? `${tipoLabel} não encontrado entre os clientes cadastrados ou acesso inativo.`
          : `${tipoLabel} não encontrado ou acesso inativo`;
        throw new TRPCError({ code: "UNAUTHORIZED", message: msg });
      }
      let cred: typeof creds[number] | undefined;
      for (const c of creds) {
        if (await bcrypt.compare(input.senha, c.senhaHash)) { cred = c; break; }
      }
      if (!cred) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });
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
        // Rev. 1550 — incluído nomeResponsavel/email para identificar
        // o usuário humano que enviou a mensagem (antes só tinha o
        // nome da empresa, gerando "Conversa" assinada com o nome
        // do cliente, não da pessoa).
        nomeResponsavel: (cred as any).nomeResponsavel ?? null,
        emailResponsavel: (cred as any).emailResponsavel ?? null,
      }, secret, { expiresIn: "24h" });
      return {
        token,
        primeiroAcesso: cred.primeiroAcesso === 1,
        tipo: cred.tipo,
        nomeEmpresa: cred.nomeEmpresa,
        cnpj: cred.cnpj,
        nomeResponsavel: (cred as any).nomeResponsavel ?? null,
      };
    }),

    trocarSenha: publicProcedure.input(z.object({
      cnpj: z.string(),
      senhaAtual: z.string(),
      novaSenha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
      nomeResponsavel: z.string().trim().min(2).max(120).optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      const creds = await db.select().from(portalCredentials).where(
        and(eq(portalCredentials.cnpj, cnpjClean), eq(portalCredentials.ativo, 1))
      );
      if (creds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Credencial não encontrada" });
      let cred: typeof creds[number] | undefined;
      for (const c of creds) {
        if (await bcrypt.compare(input.senhaAtual, c.senhaHash)) { cred = c; break; }
      }
      if (!cred) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta" });
      const novaSenhaHash = await bcrypt.hash(input.novaSenha, 10);
      const updateSet: Record<string, unknown> = {
        senhaHash: novaSenhaHash,
        primeiroAcesso: 0,
      };
      if (input.nomeResponsavel && input.nomeResponsavel.trim().length >= 2) {
        updateSet.nomeResponsavel = input.nomeResponsavel.trim();
      }
      await db.update(portalCredentials).set(updateSet).where(eq(portalCredentials.id, cred.id));
      return { success: true, nomeResponsavel: (updateSet as any).nomeResponsavel ?? (cred as any).nomeResponsavel ?? null };
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
      // Pode haver múltiplos acessos para o mesmo CNPJ — enviamos um link para CADA e-mail cadastrado.
      const creds = await db.select().from(portalCredentials).where(
        and(eq(portalCredentials.cnpj, cnpjClean), eq(portalCredentials.ativo, 1))
      );
      const comEmail = creds.filter((c) => !!c.emailResponsavel);
      // Resposta sempre genérica para não vazar quem está cadastrado
      if (comEmail.length === 0) {
        return { success: true, mensagem: "Se houver cadastro, enviaremos um e-mail com instruções." };
      }
      for (const cred of comEmail) {
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
            to: cred.emailResponsavel!,
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

    // Rev. 1574 — Editar nome/e-mail de um acesso já criado (sem precisar gerar nova senha).
    atualizarAcessoCliente: protectedProcedure.input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
      email: z.string().trim().email("E-mail inválido"),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [existing] = await db.select().from(portalCredentials).where(and(
        eq(portalCredentials.id, input.id),
        eq(portalCredentials.companyId, input.companyId),
        eq(portalCredentials.tipo, "cliente"),
      ));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Acesso não encontrado" });
      const emailNorm = input.email.toLowerCase();
      // Garante que não estamos colidindo com outro acesso ativo do mesmo cliente.
      if (emailNorm !== ((existing as any).emailResponsavel || "").toLowerCase()) {
        const conflitos = await db.select().from(portalCredentials).where(and(
          eq(portalCredentials.tipo, "cliente"),
          eq(portalCredentials.companyId, input.companyId),
          eq(portalCredentials.clienteId, (existing as any).clienteId),
          eq(portalCredentials.ativo, 1),
        ));
        const colide = conflitos.find((c: any) => c.id !== input.id && (c.emailResponsavel || "").toLowerCase() === emailNorm);
        if (colide) throw new TRPCError({ code: "CONFLICT", message: "Já existe outro acesso ATIVO com este e-mail para este cliente." });
      }
      await db.update(portalCredentials).set({
        nomeResponsavel: input.nome.trim(),
        emailResponsavel: emailNorm,
      }).where(and(
        eq(portalCredentials.id, input.id),
        eq(portalCredentials.companyId, input.companyId),
        eq(portalCredentials.tipo, "cliente"),
      ));
      return { success: true };
    }),

    // ========== PORTAL DO CLIENTE — Admin ==========
    // Cria (ou atualiza, se já existir um acesso para o mesmo e-mail) uma credencial de acesso
    // ao Portal do Cliente. Cada cliente pode ter múltiplos usuários — cada um com nome e e-mail próprios.
    gerarAcessoCliente: protectedProcedure.input(z.object({
      clienteId: z.number(),
      companyId: z.number(),
      nome: z.string().min(1, "Informe o nome do usuário"),
      email: z.string().email("E-mail inválido"),
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
      const emailNorm = input.email.trim().toLowerCase();
      const senhaTemp = generateTempPassword();
      const senhaHash = await bcrypt.hash(senhaTemp, 10);

      // Procura acesso existente por (clienteId, e-mail) para fazer reset/reenvio.
      const existentes = await db.select().from(portalCredentials).where(and(
        eq(portalCredentials.tipo, "cliente"),
        eq(portalCredentials.clienteId, input.clienteId),
        eq(portalCredentials.companyId, input.companyId),
      ));
      const existing = existentes.find((c: any) => (c.emailResponsavel || "").trim().toLowerCase() === emailNorm);
      let credId: number;
      let acaoLabel: "criado" | "reenviado";
      if (existing) {
        await db.update(portalCredentials).set({
          senhaHash,
          primeiroAcesso: 1,
          ativo: 1,
          cnpj: idDoc,
          emailResponsavel: emailNorm,
          nomeResponsavel: input.nome,
          nomeEmpresa: cli.nomeFantasia || cli.razaoSocial,
          updatedAt: new Date().toISOString(),
        }).where(eq(portalCredentials.id, existing.id));
        credId = existing.id;
        acaoLabel = "reenviado";
      } else {
        const [nova] = await db.insert(portalCredentials).values({
          tipo: "cliente",
          clienteId: input.clienteId,
          companyId: input.companyId,
          cnpj: idDoc,
          senhaHash,
          nomeEmpresa: cli.nomeFantasia || cli.razaoSocial,
          emailResponsavel: emailNorm,
          nomeResponsavel: input.nome,
          primeiroAcesso: 1,
          ativo: 1,
        }).returning({ id: portalCredentials.id });
        credId = nova.id;
        acaoLabel = "criado";
      }

      let emailEnviado = false;
      let emailErro: string | undefined;
      if (input.enviarEmail) {
        const link = `${getPortalBaseUrl()}/portal/login`;
        const r = await sendEmail({
          to: emailNorm,
          subject: "Bem-vindo ao Portal do Cliente — FC Engenharia",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
              <h2 style="color:#1e3a8a;margin:0 0 12px">Bem-vindo ao Portal do Cliente</h2>
              <p>Olá, <b>${input.nome}</b>,</p>
              <p>A <b>FC Engenharia</b> liberou seu acesso ao Portal do Cliente, vinculado a <b>${cli.razaoSocial}</b>.</p>
              <p>No portal você pode acompanhar as obras, registrar comentários e enviar uma avaliação anônima da equipe e dos serviços prestados.</p>
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
      return { credId, acao: acaoLabel, senhaTemporaria: senhaTemp, identificador: idDoc, emailEnviado, emailErro, emailDestino: emailNorm };
    }),

    removerAcessoCliente: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Deleta tokens de reset vinculados antes (FK cascade já existe, mas explícito por segurança)
      await db.delete(portalPasswordResets).where(eq(portalPasswordResets.credId, input.id));
      await db.delete(portalCredentials).where(and(
        eq(portalCredentials.id, input.id),
        eq(portalCredentials.companyId, input.companyId),
        eq(portalCredentials.tipo, "cliente"),
      ));
      return { success: true };
    }),

    setAbasLiberadasCliente: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(),
      abas: z.array(z.string()),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { serializeAbasLiberadas } = await import("../../shared/portalClienteAbas");
      const json = serializeAbasLiberadas(input.abas as any);
      await db.update(portalCredentials).set({
        abasLiberadas: json,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(portalCredentials.id, input.id),
        eq(portalCredentials.companyId, input.companyId),
        eq(portalCredentials.tipo, "cliente"),
      ));
      return { success: true, abas: JSON.parse(json) };
    }),

    reativarAcessoCliente: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(portalCredentials).set({ ativo: 1, updatedAt: new Date().toISOString() })
        .where(and(
          eq(portalCredentials.id, input.id),
          eq(portalCredentials.companyId, input.companyId),
          eq(portalCredentials.tipo, "cliente"),
        ));
      return { success: true };
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

    // Rev. 1594 — Apagar mensagem do mural de comentários do Portal do Cliente.
    // Restrito a Admin Master (mesma política de cancelarAvaliacaoCliente).
    // Hard-delete: o mural é uma caixa de mensagens viva, não há valor de
    // auditoria em manter mensagens apagadas (diferente das avaliações
    // anônimas, que ficam soft-deleted via cancelada_em).
    deletarComentarioCliente: protectedProcedure.input(z.object({
      id: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode apagar mensagens." });
      }
      const db = (await getDb())!;
      const [msg] = await db.select().from(clienteComentarios).where(eq(clienteComentarios.id, input.id));
      if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada." });
      if (msg.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Mensagem não pertence à empresa selecionada." });
      }
      await db.delete(clienteComentarios).where(eq(clienteComentarios.id, input.id));
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
      // Rev. 1569 — agrupamento opcional (mes | ano) p/ visão por período
      agruparPor: z.enum(["mes", "ano"]).optional(),
      // Rev. 1593 — filtro opcional por obra (usado pela aba "Avaliação do Cliente"
      // dentro de PlanejamentoDetalhe, para mostrar só as avaliações daquela obra).
      obraId: z.number().optional(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      // Rev. 1569 — Avaliações canceladas pelo Master ficam fora dos cálculos
      // (mas continuam no banco para auditoria).
      const conds: any[] = [
        companyFilter(clienteAvaliacoes.companyId, input),
        isNull(clienteAvaliacoes.canceladaEm),
      ];
      if (input.dataInicio) conds.push(sql`${clienteAvaliacoes.criadoEm} >= ${input.dataInicio}`);
      if (input.dataFim)    conds.push(sql`${clienteAvaliacoes.criadoEm} <= ${input.dataFim + " 23:59:59"}`);
      if (input.obraId)     conds.push(eq(clienteAvaliacoes.obraId, input.obraId));
      const rows = await db.select().from(clienteAvaliacoes).where(and(...conds)).orderBy(desc(clienteAvaliacoes.criadoEm));
      const total = rows.length;
      const med = (k: string) => {
        const vals = rows.map((r: any) => r[k]).filter((v: any) => v !== null && v !== undefined);
        if (!vals.length) return null;
        return Math.round((vals.reduce((s: number, x: number) => s + x, 0) / vals.length) * 10) / 10;
      };
      const npsOf = (ns: number[]) => {
        const p = ns.filter(n => n >= 9).length;
        const d = ns.filter(n => n <= 6).length;
        return ns.length ? Math.round(((p - d) / ns.length) * 100) : null;
      };
      // Recomendaria: 0=não, 1=talvez, 2=sim
      const recVals = (rows as any[]).map(r => r.recomendaria).filter((v: any) => v !== null && v !== undefined) as number[];
      const recomendacao = {
        sim: recVals.filter(v => v === 2).length,
        talvez: recVals.filter(v => v === 1).length,
        nao: recVals.filter(v => v === 0).length,
        total: recVals.length,
      };
      const notas = rows.map((r: any) => r.notaGeral).filter((v: any) => v !== null && v !== undefined) as number[];
      const promotores = notas.filter(n => n >= 9).length;
      const detratores = notas.filter(n => n <= 6).length;
      const neutros = notas.filter(n => n === 7 || n === 8).length;
      const nps = npsOf(notas);
      // Por obra
      const porObra = new Map<string, { obraNome: string; obraId: number | null; respostas: number; mediaGeral: number; nps: number | null }>();
      for (const r of rows as any[]) {
        const key = r.obraId ? `o${r.obraId}` : `n_${r.obraNome ?? "Sem obra"}`;
        const cur = porObra.get(key) || { obraNome: r.obraNome ?? "Sem obra", obraId: r.obraId, respostas: 0, mediaGeral: 0, nps: null };
        cur.respostas += 1;
        cur.mediaGeral += r.notaGeral ?? 0;
        porObra.set(key, cur);
      }
      const obrasList = Array.from(porObra.values()).map((o) => {
        const subset = (rows as any[]).filter(r => (o.obraId ? r.obraId === o.obraId : r.obraNome === o.obraNome));
        const ns = subset.map(r => r.notaGeral).filter((v: any) => v !== null) as number[];
        return {
          obraId: o.obraId, obraNome: o.obraNome, respostas: o.respostas,
          mediaGeral: Math.round((o.mediaGeral / o.respostas) * 10) / 10,
          nps: npsOf(ns),
        };
      }).sort((a, b) => b.respostas - a.respostas);
      // Rev. 1569 — Por período (mês ou ano). Usamos anoPeriodo (fonte de verdade do
      // limite anônimo) e fazemos fallback para criadoEm em fuso Brasília quando o
      // anoPeriodo não estiver preenchido (avaliações antigas).
      const slice = input.agruparPor === "ano" ? 4 : 7;
      const porPeriodo = new Map<string, { periodo: string; respostas: number; somaGeral: number; notas: number[] }>();
      for (const r of rows as any[]) {
        const ap = (r.anoPeriodo || "").trim();
        const fallback = r.criadoEm ? String(r.criadoEm).slice(0, 10) : "";
        const baseRaw = ap || fallback;
        const periodo = (baseRaw || "—").slice(0, slice);
        const cur = porPeriodo.get(periodo) || { periodo, respostas: 0, somaGeral: 0, notas: [] };
        cur.respostas += 1;
        cur.somaGeral += r.notaGeral ?? 0;
        if (r.notaGeral !== null && r.notaGeral !== undefined) cur.notas.push(r.notaGeral);
        porPeriodo.set(periodo, cur);
      }
      const periodos = Array.from(porPeriodo.values()).map(p => ({
        periodo: p.periodo,
        respostas: p.respostas,
        mediaGeral: p.respostas ? Math.round((p.somaGeral / p.respostas) * 10) / 10 : null,
        nps: npsOf(p.notas),
      })).sort((a, b) => b.periodo.localeCompare(a.periodo));
      return {
        total,
        nps,
        promotores, neutros, detratores,
        recomendacao,
        medias: {
          geral:        med("notaGeral"),
          equipe:       med("notaEquipe"),
          obra:         med("notaObra"),
          atendimento:  med("notaAtendimento"),
          prazo:        med("notaPrazo"),
          qualidade:    med("notaQualidade"),
          empresa:      med("notaEmpresa"),
          gestor:       med("notaGestor"),
          // Rev. 1592 — Escritório Central
          escritorio:   med("notaEscritorio"),
          faturamento:  med("notaFaturamento"),
        },
        porObra: obrasList,
        porPeriodo: periodos,
        avaliacoes: rows.slice(0, 100),
      };
    }),

    // Rev. 1569 — Master pode CANCELAR uma avaliação registrada.
    // Marca cancelada_em (soft-delete preservando auditoria) e remove
    // marcações de credencial daquele período da empresa, liberando
    // o cliente para registrar nova avaliação no mesmo período.
    cancelarAvaliacaoCliente: protectedProcedure.input(z.object({
      id: z.number(),
      companyId: z.number(),
      motivo: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode cancelar avaliações." });
      }
      const db = (await getDb())!;
      const [aval] = await db.select().from(clienteAvaliacoes).where(eq(clienteAvaliacoes.id, input.id));
      if (!aval) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliação não encontrada." });
      if (aval.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Avaliação não pertence à empresa selecionada." });
      }
      const motivo = (input.motivo || "").trim();
      const carimbo = ctx.user.name ? `${ctx.user.name}${motivo ? " — " + motivo : ""}` : (motivo || "Admin Master");
      await db.update(clienteAvaliacoes).set({
        canceladaEm: new Date().toISOString().slice(0, 19).replace("T", " "),
        canceladaPor: carimbo.slice(0, 255),
      }).where(eq(clienteAvaliacoes.id, input.id));
      // Libera as credenciais de cliente desta empresa para o mesmo período,
      // permitindo nova avaliação. Como a tabela é anônima, removemos as
      // marcações de cred_id pertencentes à empresa para o ano_periodo da
      // avaliação cancelada (texto YYYY-MM ou YYYY).
      const periodoLimpo = (aval.anoPeriodo || "").trim();
      if (periodoLimpo) {
        await db.execute(sql`
          DELETE FROM cliente_avaliacao_marcacoes
          WHERE ano_mes = ${periodoLimpo}
            AND cred_id IN (
              SELECT id FROM portal_credentials
              WHERE company_id = ${aval.companyId} AND tipo = 'cliente'
            )
        `);
      }
      return { success: true };
    }),

    // Rev. 1569 — Configuração do Portal do Cliente (periodicidade NPS).
    getPortalClienteConfig: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      const db = (await getDb())!;
      const [cfg] = await db.select().from(portalClienteConfig).where(eq(portalClienteConfig.companyId, input.companyId));
      return { periodicidade: (cfg?.periodicidade === "anual" ? "anual" : "mensal") as "mensal" | "anual" };
    }),

    setPortalClienteConfig: protectedProcedure.input(z.object({
      companyId: z.number(),
      periodicidade: z.enum(["mensal", "anual"]),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode alterar a periodicidade do NPS." });
      }
      const db = (await getDb())!;
      await db.execute(sql`
        INSERT INTO portal_cliente_config (company_id, periodicidade, updated_at)
        VALUES (${input.companyId}, ${input.periodicidade}, NOW())
        ON CONFLICT (company_id) DO UPDATE
          SET periodicidade = EXCLUDED.periodicidade,
              updated_at = NOW()
      `);
      return { success: true };
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
    // Rev. 1574 — Perfil do usuário logado (nome/e-mail/empresa).
    // Usado pelo Hub para exibir o nome ATUAL do banco mesmo quando o
    // localStorage tem dados antigos (ex.: usuário criado antes do campo
    // nomeResponsavel existir, e que foi editado pelo admin depois).
    meuPerfil: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const credId = decoded.portalId ?? decoded.credId;
      const [cred] = await db.select().from(portalCredentials).where(and(
        eq(portalCredentials.id, credId),
        eq(portalCredentials.companyId, decoded.companyId),
      ));
      if (!cred) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        nomeResponsavel: (cred as any).nomeResponsavel ?? null,
        emailResponsavel: (cred as any).emailResponsavel ?? null,
        nomeEmpresa: (cred as any).nomeEmpresa ?? null,
        primeiroAcesso: (cred as any).primeiroAcesso === 1,
      };
    }),


    meusDados: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      return c || null;
    }),

    // Rev. 1564 — Liberações (módulos do Hub e abas do Planejamento)
    // configuradas pelo admin para esta credencial. Usado pelo Hub e
    // pela barra lateral do Planejamento para esconder o que o cliente
    // não pode ver. Backward compatible: se a coluna estiver NULL ou
    // sem chaves de módulo, devolve todos os módulos liberados.
    liberacoes: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const { parseAbasLiberadas, parseModulosLiberados } = await import("../../shared/portalClienteAbas");
      // O JWT do auth.login usa `portalId`. Outros endpoints (planejamentoObra)
      // já fazem `portalId ?? credId` — mesma normalização aqui.
      const credId = decoded.portalId ?? decoded.credId;
      const [cred] = await db.select().from(portalCredentials).where(and(
        eq(portalCredentials.id, credId),
        eq(portalCredentials.companyId, decoded.companyId),
      ));
      const raw = (cred as any)?.abasLiberadas as string | null;
      return {
        modulos: parseModulosLiberados(raw),
        abas: parseAbasLiberadas(raw),
      };
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
      const [emp] = await db.select().from(companies).where(eq(companies.id, decoded.companyId));
      const empresaLogoUrl = emp?.logoUrl || null;
      const empresaNome = emp?.nomeFantasia || emp?.razaoSocial || null;
      return list.map((o: any) => ({
        id: o.id, nome: o.nome, codigo: o.codigo, cidade: o.cidade, estado: o.estado,
        status: o.status, dataInicio: o.dataInicio, dataPrevisaoFim: o.dataPrevisaoFim,
        clienteLogoUrl: o.clienteLogoUrl, gerenciadoraNome: o.gerenciadoraNome, gerenciadoraLogoUrl: o.gerenciadoraLogoUrl,
        cliente: o.cliente,
        empresaLogoUrl, empresaNome,
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
      return rows;
    }),

    marcarComentariosLidos: publicProcedure.input(z.object({ token: z.string(), obraId: z.number().nullable().optional() })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const conds: any[] = [
        eq(clienteComentarios.companyId, decoded.companyId),
        eq(clienteComentarios.clienteId, decoded.clienteId),
        eq(clienteComentarios.autorTipo, "fc"),
        isNull(clienteComentarios.lidoEm),
      ];
      if (input.obraId) conds.push(eq(clienteComentarios.obraId, input.obraId));
      await db.update(clienteComentarios).set({ lidoEm: new Date().toISOString().slice(0, 19).replace("T", " ") }).where(and(...conds));
      return { success: true };
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
      // Rev. 1550 — usar nome da PESSOA (responsavel do acesso) e não
      // mais o nome da empresa cliente. Se por algum motivo o token
      // antigo não trouxer (ainda válido), tenta buscar no
      // portalCredentials e cai para empresa só em último caso.
      let nomeAutor: string =
        decoded.nomeResponsavel ||
        (c?.contatoNome ?? "") ||
        c?.nomeFantasia ||
        c?.razaoSocial ||
        "Cliente";
      if (!decoded.nomeResponsavel && decoded.portalId) {
        try {
          const [cred] = await db.select().from(portalCredentials).where(eq(portalCredentials.id, decoded.portalId));
          if ((cred as any)?.nomeResponsavel) nomeAutor = (cred as any).nomeResponsavel;
        } catch {}
      }
      await db.insert(clienteComentarios).values({
        companyId: decoded.companyId,
        clienteId: decoded.clienteId,
        obraId: input.obraId ?? null,
        autorTipo: "cliente",
        autorNome: nomeAutor,
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
      notaEmpresa: z.number().int().min(0).max(10).nullable().optional(),
      notaGestor: z.number().int().min(0).max(10).nullable().optional(),
      // Rev. 1592 — bloco Escritório Central
      notaEscritorio: z.number().int().min(0).max(10).nullable().optional(),
      notaFaturamento: z.number().int().min(0).max(10).nullable().optional(),
      notaGeral: z.number().int().min(0).max(10),
      comentarioPositivo: z.string().optional(),
      comentarioMelhoria: z.string().optional(),
      comentarioEquipe: z.string().optional(),
      comentarioEmpresa: z.string().optional(),
      comentarioGestor: z.string().optional(),
      comentarioEscritorio: z.string().optional(),
      gestorNome: z.string().optional(),
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
      // Rev. 1569 — periodicidade configurável (mensal | anual) por empresa.
      // ano_periodo: 'YYYY-MM' (mensal) ou 'YYYY' (anual). Calculado no
      // banco com fuso America/Sao_Paulo pra não errar a virada na janela UTC-3.
      const [cfg] = await db.select().from(portalClienteConfig).where(eq(portalClienteConfig.companyId, decoded.companyId));
      const periodicidade = (cfg?.periodicidade === "anual") ? "anual" : "mensal";
      const fmt = periodicidade === "anual" ? "YYYY" : "YYYY-MM";
      const labelPer = periodicidade === "anual" ? "ano" : "mês";
      const periodoRow = await db.execute(sql`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', ${fmt}) AS periodo`);
      const anoPeriodo = (((periodoRow as any).rows ?? periodoRow ?? [])[0] as any)?.periodo ?? "";
      // Rev. 1551 — Limite anônimo por credencial. ATÔMICO via ON CONFLICT.
      const credId = decoded.portalId as number | undefined;
      if (credId) {
        const claim = await db.execute(sql`
          INSERT INTO cliente_avaliacao_marcacoes (cred_id, ano_mes)
          VALUES (${credId}, ${anoPeriodo})
          ON CONFLICT (cred_id, ano_mes) DO NOTHING
          RETURNING cred_id
        `);
        const claimRows = ((claim as any).rows ?? claim ?? []) as any[];
        if (claimRows.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: `Você já enviou a avaliação deste ${labelPer}. Volte no próximo ${labelPer}.` });
        }
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
        notaEmpresa: input.notaEmpresa ?? null,
        notaGestor: input.notaGestor ?? null,
        // Rev. 1592 — Escritório Central
        notaEscritorio: input.notaEscritorio ?? null,
        notaFaturamento: input.notaFaturamento ?? null,
        notaGeral: input.notaGeral,
        comentarioPositivo: input.comentarioPositivo || null,
        comentarioMelhoria: input.comentarioMelhoria || null,
        comentarioEquipe: input.comentarioEquipe || null,
        comentarioEmpresa: input.comentarioEmpresa || null,
        comentarioGestor: input.comentarioGestor || null,
        comentarioEscritorio: input.comentarioEscritorio || null,
        gestorNome: input.gestorNome || null,
        recomendaria: input.recomendaria ?? null,
        anoPeriodo,
      });
      return { success: true };
    }),

    // Rev. 1551/1569 — verifica de forma anônima se o usuário do portal
    // já enviou avaliação no período corrente (mês ou ano, fuso Brasília).
    podeAvaliarEsteMes: publicProcedure.input(z.object({
      token: z.string(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") return { podeAvaliar: false, jaAvaliou: false, anoMes: "", periodicidade: "mensal" as const };
      const [cfg] = await db.select().from(portalClienteConfig).where(eq(portalClienteConfig.companyId, decoded.companyId));
      const periodicidade = (cfg?.periodicidade === "anual") ? "anual" as const : "mensal" as const;
      const fmt = periodicidade === "anual" ? "YYYY" : "YYYY-MM";
      const credId = decoded.portalId as number | undefined;
      const periodoRow = await db.execute(sql`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', ${fmt}) AS periodo`);
      const anoMes = (((periodoRow as any).rows ?? periodoRow ?? [])[0] as any)?.periodo ?? "";
      if (!credId) return { podeAvaliar: true, jaAvaliou: false, anoMes, periodicidade };
      const ja = await db.execute(sql`SELECT 1 FROM cliente_avaliacao_marcacoes WHERE cred_id = ${credId} AND ano_mes = ${anoMes} LIMIT 1`);
      const rows = ((ja as any).rows ?? ja ?? []) as any[];
      return { podeAvaliar: rows.length === 0, jaAvaliou: rows.length > 0, anoMes, periodicidade };
    }),

    efetivoObra: publicProcedure.input(z.object({
      token: z.string(),
      obraId: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });

      // Verifica que a obra pertence ao cliente (mesma regra do planejamentoObra)
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const [obra] = await db.select().from(obras).where(and(
        eq(obras.id, input.obraId),
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (!obra) throw new TRPCError({ code: "FORBIDDEN", message: "Obra não vinculada a este cliente" });

      const equipe = await getEquipeObra(input.obraId, decoded.companyId);

      // ── Mapa categoria (Direto/Indireto) por nome de função ──────────
      // employees.funcao é texto livre; jobFunctions.nome guarda categoriaMO.
      const jobFns = await db.select({
        nome: jobFunctions.nome,
        categoriaMO: jobFunctions.categoriaMO,
      }).from(jobFunctions).where(eq(jobFunctions.companyId, decoded.companyId));
      const catByFn = new Map<string, string>();
      for (const j of jobFns) {
        if (j.nome) catByFn.set(j.nome.trim().toUpperCase(), (j.categoriaMO || "").toLowerCase());
      }
      const categoriaDe = (funcao: string | null | undefined): "Direto" | "Indireto" => {
        const cat = catByFn.get((funcao || "").trim().toUpperCase()) || "";
        if (cat === "direto") return "Direto";
        if (cat === "indireta_obra" || cat === "escritorio_central") return "Indireto";
        return "Direto";
      };

      const cltList = equipe.map((e: any) => {
        const isPJ = (e.tipoContrato || "").toUpperCase() === "PJ";
        return {
          ...e,
          effectiveStatus: e.status,
          tipo: isPJ ? ("PJ" as const) : ("CLT" as const),
          categoria: categoriaDe(e.funcao || e.cargo),
        };
      });

      // Adiciona terceiros alocados na obra (mesma company, ativos, não excluídos)
      const tercRows = await db.select({
        id: funcionariosTerceiros.id,
        nomeCompleto: funcionariosTerceiros.nome,
        funcao: funcionariosTerceiros.funcao,
        cpf: funcionariosTerceiros.cpf,
        dataAdmissao: funcionariosTerceiros.dataAdmissao,
        empresaTerceiraId: funcionariosTerceiros.empresaTerceiraId,
        status: funcionariosTerceiros.status,
        statusAptidao: funcionariosTerceiros.statusAptidao,
        fotoUrl: funcionariosTerceiros.fotoUrl,
      }).from(funcionariosTerceiros).where(and(
        eq(funcionariosTerceiros.obraId, input.obraId),
        eq(funcionariosTerceiros.companyId, decoded.companyId),
        sql`${funcionariosTerceiros.status} <> 'inativo'`,
        isNull(funcionariosTerceiros.deletedAt),
      ));
      const empIds = Array.from(new Set(tercRows.map(t => t.empresaTerceiraId).filter(Boolean) as number[]));
      let empMap = new Map<number, string>();
      if (empIds.length > 0) {
        const emps = await db.select({ id: empresasTerceiras.id, razaoSocial: empresasTerceiras.razaoSocial, nomeFantasia: empresasTerceiras.nomeFantasia })
          .from(empresasTerceiras).where(inArray(empresasTerceiras.id, empIds));
        emps.forEach((e: any) => empMap.set(e.id, e.nomeFantasia || e.razaoSocial || ""));
      }
      const terceiros = tercRows.map((t: any) => ({
        id: `T${t.id}`,
        nomeCompleto: t.nomeCompleto,
        funcao: t.funcao,
        cargo: t.funcao,
        setor: empMap.get(t.empresaTerceiraId) || "Terceiro",
        status: "Ativo",
        effectiveStatus: "Ativo",
        dataAdmissao: t.dataAdmissao,
        cpf: t.cpf,
        tipo: "Terceiro" as const,
        empresaTerceira: empMap.get(t.empresaTerceiraId) || "",
        fotoUrl: t.fotoUrl || null,
        categoria: categoriaDe(t.funcao),
      }));

      return [...cltList, ...terceiros];
    }),

    planejamentoObra: publicProcedure.input(z.object({
      token: z.string(),
      obraId: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });

      // Carrega credencial para descobrir abas liberadas
      const { parseAbasLiberadas } = await import("../../shared/portalClienteAbas");
      let abasLiberadas: string[] = ["visao_geral"];
      const credIdJwt = decoded.portalId ?? decoded.credId;
      if (credIdJwt) {
        const [cred] = await db.select().from(portalCredentials).where(eq(portalCredentials.id, credIdJwt));
        if (cred && cred.ativo === 1) abasLiberadas = parseAbasLiberadas((cred as any).abasLiberadas);
      }

      // Verifica que a obra pertence ao cliente
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const [obra] = await db.select().from(obras).where(and(
        eq(obras.id, input.obraId),
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (!obra) throw new TRPCError({ code: "FORBIDDEN", message: "Obra não vinculada a este cliente" });

      // Empresa operadora (FC) — para logo no cabeçalho de impressão
      const [emp] = await db.select().from(companies).where(eq(companies.id, decoded.companyId));
      (obra as any).empresaLogoUrl = emp?.logoUrl || null;
      (obra as any).empresaNome = emp?.nomeFantasia || emp?.razaoSocial || null;

      // Encontra o projeto de planejamento dessa obra
      const [projeto] = await db.select().from(planejamentoProjetos)
        .where(and(
          eq(planejamentoProjetos.companyId, decoded.companyId),
          eq(planejamentoProjetos.obraId, input.obraId),
        ))
        .orderBy(desc(planejamentoProjetos.criadoEm))
        .limit(1);

      if (!projeto) {
        return { obra, abasLiberadas, projeto: null, atividades: [], avancos: [], kpis: null, revisoes: [] };
      }

      // Rev. 1535 — Total do orçamento vinculado (fallback do valorContrato
      // para a Curva S Financeira do portal). Igual ao getCurvaSFinanceira
      // interno: usa orcamentos.totalVenda quando existe orçamento ligado.
      let orcTotalVenda = 0;
      if ((projeto as any).orcamentoId) {
        const [orc] = await db.select({ totalVenda: orcamentos.totalVenda })
          .from(orcamentos)
          .where(eq(orcamentos.id, (projeto as any).orcamentoId))
          .limit(1);
        if (orc) orcTotalVenda = _n(orc.totalVenda);
      }

      // Histórico de revisões (para a aba "Revisões")
      const revisoesHist = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, projeto.id))
        .orderBy(desc(planejamentoRevisoes.numero));
      // ALINHAMENTO COM O MÓDULO INTERNO (PlanejamentoDetalhe.tsx ~309):
      // revisaoAtiva = última revisão APROVADA; só cai na revisão mais nova
      // (qualquer status) quando NENHUMA aprovada existe. Antes o portal pegava
      // sempre revisoesHist[0] (a mais nova por número), o que fazia o portal
      // calcular em cima de revisões em rascunho/em_revisao com pesos diferentes
      // dos da revisão aprovada que o cliente vê no módulo interno → divergência
      // típica do tipo "portal 2,19% vs Planejamento interno 1,84%".
      const aprovadasOrdAsc = revisoesHist
        .filter((r: any) => r.status === "aprovada")
        .sort((a: any, b: any) => a.numero - b.numero);
      const revisao = aprovadasOrdAsc[aprovadasOrdAsc.length - 1] ?? revisoesHist[0];

      if (!revisao) {
        return { obra, abasLiberadas, projeto, atividades: [], avancos: [], kpis: null, revisoes: [] };
      }

      // Atividades da revisão (excluindo desativadas)
      const atividadesRaw = await db.select().from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.revisaoId, revisao.id),
          eq(planejamentoAtividades.disabled, false),
        ));

      const atividades = atividadesRaw.map((a: any) => ({
        id: a.id,
        eapCodigo: a.eapCodigo,
        nome: a.nome,
        nivel: a.nivel,
        dataInicio: a.dataInicio,
        dataFim: a.dataFim,
        pesoFinanceiro: Number(a.pesoFinanceiro || 0),
        recursoPrincipal: a.recursoPrincipal,
        isGrupo: a.isGrupo,
        isMarco: a.isMarco,
        isIndireta: a.isIndireta,
        // Campo necessário para a aba "Diagrama de Rede" do portal
        // (AbaDiagramaRede em PortalPlanejamentoCliente filtra por a.predecessora).
        // Sem isso, todas as atividades caem no else "Nenhuma atividade com
        // predecessora cadastrada" mesmo com dependências cadastradas no
        // módulo interno de Planejamento.
        predecessora: a.predecessora ?? null,
      }));

      // Avanços (último percentual acumulado por atividade)
      const avancosRaw = await db.select().from(planejamentoAvancos)
        .where(eq(planejamentoAvancos.revisaoId, revisao.id));

      const ultimoAvancoPorAtiv: Record<number, number> = {};
      for (const av of avancosRaw) {
        const id = av.atividadeId as number;
        const pct = Number(av.percentualAcumulado || 0);
        if (ultimoAvancoPorAtiv[id] === undefined || pct > ultimoAvancoPorAtiv[id]) {
          ultimoAvancoPorAtiv[id] = pct;
        }
      }

      // ────────────────────────────────────────────────────────────────────
      // KPIs e Curva S — IDÊNTICOS à tela interna de Planejamento.
      // Replicamos exatamente: helpers (toMondayStr, T12:00:00Z), regra
      // `usarIgual` (fallback de peso quando <20% das atividades têm peso),
      // buckets semanais alinhados à segunda, snapshot de realizado por
      // semana com `<=` (igual ao `getCurvaS` interno).
      // Filtro de folhas: !isGrupo && !isIndireta && datas válidas
      // (disabled já foi excluído pela query). ────────────────────────────
      const todayStr = new Date().toISOString().slice(0, 10);
      const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim);

      // ALINHAMENTO COM TELA INTERNA (PlanejamentoDetalhe.tsx calcPesoTotal):
      // semPeso só quando pesoBruto === 0 (TODAS sem peso). Removido o limiar
      // de <20% que existia antes e causava divergência (2,19% portal vs
      // 1,84% interno) quando a obra tinha algumas atividades sem peso.
      const pesoBruto = folhas.reduce((s: number, a: any) => s + _n(a.pesoFinanceiro), 0);
      const usarIgual = pesoBruto === 0;
      const pesoTotal = usarIgual ? (folhas.length || 1) : pesoBruto;
      const pesoDe = (a: any) => usarIgual ? 1 : _n(a.pesoFinanceiro);

      // Semana atual (segunda → domingo, igual ao interno)
      const today = new Date();
      const dow = today.getDay();
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(today); monday.setDate(today.getDate() + diffToMon);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      const monStr = monday.toISOString().slice(0, 10);
      const sunStr = sunday.toISOString().slice(0, 10);
      // % Previsto — referenciado ao FIM da semana atual (próxima segunda 12:00),
      // exatamente como `avancoPrevistoDia` interno (PlanejamentoDetalhe.tsx ~395).
      const refDate = new Date(monStr + "T12:00:00Z"); refDate.setUTCDate(refDate.getUTCDate() + 7);
      const refMs = refDate.getTime();
      let somaPrevisto = 0;
      let somaRealizado = 0;
      for (const a of folhas) {
        const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
        const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
        let exp = 0;
        if (refMs >= fim) exp = 100;
        else if (refMs > ini) exp = Math.min(100, ((refMs - ini) / (fim - ini)) * 100);
        const peso = pesoDe(a);
        somaPrevisto += (exp * peso) / pesoTotal;
        somaRealizado += (ultimoAvancoPorAtiv[a.id] ?? 0) * (peso / pesoTotal);
      }
      // ALINHAMENTO COM TELA INTERNA (PlanejamentoDetalhe.tsx Rev. 1470+):
      // - avancoPrevistoDia agora usa toFixed(2) para bater exatamente com REFIS.
      // - Portal deve refletir o MESMO número visto no módulo Planejamento interno.
      const pctTotalPrevisto = +Math.min(100, somaPrevisto).toFixed(2);
      const pctTotalRealizado = +Math.min(100, somaRealizado).toFixed(2);
      const desvio = +(pctTotalRealizado - pctTotalPrevisto).toFixed(2);

      // Semana atual: atividades cuja janela toca [seg, dom]
      const semanaAtual = folhas.filter((a: any) =>
        a.dataFim! >= monStr && a.dataInicio! <= sunStr
      ).map((a: any) => ({ ...a, percentRealizado: ultimoAvancoPorAtiv[a.id] ?? 0 }));

      // Atrasadas: dataFim < hoje E avanço < 100
      // Marcos (duração zero — dataInicio === dataFim) NÃO entram, pois são
      // pontos de referência do MS Project (ex.: "Início", "Fim do projeto"),
      // não atividades executáveis.
      const atrasadas = folhas.filter((a: any) =>
        a.dataFim! < todayStr
        && (ultimoAvancoPorAtiv[a.id] ?? 0) < 100
        && a.dataInicio !== a.dataFim
      ).map((a: any) => ({ ...a, percentRealizado: ultimoAvancoPorAtiv[a.id] ?? 0 }))
       .sort((x: any, y: any) => x.dataFim!.localeCompare(y.dataFim!))
       .slice(0, 20);

      // Próximas: dataInicio > domingo da semana atual
      const proximas = folhas.filter((a: any) => a.dataInicio! > sunStr)
        .sort((x: any, y: any) => x.dataInicio!.localeCompare(y.dataInicio!))
        .slice(0, 15);

      // ── Curva S (mesma lógica de planejamento.ts ~1244) ────────────────
      // Curva planejada: distribui peso/duração pelas semanas (alinhadas à seg)
      const dates: Map<string, number> = new Map();
      for (const a of folhas) {
        const inicioP = new Date(_toDateStr(a.dataInicio) + "T12:00:00Z");
        const fimP = new Date(_toDateStr(a.dataFim) + "T12:00:00Z");
        if (isNaN(inicioP.getTime()) || isNaN(fimP.getTime())) continue;
        const inicioSeg = new Date(_toMondayStr(inicioP) + "T12:00:00Z");
        const fimSeg = new Date(_toMondayStr(fimP) + "T12:00:00Z");
        const weeksDiff = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000);
        const dur = Math.max(1, weeksDiff + 1);
        const semPesoVal = (pesoDe(a) / dur / pesoTotal) * 100;
        let cur = new Date(inicioSeg);
        for (let i = 0; i < dur; i++) {
          const key = _toMondayStr(cur);
          dates.set(key, (dates.get(key) ?? 0) + semPesoVal);
          cur = new Date(cur.getTime() + 7 * 86400000);
        }
      }
      const sortedSem = [...dates.entries()].sort((x, y) => x[0].localeCompare(y[0]));
      const previstoMap: Record<string, number> = {};
      let acumP = 0;
      for (const [sem, val] of sortedSem) {
        acumP = Math.min(100, acumP + val);
        previstoMap[sem] = +acumP.toFixed(2);
      }
      // Avanços normalizados → semana sempre na segunda-feira correspondente
      const avancos = avancosRaw.map((av: any) => ({
        atividadeId: av.atividadeId as number,
        semana: _toMondayStr(new Date(_toDateStr(av.semana) + "T12:00:00Z")),
        pct: _n(av.percentualAcumulado),
      }));
      const semanasComAvanco = [...new Set(avancos.map((a) => a.semana))].sort();
      const realizadoMap: Record<string, number> = {};
      for (const sem of semanasComAvanco) {
        const latest: Record<number, { val: number; sem: string }> = {};
        for (const av of avancos) {
          if (av.semana <= sem) {
            if (!latest[av.atividadeId] || av.semana > latest[av.atividadeId].sem) {
              latest[av.atividadeId] = { val: av.pct, sem: av.semana };
            }
          }
        }
        let soma = 0;
        for (const a of folhas) {
          soma += (latest[a.id]?.val ?? 0) * (pesoDe(a) / pesoTotal);
        }
        realizadoMap[sem] = +Math.min(100, soma).toFixed(2);
      }
      // Une as semanas (previsto ∪ realizado), gera curva sequencial
      const todasSemanas = [...new Set([...Object.keys(previstoMap), ...Object.keys(realizadoMap)])].sort();
      const todayMon = _toMondayStr(new Date(todayStr + "T12:00:00Z"));
      let prevAcumLast = 0;
      let realAcumLast: number | null = null;
      const curvaS: { semana: string; previsto: number; realizado: number | null }[] = [];
      // Adiciona semana zero (segunda anterior à primeira)
      if (todasSemanas.length > 0) {
        const prim = new Date(todasSemanas[0] + "T12:00:00Z");
        const semZero = _toMondayStr(new Date(prim.getTime() - 7 * 86400000));
        curvaS.push({ semana: semZero, previsto: 0, realizado: 0 });
      }
      for (const sem of todasSemanas) {
        if (previstoMap[sem] !== undefined) prevAcumLast = previstoMap[sem];
        if (realizadoMap[sem] !== undefined) realAcumLast = realizadoMap[sem];
        // Realizado só aparece em semanas <= hoje (não exibe progresso futuro)
        const realizadoOut = sem <= todayMon ? (realAcumLast ?? 0) : null;
        curvaS.push({ semana: sem, previsto: prevAcumLast, realizado: realizadoOut });
      }

      // ── Curva S de Trabalho (4 séries, alinhada ao getCurvaS interno) ──
      const baselineRev = revisoesHist.find((r: any) => r.isBaseline) || revisoesHist[revisoesHist.length - 1];
      const isBaselineCurrent = baselineRev?.id === revisao.id;
      async function computeCurvaPlanejada(revId: number) {
        const ativs = await db.select().from(planejamentoAtividades)
          .where(and(eq(planejamentoAtividades.revisaoId, revId), eq(planejamentoAtividades.disabled, false)));
        const folhasL = ativs.filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim);
        if (!folhasL.length) return [];
        const pesoBrutoL = folhasL.reduce((s: number, a: any) => s + _n(a.pesoFinanceiro), 0);
        const usarIgualL = pesoBrutoL === 0;
        const pesoTotalL = usarIgualL ? folhasL.length : pesoBrutoL;
        const datesL: Map<string, number> = new Map();
        for (const a of folhasL as any[]) {
          const ini = new Date(_toDateStr(a.dataInicio) + "T12:00:00Z");
          const fim = new Date(_toDateStr(a.dataFim) + "T12:00:00Z");
          if (isNaN(ini.getTime()) || isNaN(fim.getTime())) continue;
          const iniSeg = new Date(_toMondayStr(ini) + "T12:00:00Z");
          const fimSeg = new Date(_toMondayStr(fim) + "T12:00:00Z");
          const wd = (fimSeg.getTime() - iniSeg.getTime()) / (7 * 86400000);
          const dur = Math.max(1, wd + 1);
          const pAtiv = usarIgualL ? 1 : _n(a.pesoFinanceiro);
          const semVal = (pAtiv / dur / pesoTotalL) * 100;
          let cur = new Date(iniSeg);
          for (let i = 0; i < dur; i++) {
            const key = _toMondayStr(cur);
            datesL.set(key, (datesL.get(key) ?? 0) + semVal);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        }
        const sortedL = [...datesL.entries()].sort((x, y) => x[0].localeCompare(y[0]));
        if (sortedL.length === 0) return [];
        const primeira = sortedL[0][0];
        const semZero = _toMondayStr(new Date(new Date(primeira + "T12:00:00Z").getTime() - 7 * 86400000));
        let acumL = 0;
        const ptsL: { semana: string; acumulado: number }[] = [{ semana: semZero, acumulado: 0 }];
        for (const [sem, val] of sortedL) {
          acumL = Math.min(100, acumL + val);
          ptsL.push({ semana: sem, acumulado: +acumL.toFixed(2) });
        }
        return ptsL;
      }
      const curvaBaseline = baselineRev ? await computeCurvaPlanejada(baselineRev.id) : [];
      const curvaPlanejadaSep = (baselineRev && !isBaselineCurrent) ? await computeCurvaPlanejada(revisao.id) : [];

      const curvaRealizadaSerie: { semana: string; acumulado: number }[] = [];
      for (const sem of semanasComAvanco) {
        curvaRealizadaSerie.push({ semana: sem, acumulado: realizadoMap[sem] });
      }
      if (curvaRealizadaSerie.length > 0 && curvaRealizadaSerie[0].acumulado !== 0) {
        const prim = new Date(curvaRealizadaSerie[0].semana + "T12:00:00Z");
        const semAnt = _toMondayStr(new Date(prim.getTime() - 7 * 86400000));
        curvaRealizadaSerie.unshift({ semana: semAnt, acumulado: 0 });
      }

      let curvaTendencia: { semana: string; acumulado: number }[] = [];
      if (curvaRealizadaSerie.length >= 2) {
        const nn = curvaRealizadaSerie.length;
        const xs = curvaRealizadaSerie.map((_, i) => i);
        const ys = curvaRealizadaSerie.map((p) => p.acumulado);
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const denom = nn * sumX2 - sumX * sumX;
        if (denom !== 0) {
          const slope = (nn * sumXY - sumX * sumY) / denom;
          const inter = (sumY - slope * sumX) / nn;
          const lastReal = curvaRealizadaSerie[curvaRealizadaSerie.length - 1];
          const lastDate = new Date(lastReal.semana + "T12:00:00Z");
          curvaTendencia = curvaRealizadaSerie.map((p) => ({ ...p }));
          for (let w = 1; w <= 16; w++) {
            const proj = inter + slope * (nn - 1 + w);
            if (proj >= 100) break;
            const d = new Date(lastDate.getTime() + w * 7 * 86400000);
            curvaTendencia.push({
              semana: d.toISOString().split("T")[0],
              acumulado: Math.min(100, +proj.toFixed(2)),
            });
          }
        }
      }
      const curvaData = {
        curvaBaseline,
        curvaPlanejada: curvaPlanejadaSep,
        curvaRealizada: curvaRealizadaSerie,
        curvaTendencia,
      };

      // ── REFIS lançados (mais recentes primeiro) ─────────────────────────
      const refisRows = await db.select().from(planejamentoRefis)
        .where(eq(planejamentoRefis.projetoId, projeto.id))
        .orderBy(desc(planejamentoRefis.semana));
      const refisLista = refisRows.map((r: any) => ({
        id: r.id,
        numero: r.numero,
        semana: _toDateStr(r.semana),
        dataEmissao: _toDateStr(r.dataEmissao),
        avancoPrevisto: _n(r.avancoPrevisto),
        avancoRealizado: _n(r.avancoRealizado),
        avancoSemanalPrevisto: _n(r.avancoSemanalPrevisto),
        avancoSemanalRealizado: _n(r.avancoSemanalRealizado),
        spi: _n(r.spi),
        cpi: _n(r.cpi),
        observacoes: r.observacoes,
        status: r.status,
      }));

      // ── Caminho Crítico — atividades não-concluídas ordenadas por
      // criticidade (atrasadas primeiro, depois com folga negativa). ─────
      const caminhoCritico = folhas
        .map((a: any) => {
          const real = ultimoAvancoPorAtiv[a.id] ?? 0;
          const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
          const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
          const tod = new Date(todayStr + "T12:00:00Z").getTime();
          const duracaoDias = Math.max(1, Math.round((fim - ini) / 86400000));
          // Previsto linear até hoje
          let pctPrev = 0;
          if (tod >= fim) pctPrev = 100;
          else if (tod > ini) pctPrev = ((tod - ini) / (fim - ini)) * 100;
          const desvio = real - pctPrev;
          const isAtrasada = a.dataFim < todayStr && real < 100;
          const isCritica = isAtrasada || (desvio < -10 && real < 100);
          // Folga em dias (estimada): quanto tempo a atividade poderia atrasar
          // antes de comprometer o prazo (aproximação simples: se desvio<0, folga=0)
          const folgaDias = isAtrasada
            ? Math.round((tod - fim) / 86400000) * -1
            : Math.max(0, Math.round((fim - tod) / 86400000));
          return {
            ...a,
            percentRealizado: real,
            percentPrevisto: +pctPrev.toFixed(2),
            desvio: +desvio.toFixed(2),
            duracaoDias,
            folgaDias,
            isCritica,
            isAtrasada,
          };
        })
        .filter((a: any) => a.percentRealizado < 100)
        .sort((a: any, b: any) => {
          // Atrasadas primeiro, depois por desvio mais negativo
          if (a.isAtrasada && !b.isAtrasada) return -1;
          if (!a.isAtrasada && b.isAtrasada) return 1;
          return a.desvio - b.desvio;
        })
        .slice(0, 50);

      // ── Efetivo (custos de Mão de Obra agrupados por mês/tipo) ─────────
      const custosMoRaw = await db.select().from(planejamentoCustosMo)
        .where(eq(planejamentoCustosMo.projetoId, projeto.id));
      const efetivoPorMes: Record<string, { mesReferencia: string; direto: number; indireto: number; central: number; total: number }> = {};
      for (const c of custosMoRaw) {
        const mes = c.mesReferencia;
        if (!efetivoPorMes[mes]) {
          efetivoPorMes[mes] = { mesReferencia: mes, direto: 0, indireto: 0, central: 0, total: 0 };
        }
        const valor = _n(c.custo);
        if (c.tipo === "direto") efetivoPorMes[mes].direto += valor;
        else if (c.tipo?.startsWith("indireta")) efetivoPorMes[mes].indireto += valor;
        else if (c.tipo?.includes("central")) efetivoPorMes[mes].central += valor;
        efetivoPorMes[mes].total += valor;
      }
      const efetivoMensal = Object.values(efetivoPorMes).sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));

      // ── Curva de Medições (faturamento mensal real) ─────────────────────
      const medRows = await db.select().from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, projeto.id))
        .orderBy(planejamentoMedicoes.competencia);
      let acumMed = 0;
      const curvaMedicoes = medRows.map((m: any) => {
        acumMed += _n(m.valorMedido);
        return {
          competencia: m.competencia,
          valorMedido: _n(m.valorMedido),
          valorAcumulado: +acumMed.toFixed(2),
          status: m.status ?? "pendente",
        };
      });

      // Próximas 3 semanas (para "Prog. Semanal") — janela seg→domingo+14
      const tresSemanasFim = new Date(sunday); tresSemanasFim.setDate(sunday.getDate() + 14);
      const tresSemFimStr = tresSemanasFim.toISOString().slice(0, 10);
      const progSemanal = folhas.filter((a: any) =>
        a.dataInicio! <= tresSemFimStr && a.dataFim! >= monStr
      ).map((a: any) => ({ ...a, percentRealizado: ultimoAvancoPorAtiv[a.id] ?? 0 }))
       .sort((x: any, y: any) => x.dataInicio!.localeCompare(y.dataInicio!));

      return {
        obra,
        abasLiberadas,
        projeto: {
          id: projeto.id, nome: projeto.nome, dataInicio: projeto.dataInicio,
          dataTerminoContratual: projeto.dataTerminoContratual, status: projeto.status,
          valorContrato: _n((projeto as any).valorContrato),
          // Rev. 1535 — Curva S Financeira: cliente precisa do total de venda
          // do orçamento vinculado para escalar % → R$ (mesma lógica do
          // PlanejamentoDetalhe interno: prefere orcamento.totalVenda, cai
          // pra valorContrato se não houver orçamento). Sem isso, a aba
          // Curva S Financeira do portal mostra "Sem valor de contrato
          // cadastrado" mesmo com orçamento bem definido.
          orcamentoTotalVenda: orcTotalVenda,
          revisaoNumero: revisao.numero, revisaoData: revisao.dataRevisao,
          // Rev. 1534 — Janela de Recovery Schedule (AACE 23R-02). Cliente vê o
          // compromisso que o engenheiro definiu pra diluir o atraso.
          recoveryWindowSemanas: (revisao as any).recoveryWindowSemanas ?? 4,
        },
        kpis: (() => {
          // Rev. 1539 — Top bar SEMPRE usa cálculo ao vivo (alinhado com o
          // módulo interno "Avanço Físico" e com o card "REALIZADO (ACUM.)"
          // logo abaixo na própria tela). Antes, quando havia um REFIS
          // emitido, o portal congelava o número do último REFIS — o que
          // gerava divergência confusa pro cliente: topo mostrava 1,05%
          // (REFIS antigo) e logo abaixo "REALIZADO NA SEMANA" mostrava
          // 1,38% (atual). O REFIS continua sendo a referência histórica
          // oficial, exibido na aba REFIS, mas o "Avanço Físico" do topo
          // reflete o estado ATUAL da obra, igual no módulo interno.
          const refisOficial = refisRows.find((r: any) => r.status && r.status !== "rascunho")
            ?? refisRows[0];
          return {
            previsto: pctTotalPrevisto,
            realizado: pctTotalRealizado,
            desvio: +(pctTotalRealizado - pctTotalPrevisto).toFixed(2),
            totalAtividades: folhas.length,
            atividadesConcluidas: folhas.filter((a: any) => (ultimoAvancoPorAtiv[a.id] ?? 0) >= 100).length,
            semanaInicio: monStr,
            semanaFim: sunStr,
            // Sempre cálculo ao vivo agora; metadados do último REFIS ainda
            // expostos para a legenda histórica.
            fonte: "calculo_ao_vivo",
            refisSemana: refisOficial ? _toDateStr(refisOficial.semana) : null,
            refisNumero: refisOficial ? refisOficial.numero ?? null : null,
          };
        })(),
        semanaAtual,
        atrasadas,
        proximas,
        progSemanal,
        curvaS,
        curvaData,
        curvaMedicoes,
        refisLista,
        caminhoCritico,
        efetivoMensal,
        atividadesTodas: atividades.map((a: any) => ({ ...a, percentRealizado: ultimoAvancoPorAtiv[a.id] ?? 0 })),
        revisoes: revisoesHist.map((r: any) => ({
          id: r.id,
          numero: r.numero,
          isBaseline: !!r.isBaseline,
          descricao: r.descricao,
          dataRevisao: r.dataRevisao,
          motivo: r.motivo,
          responsavel: r.responsavel,
          aprovadoPor: r.aprovadoPor,
          status: r.status,
          observacao: r.observacao,
          consolidado: r.consolidado,
          diferencas: r.diferencas,
          criadoEm: r.criadoEm,
          ativa: r.id === (revisao?.id ?? null),
        })),
      };
    }),

    // ── Documentos RH dos funcionários alocados na obra (ASOs/Treinamentos) ──
    // Rev. 1553: Removidos atestados e advertências da resposta — informações
    // internas (saúde do funcionário e questões disciplinares) que NÃO devem
    // ser expostas ao cliente. Mantemos apenas ASO (segurança ocupacional)
    // e treinamentos NR (qualificação/segurança), que são compromissos
    // contratuais legítimos de comprovar ao cliente.
    documentosRhObra: publicProcedure.input(z.object({
      token: z.string(),
      obraId: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });

      // Valida que a obra pertence ao cliente (mesma regra)
      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const [obra] = await db.select().from(obras).where(and(
        eq(obras.id, input.obraId),
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (!obra) throw new TRPCError({ code: "FORBIDDEN", message: "Obra não vinculada" });

      // Funcionários CLT alocados nesta obra (somente ativos)
      const equipe = await getEquipeObra(input.obraId, decoded.companyId);
      const empIds = equipe.map((e: any) => e.id).filter(Boolean);
      const today = new Date().toISOString().slice(0, 10);

      let asoMap = new Map<number, any>();
      let trainMap = new Map<number, any[]>();
      // Rev. 1590 — Integração de Segurança SST por funcionário (último aprovado).
      let integMap = new Map<number, any>();

      if (empIds.length > 0) {
        // ASO mais recente (vigente) por funcionário
        // Rev. 1555: incluímos id e flag "temPdf" (boolean) — NÃO expomos a
        // URL real do storage. Para visualizar, o front chama o endpoint
        // /api/portal/cliente/documento/aso/:id que faz proxy autenticado.
        const asoRows = await db.select({
          id: asos.id,
          employeeId: asos.employeeId, tipo: asos.tipo, dataExame: asos.dataExame,
          dataValidade: asos.dataValidade, resultado: asos.resultado,
          documentoUrl: asos.documentoUrl,
        }).from(asos).where(and(
          eq(asos.companyId, decoded.companyId),
          inArray(asos.employeeId, empIds),
          isNull(asos.deletedAt),
        )).orderBy(desc(asos.dataExame));
        for (const r of asoRows) if (!asoMap.has(r.employeeId)) asoMap.set(r.employeeId, r);

        // Treinamentos vigentes
        const trainRows = await db.select({
          id: trainings.id,
          employeeId: trainings.employeeId, nome: trainings.nome, norma: trainings.norma,
          dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade,
          statusTreinamento: trainings.statusTreinamento,
          certificadoUrl: trainings.certificadoUrl,
        }).from(trainings).where(and(
          eq(trainings.companyId, decoded.companyId),
          inArray(trainings.employeeId, empIds),
          isNull(trainings.deletedAt),
        )).orderBy(desc(trainings.dataRealizacao));
        for (const r of trainRows) {
          const arr = trainMap.get(r.employeeId) || [];
          arr.push(r); trainMap.set(r.employeeId, arr);
        }

        // Rev. 1590 — Integração SST: pega o último registro APROVADO por
        // funcionário (mais recente). No portal do cliente só exibimos a
        // data de validade — alerta de 30 dias é só pra engenheiro.
        const integRows = await db.select({
          id: sstIntegracaoRegistros.id,
          employeeId: sstIntegracaoRegistros.employeeId,
          dataRealizacao: sstIntegracaoRegistros.dataRealizacao,
          dataValidade: sstIntegracaoRegistros.dataValidade,
          status: sstIntegracaoRegistros.status,
          certificadoUrl: sstIntegracaoRegistros.certificadoUrl,
        }).from(sstIntegracaoRegistros).where(and(
          eq(sstIntegracaoRegistros.companyId, decoded.companyId),
          inArray(sstIntegracaoRegistros.employeeId, empIds),
          eq(sstIntegracaoRegistros.status, "aprovado"),
          isNull(sstIntegracaoRegistros.deletedAt),
        )).orderBy(desc(sstIntegracaoRegistros.dataRealizacao));
        for (const r of integRows) if (!integMap.has(r.employeeId)) integMap.set(r.employeeId, r);
      }

      const funcionarios = equipe.map((e: any) => {
        const aso = asoMap.get(e.id);
        const trains = trainMap.get(e.id) || [];
        const integ = integMap.get(e.id);
        const asoStatus = aso ? (aso.dataValidade && aso.dataValidade < today ? "vencido" : "vigente") : "sem_aso";
        const trainsVigentes = trains.filter((t: any) => !t.dataValidade || t.dataValidade >= today);
        const trainsVencidos = trains.filter((t: any) => t.dataValidade && t.dataValidade < today);
        // Rev. 1560 — status agregado de treinamento por funcionário,
        // mesmo padrão do asoStatus, pra alimentar os novos KPIs/filtros:
        // - sem_treinamento: não tem nenhum treinamento cadastrado
        // - treinamento_vencido: tem 1+ treinamento vencido (mesmo que tenha
        //   outros vigentes — a obra precisa renovar)
        // - treinamento_vigente: tem treinamentos e nenhum vencido
        const trainStatus: "sem_treinamento" | "treinamento_vencido" | "treinamento_vigente" =
          trains.length === 0 ? "sem_treinamento"
          : trainsVencidos.length > 0 ? "treinamento_vencido"
          : "treinamento_vigente";
        return {
          id: e.id,
          nome: e.nomeCompleto,
          funcao: e.funcao || e.cargo,
          status: e.status,
          fotoUrl: e.fotoUrl || null,
          aso: aso ? {
            id: aso.id,
            tipo: aso.tipo, dataExame: aso.dataExame, dataValidade: aso.dataValidade,
            resultado: aso.resultado, status: asoStatus,
            temPdf: !!aso.documentoUrl,
          } : null,
          asoStatus,
          treinamentosVigentes: trainsVigentes.length,
          treinamentosVencidos: trainsVencidos.length,
          trainStatus,
          treinamentos: trains.slice(0, 20).map((t: any) => ({
            id: t.id,
            nome: t.nome, norma: t.norma,
            dataRealizacao: t.dataRealizacao, dataValidade: t.dataValidade,
            statusTreinamento: t.statusTreinamento,
            // Rev. 1560 — status efetivo (vencido/vigente) calculado no
            // servidor pra garantir consistência com os KPIs.
            status: (t.dataValidade && t.dataValidade < today) ? "vencido" : "vigente",
            temPdf: !!t.certificadoUrl,
          })),
          // Rev. 1590 — Integração de Segurança SST. Portal só exibe data de
          // validade (sem alerta). Status "vencido" calculado no servidor.
          integracao: integ ? {
            id: integ.id,
            dataRealizacao: integ.dataRealizacao ? String(integ.dataRealizacao).slice(0, 10) : null,
            dataValidade: integ.dataValidade ? String(integ.dataValidade).slice(0, 10) : null,
            status: (integ.dataValidade && String(integ.dataValidade).slice(0, 10) < today) ? "vencido" : "vigente",
            temPdf: !!integ.certificadoUrl,
          } : null,
        };
      });

      const totais = {
        funcionarios: funcionarios.length,
        asoVigente: funcionarios.filter(f => f.asoStatus === "vigente").length,
        asoVencido: funcionarios.filter(f => f.asoStatus === "vencido").length,
        semAso: funcionarios.filter(f => f.asoStatus === "sem_aso").length,
        // Rev. 1560 — totais de treinamento (alinhado com aba SST do Planejamento).
        treinVigente: funcionarios.filter(f => f.trainStatus === "treinamento_vigente").length,
        treinVencido: funcionarios.filter(f => f.trainStatus === "treinamento_vencido").length,
        semTreinamento: funcionarios.filter(f => f.trainStatus === "sem_treinamento").length,
      };
      return { funcionarios, totais };
    }),

    // ── Projetos / Documentos Técnicos da obra (gd_documentos) ──
    projDocObra: publicProcedure.input(z.object({
      token: z.string(),
      obraId: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });

      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const [obra] = await db.select().from(obras).where(and(
        eq(obras.id, input.obraId),
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (!obra) throw new TRPCError({ code: "FORBIDDEN", message: "Obra não vinculada" });

      const docs = await db.select({
        id: gdDocumentos.id,
        codigo: gdDocumentos.codigo,
        titulo: gdDocumentos.titulo,
        descricao: gdDocumentos.descricao,
        status: gdDocumentos.status,
        revisaoAtual: gdDocumentos.revisaoAtual,
        emitente: gdDocumentos.emitente,
        dataEmissao: gdDocumentos.dataEmissao,
        dataValidade: gdDocumentos.dataValidade,
        arquivoUrl: gdDocumentos.arquivoUrl,
        arquivoNome: gdDocumentos.arquivoNome,
        // Rev. 1562 — campos extras p/ paridade com o módulo Documentos.
        arquivoTamanho: gdDocumentos.arquivoTamanho,
        subpasta: gdDocumentos.subpasta,
        disciplinaId: gdDocumentos.disciplinaId,
        tipoDocumentoId: gdDocumentos.tipoDocumentoId,
        criadoEm: gdDocumentos.criadoEm,
        atualizadoEm: gdDocumentos.atualizadoEm,
      }).from(gdDocumentos).where(and(
        eq(gdDocumentos.companyId, decoded.companyId),
        eq(gdDocumentos.obraId, input.obraId),
        isNull(gdDocumentos.deletedAt),
      )).orderBy(desc(gdDocumentos.atualizadoEm));

      // Tipos para legenda (sigla)
      const tiposIds = Array.from(new Set(docs.map(d => d.tipoDocumentoId).filter(Boolean) as number[]));
      let tiposMap = new Map<number, { nome: string; sigla: string }>();
      if (tiposIds.length > 0) {
        const tipos = await db.select({ id: gdTiposDocumento.id, nome: gdTiposDocumento.nome, sigla: gdTiposDocumento.sigla })
          .from(gdTiposDocumento).where(inArray(gdTiposDocumento.id, tiposIds));
        tipos.forEach(t => tiposMap.set(t.id, { nome: t.nome, sigla: t.sigla }));
      }
      // Rev. 1562 — Disciplinas (nome + sigla + cor) p/ exibir badge no
      // detalhe do documento. Restringe ao mesmo companyId.
      const discIds = Array.from(new Set(docs.map(d => d.disciplinaId).filter(Boolean) as number[]));
      let discMap = new Map<number, { nome: string; sigla: string; cor: string | null }>();
      if (discIds.length > 0) {
        const ds = await db.select({ id: gdDisciplinas.id, nome: gdDisciplinas.nome, sigla: gdDisciplinas.sigla, cor: gdDisciplinas.cor })
          .from(gdDisciplinas).where(and(
            eq(gdDisciplinas.companyId, decoded.companyId),
            inArray(gdDisciplinas.id, discIds),
          ));
        ds.forEach(d => discMap.set(d.id, { nome: d.nome, sigla: d.sigla, cor: d.cor }));
      }
      // Rev. 1561 — não expõe a URL real do arquivo; o front passa a usar
      // o endpoint autenticado /api/portal/cliente/projdoc/:id. Devolvemos
      // só extensão e nome para a UI decidir (Abrir PDF vs Baixar DWG/etc.).
      const getExt = (u?: string | null, n?: string | null): string => {
        const src = (n || u || "").split("?")[0];
        const dot = src.lastIndexOf(".");
        return dot >= 0 ? src.slice(dot + 1).toLowerCase() : "";
      };
      const documentos = docs.map(d => {
        const extensao = getExt(d.arquivoUrl, d.arquivoNome);
        const { arquivoUrl: _ignored, ...rest } = d as any;
        const disc = d.disciplinaId ? discMap.get(d.disciplinaId) : null;
        return {
          ...rest,
          tipoNome: d.tipoDocumentoId ? (tiposMap.get(d.tipoDocumentoId)?.nome || "—") : "—",
          tipoSigla: d.tipoDocumentoId ? (tiposMap.get(d.tipoDocumentoId)?.sigla || "") : "",
          disciplinaNome: disc?.nome || null,
          disciplinaSigla: disc?.sigla || null,
          disciplinaCor: disc?.cor || null,
          temArquivo: !!d.arquivoUrl,
          extensao,
          podeVisualizarInline: ["pdf", "jpg", "jpeg", "png", "webp"].includes(extensao),
        };
      });

      const totais = {
        total: documentos.length,
        aprovados: documentos.filter(d => d.status === "aprovado").length,
        emRevisao: documentos.filter(d => d.status === "em_revisao").length,
        emElaboracao: documentos.filter(d => d.status === "em_elaboracao").length,
        reprovados: documentos.filter(d => d.status === "reprovado").length,
      };
      return { documentos, totais };
    }),

    // Rev. 1562 — Histórico de revisões de um documento (read-only).
    // Espelha o gestaoDocumentos.listRevisoes do módulo principal, mas
    // valida que o documento pertence a uma obra do cliente do token.
    projDocRevisoes: publicProcedure.input(z.object({
      token: z.string(),
      documentoId: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });

      const [c] = await db.select().from(clientes).where(eq(clientes.id, decoded.clienteId));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const obrasCliente = await db.select({ id: obras.id }).from(obras).where(and(
        eq(obras.companyId, decoded.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      ));
      if (obrasCliente.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
      const obraIds = obrasCliente.map((o) => o.id);

      // Confirma que o documento é de uma obra do cliente
      const [doc] = await db.select({
        id: gdDocumentos.id,
        revisaoAtual: gdDocumentos.revisaoAtual,
        titulo: gdDocumentos.titulo,
        codigo: gdDocumentos.codigo,
      }).from(gdDocumentos).where(and(
        eq(gdDocumentos.id, input.documentoId),
        eq(gdDocumentos.companyId, decoded.companyId),
        inArray(gdDocumentos.obraId, obraIds),
        isNull(gdDocumentos.deletedAt),
      ));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

      const revs = await db.select({
        id: gdRevisoes.id,
        numero: gdRevisoes.numero,
        descricao: gdRevisoes.descricao,
        status: gdRevisoes.status,
        arquivoNome: gdRevisoes.arquivoNome,
        arquivoTamanho: gdRevisoes.arquivoTamanho,
        motivoRevisao: gdRevisoes.motivoRevisao,
        aprovadoEm: gdRevisoes.aprovadoEm,
        criadoEm: gdRevisoes.criadoEm,
        // arquivoUrl propositalmente fora — revisões antigas ficam read-only
        // sem download direto (na portal v1.562). Se quiser permitir baixar
        // depois, criamos endpoint específico /api/portal/cliente/projdoc-rev/:id
      }).from(gdRevisoes).where(and(
        eq(gdRevisoes.companyId, decoded.companyId),
        eq(gdRevisoes.documentoId, input.documentoId),
      )).orderBy(desc(gdRevisoes.criadoEm));

      return { revisoes: revs, revisaoAtual: doc.revisaoAtual || "0" };
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
