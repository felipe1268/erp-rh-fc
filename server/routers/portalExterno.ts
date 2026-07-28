import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb, getEquipeObra } from "../db";
import { portalCredentials, funcionariosTerceiros, empresasTerceiras, parceirosConveniados, lancamentosParceiros, employees, employeeAptidao, companies, clientes, obras, clienteComentarios, clienteAvaliacoes, clienteAvaliacaoDetalhes, portalClienteConfig, clientePerguntasExtras, clienteRespostasExtras, portalPasswordResets, planejamentoProjetos, planejamentoRevisoes, planejamentoAtividades, planejamentoAvancos, planejamentoRefis, planejamentoCustosMo, planejamentoMedicoes, asos, atestados, trainings, warnings, obraFuncionarios, gdDocumentos, gdRevisoes, gdTiposDocumento, gdDisciplinas, jobFunctions, orcamentos, sstIntegracaoRegistros, employeeIntegrations, users, userCompanies } from "../../drizzle/schema";
import { systemCriteria } from "../../drizzle/schema";
import { eq, and, or, inArray, desc, sql, isNull, ilike } from "drizzle-orm";
import { getUserCompanyLinks } from "../db";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { storagePut } from "../storage";
import { sendEmail } from "../services/smtpService";
import crypto from "crypto";
import { invokeLLM } from "../_core/llm";

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

// Rev. 4696 — tenant guard: valida que o usuário tem acesso à empresa alvo.
async function assertCompanyAccessPE(ctx: { user?: { id?: number; role?: string | null } }, companyId: number) {
  if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctx.user.role === "admin" || ctx.user.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctx.user.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  // Sem vínculo com empresa alguma → nega (não-admin nunca tem acesso global)
  if (!new Set<number>(allowedIds).has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// Rev. 4696 — senha padrão CONFIGURÁVEL para acesso de PARCEIRO.
// Fonte: system_criteria chave 'portal_senha_padrao_parceiro' (por empresa).
// Default histórico: "mudar123". O reset SEMPRE define esta senha e força a
// troca no primeiro acesso (primeiroAcesso=1).
const SENHA_PADRAO_PARCEIRO_KEY = "portal_senha_padrao_parceiro";
const SENHA_PADRAO_PARCEIRO_DEFAULT = "mudar123";
async function getSenhaPadraoParceiro(db: any, companyId: number): Promise<string> {
  try {
    const rows = await db
      .select({ valor: systemCriteria.valor })
      .from(systemCriteria)
      .where(and(eq(systemCriteria.companyId, companyId), eq(systemCriteria.chave, SENHA_PADRAO_PARCEIRO_KEY)));
    const v = String(rows[0]?.valor ?? "").trim();
    if (v.length >= 6) return v;
  } catch (e) {
    console.warn("[portalExterno] falha ao ler senha padrão do parceiro; usando default", e);
  }
  return SENHA_PADRAO_PARCEIRO_DEFAULT;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

// Rev. 2851 — Whitelist de OBRAS por credencial do Portal do Cliente.
// Lê portal_credentials.obras_liberadas da credencial do token (portalId/credId).
// Retorna null = SEM restrição (todas as obras do cliente — backward compat);
// array = somente esses IDs ([] = nenhuma).
async function _obrasLiberadasDaCredencial(db: any, decoded: any): Promise<number[] | null> {
  const credId = decoded?.portalId ?? decoded?.credId;
  if (!credId) return null; // token antigo sem credId → não restringe (compat)
  const { parseObrasLiberadas } = await import("../../shared/portalClienteAbas");
  const [cred] = await db.select().from(portalCredentials).where(eq(portalCredentials.id, credId));
  if (!cred) return null;
  return parseObrasLiberadas((cred as any).obrasLiberadas);
}

// Lança FORBIDDEN se a obra não estiver liberada para a credencial do token.
async function _assertObraPermitida(db: any, decoded: any, obraId: number): Promise<void> {
  const wl = await _obrasLiberadasDaCredencial(db, decoded);
  if (wl === null) return; // todas liberadas
  if (!wl.includes(obraId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Obra não liberada para este usuário." });
  }
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
      await assertCompanyAccessPE(ctx as any, input.companyId);
      const cnpjClean = input.cnpj.replace(/\D/g, "");
      try {
        const existing = await db.select().from(portalCredentials).where(
          and(
            eq(portalCredentials.cnpj, cnpjClean),
            eq(portalCredentials.tipo, input.tipo),
            eq(portalCredentials.companyId, input.companyId),
          )
        );
        // Rev. 4696 — PARCEIRO usa a senha padrão configurável da empresa
        // (reset previsível; troca obrigatória no 1º acesso). Terceiro mantém
        // senha aleatória como antes.
        const senhaTemp = input.tipo === "parceiro"
          ? await getSenhaPadraoParceiro(db, input.companyId)
          : generateTempPassword();
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

    // Rev. 4696 — senha padrão configurável do acesso de parceiros
    getSenhaPadraoParceiro: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await assertCompanyAccessPE(ctx as any, input.companyId);
        return { senhaPadrao: await getSenhaPadraoParceiro(db, input.companyId) };
      }),

    setSenhaPadraoParceiro: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        senha: z.string().trim().min(6, "A senha padrão deve ter ao menos 6 caracteres").max(30, "Máximo 30 caracteres"),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await assertCompanyAccessPE(ctx as any, input.companyId);
        // Só administradores mudam a senha padrão (afeta todos os resets futuros)
        const role = (ctx as any).user?.role;
        if (role !== "admin" && role !== "admin_master") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem alterar a senha padrão." });
        }
        const senha = input.senha.trim();
        const existing = await db
          .select({ id: systemCriteria.id })
          .from(systemCriteria)
          .where(and(eq(systemCriteria.companyId, input.companyId), eq(systemCriteria.chave, SENHA_PADRAO_PARCEIRO_KEY)));
        if (existing.length > 0) {
          await db.update(systemCriteria).set({
            valor: senha,
            atualizadoPor: (ctx as any).user?.name || "Sistema",
            updatedAt: new Date().toISOString(),
          }).where(eq(systemCriteria.id, existing[0].id));
        } else {
          await db.insert(systemCriteria).values({
            companyId: input.companyId,
            categoria: "parceiros",
            chave: SENHA_PADRAO_PARCEIRO_KEY,
            valor: senha,
            descricao: "Senha padrão inicial ao gerar/resetar acesso do parceiro no Portal Externo (troca obrigatória no 1º acesso)",
            atualizadoPor: (ctx as any).user?.name || "Sistema",
          } as any);
        }
        return { success: true, senhaPadrao: senha };
      }),

    // Rev. 4696 — editar dados do acesso do PARCEIRO (nome/e-mail/ativo) sem resetar senha
    atualizarAcessoParceiro: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number(),
        nomeResponsavel: z.string().trim().max(120).nullish(),
        emailResponsavel: z.union([z.literal(""), z.string().trim().email("E-mail inválido")]).nullish(),
        ativo: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await assertCompanyAccessPE(ctx as any, input.companyId);
        const [cred] = await db.select().from(portalCredentials).where(eq(portalCredentials.id, input.id));
        if (!cred || (cred as any).companyId !== input.companyId || (cred as any).tipo !== "parceiro") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Acesso de parceiro não encontrado nesta empresa." });
        }
        const set: any = { updatedAt: new Date().toISOString() };
        if (input.nomeResponsavel !== undefined) set.nomeResponsavel = input.nomeResponsavel || null;
        if (input.emailResponsavel !== undefined) set.emailResponsavel = input.emailResponsavel || null;
        if (input.ativo !== undefined) set.ativo = input.ativo ? 1 : 0;
        await db.update(portalCredentials).set(set).where(eq(portalCredentials.id, input.id));
        return { success: true };
      }),

    // Rev. 4697 — Convite de boas-vindas ao PARCEIRO por e-mail.
    // Garante a credencial (cria com a senha padrão se não existir; NÃO reseta
    // senha de acesso já existente), grava o e-mail/nome do responsável e envia
    // o passo a passo com o link do portal.
    enviarConviteParceiro: protectedProcedure
      .input(z.object({
        parceiroId: z.number(),
        companyId: z.number(),
        email: z.string().trim().email("E-mail inválido"),
        nomeResponsavel: z.string().trim().max(120).optional(),
        portalBaseUrl: z.string().trim().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await assertCompanyAccessPE(ctx as any, input.companyId);

        const [parceiro] = await db.select().from(parceirosConveniados).where(and(
          eq(parceirosConveniados.id, input.parceiroId),
          eq(parceirosConveniados.companyId, input.companyId),
        ));
        if (!parceiro) throw new TRPCError({ code: "NOT_FOUND", message: "Parceiro não encontrado nesta empresa." });

        const cnpjClean = String((parceiro as any).cnpj || "").replace(/\D/g, "");
        if (!cnpjClean) throw new TRPCError({ code: "BAD_REQUEST", message: "Parceiro sem CNPJ cadastrado." });
        const nomeEmpresa = (parceiro as any).nomeFantasia || (parceiro as any).razaoSocial || "Parceiro";

        const senhaPadrao = await getSenhaPadraoParceiro(db, input.companyId);
        const existing = await db.select().from(portalCredentials).where(and(
          eq(portalCredentials.cnpj, cnpjClean),
          eq(portalCredentials.tipo, "parceiro"),
          eq(portalCredentials.companyId, input.companyId),
        ));
        let acessoNovo = false;
        if (existing.length === 0) {
          const senhaHash = await bcrypt.hash(senhaPadrao, 10);
          await db.insert(portalCredentials).values({
            tipo: "parceiro",
            parceiroId: input.parceiroId,
            companyId: input.companyId,
            cnpj: cnpjClean,
            senhaHash,
            nomeEmpresa,
            emailResponsavel: input.email,
            nomeResponsavel: input.nomeResponsavel || null,
            primeiroAcesso: 1,
            ativo: 1,
          });
          acessoNovo = true;
        } else {
          await db.update(portalCredentials).set({
            emailResponsavel: input.email,
            nomeResponsavel: input.nomeResponsavel || (existing[0] as any).nomeResponsavel,
            ativo: 1,
            updatedAt: new Date().toISOString(),
          }).where(eq(portalCredentials.id, (existing[0] as any).id));
        }

        // Link do portal: usa a origem informada pelo client (mesmo domínio do
        // app) quando válida; senão o fallback do servidor. Nunca aceita path
        // arbitrário — só a ORIGEM https, e o caminho é fixo.
        const origemOk = typeof input.portalBaseUrl === "string" && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(input.portalBaseUrl);
        const base = origemOk ? input.portalBaseUrl! : getPortalBaseUrl();
        const linkPortal = `${base}/portal/login`;

        const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
        const empresaNome = (company as any)?.name || (company as any)?.razaoSocial || "FC Engenharia";
        const primeiroNome = (input.nomeResponsavel || "").split(" ")[0];

        const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const senhaInfo = (acessoNovo || (existing[0] as any)?.primeiroAcesso === 1)
          ? `<li><strong>Senha inicial:</strong> <code style="background:#f3e8ff;padding:2px 8px;border-radius:4px;font-size:15px">${esc(senhaPadrao)}</code> (obrigatório trocar no primeiro acesso)</li>`
          : `<li><strong>Senha:</strong> a que você já definiu. Esqueceu? Peça o reset ao RH da ${esc(empresaNome)}.</li>`;
        const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px 12px 0 0;padding:28px 24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">Portal do Parceiro</h1>
    <p style="color:#ede9fe;margin:8px 0 0;font-size:14px">${esc(empresaNome)} — Convênio ${esc(nomeEmpresa)}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <p style="font-size:15px">Olá${primeiroNome ? ` <strong>${esc(primeiroNome)}</strong>` : ""}! Você é o responsável pelos lançamentos do convênio <strong>${esc(nomeEmpresa)}</strong> no Portal do Parceiro da ${esc(empresaNome)}.</p>
    <p style="font-size:14px;margin:16px 0 8px"><strong>Seu acesso:</strong></p>
    <ul style="font-size:14px;line-height:1.9;padding-left:20px;margin:0">
      <li><strong>Link do portal:</strong> <a href="${esc(linkPortal)}" style="color:#7c3aed">${esc(linkPortal)}</a></li>
      <li><strong>Login:</strong> CNPJ ${esc(cnpjClean)}</li>
      ${senhaInfo}
    </ul>
    <p style="font-size:14px;margin:20px 0 8px"><strong>Passo a passo:</strong></p>
    <ol style="font-size:14px;line-height:1.9;padding-left:20px;margin:0">
      <li>Acesse o link acima e entre com CNPJ e senha.</li>
      <li>No primeiro acesso, o sistema pedirá para você criar a sua própria senha.</li>
      <li>Para cada compra de colaborador: busque o funcionário pelo nome, informe a data, o valor e a descrição dos itens.</li>
      <li>Anexe o comprovante da compra (foto ou PDF).</li>
      <li>Envie o lançamento — o RH da ${esc(empresaNome)} confere e aprova; o desconto entra na folha do ciclo (compras de dia 16 a dia 15 entram no mês seguinte).</li>
    </ol>
    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px 16px;margin-top:20px">
      <p style="font-size:13px;margin:0;color:#6b21a8"><strong>Dúvidas?</strong> Fale com o RH da ${esc(empresaNome)} pelos canais habituais de contato.</p>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin-top:20px">E-mail automático do sistema de gestão da ${esc(empresaNome)}. Não responda a esta mensagem.</p>
  </div>
</div>`;

        const result = await sendEmail({
          to: input.email,
          subject: `Bem-vindo ao Portal do Parceiro — ${nomeEmpresa} × ${empresaNome}`,
          html,
          text: `Portal do Parceiro ${empresaNome}. Link: ${linkPortal} | Login: CNPJ ${cnpjClean}${acessoNovo ? ` | Senha inicial: ${senhaPadrao} (trocar no 1º acesso)` : ""}`,
        });
        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao enviar e-mail: ${result.error || "erro no SMTP"}` });
        }
        return { success: true, acessoNovo, email: input.email, linkPortal };
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

    // Rev. 2851 — Define QUAIS OBRAS esta credencial pode ver no Portal do Cliente.
    // obraIds = null  => TODAS as obras do cliente (grava NULL na coluna).
    // obraIds = []    => NENHUMA obra. obraIds = [ids] => somente essas.
    setObrasLiberadasCliente: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(),
      obraIds: z.array(z.number()).nullable(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { serializeObrasLiberadas } = await import("../../shared/portalClienteAbas");
      const json = serializeObrasLiberadas(input.obraIds);
      const res: any = await db.update(portalCredentials).set({
        obrasLiberadas: json,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(portalCredentials.id, input.id),
        eq(portalCredentials.companyId, input.companyId),
        eq(portalCredentials.tipo, "cliente"),
      ));
      // Rev. 2851 — falha explícita se a credencial não casar (evita falso sucesso silencioso).
      if (typeof res?.rowCount === "number" && res.rowCount === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credencial de cliente não encontrada." });
      }
      return { success: true, obras: json === null ? null : JSON.parse(json) };
    }),

    // Rev. 2851 — Lista as obras de um cliente (mesma regra por NOME usada no
    // Portal) para popular o seletor de "obras liberadas" por usuário no admin.
    obrasDoClienteAdmin: protectedProcedure.input(z.object({
      companyId: z.number(), clienteId: z.number(),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const [c] = await db.select().from(clientes).where(and(
        eq(clientes.id, input.clienteId),
        eq(clientes.companyId, input.companyId),
      ));
      if (!c) return [];
      const nomes = [c.razaoSocial, c.nomeFantasia].filter(Boolean) as string[];
      if (nomes.length === 0) return [];
      const orConds = nomes.map((n) => ilike(obras.cliente, n));
      const list = await db.select({
        id: obras.id, nome: obras.nome, codigo: obras.codigo,
        cidade: obras.cidade, estado: obras.estado, status: obras.status,
      }).from(obras).where(and(
        eq(obras.companyId, input.companyId),
        isNull(obras.deletedAt),
        or(...orConds)!,
      )).orderBy(desc(obras.createdAt));
      return list;
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
    })).query(async ({ input, ctx }) => {
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
      // Rev. 1595 — Perguntas extras (personalizadas) com agregações.
      // Para cada pergunta cadastrada (mesmo se inativa, contanto que tenha
      // recebido respostas no período), calcula média (tipo nota_0_10 e
      // sim_nao_talvez), distribuição e amostra de respostas de texto.
      const avalIds = rows.map(r => r.id);
      let perguntasExtras: any[] = [];
      try {
        const perguntasRows = await db.select().from(clientePerguntasExtras)
          .where(eq(clientePerguntasExtras.companyId, input.companyId))
          .orderBy(clientePerguntasExtras.ordem);
        const respostasRows = avalIds.length === 0 ? [] : await db.select().from(clienteRespostasExtras)
          .where(inArray(clienteRespostasExtras.avaliacaoId, avalIds));
        perguntasExtras = perguntasRows.map((p: any) => {
          const resps = respostasRows.filter((r: any) => r.perguntaId === p.id);
          if (p.tipo === "nota_0_10" || p.tipo === "sim_nao_talvez") {
            const nums = resps.map((r: any) => r.valorNumero).filter((n: any) => n !== null && n !== undefined);
            const media = nums.length ? Math.round((nums.reduce((a: number, b: number) => a + b, 0) / nums.length) * 10) / 10 : null;
            return { ...p, totalRespostas: resps.length, media, distribuicao: nums };
          }
          // texto_curto / texto_longo
          const respostasTexto = resps.map((r: any) => (r.valorTexto || "").trim()).filter((t: string) => t.length > 0);
          return { ...p, totalRespostas: respostasTexto.length, respostasTexto: respostasTexto.slice(0, 100) };
        });
      } catch (e: any) {
        console.error("[dashboardAvaliacoesCliente] Falha ao carregar perguntas extras:", e?.message || e);
      }

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
        // Rev. 2982 — o tempo de preenchimento é dado INTERNO, exclusivo do Admin
        // Master. Para qualquer outro perfil ele é REMOVIDO do payload (não basta
        // esconder no front: o dado não pode sair do backend).
        avaliacoes: (ctx.user.role === "admin_master"
          ? rows.slice(0, 100)
          : rows.slice(0, 100).map((r: any) => {
              const { tempoRespostaSegundos, ...rest } = r;
              return rest;
            })),
        // Rev. 1595 — Perguntas personalizadas
        perguntasExtras,
      };
    }),

    // ===== Rev. 1595 — Editor do Questionário (perguntas extras) =====
    listarPerguntasExtras: protectedProcedure.input(z.object({
      companyId: z.number(),
      apenasAtivas: z.boolean().optional(),
    })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      const db = (await getDb())!;
      const conds: any[] = [eq(clientePerguntasExtras.companyId, input.companyId)];
      if (input.apenasAtivas) conds.push(eq(clientePerguntasExtras.ativa, true));
      const rows = await db.select().from(clientePerguntasExtras)
        .where(and(...conds))
        .orderBy(clientePerguntasExtras.ordem, clientePerguntasExtras.id);
      // Rev. 1595 — devolve totalRespostas para a UI poder bloquear mudança de tipo.
      const ids = rows.map((r: any) => r.id);
      let counts: Record<number, number> = {};
      if (ids.length > 0) {
        const cntRows = await db.execute(sql`
          SELECT pergunta_id, COUNT(*)::int AS total
          FROM cliente_respostas_extras
          WHERE pergunta_id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})
          GROUP BY pergunta_id
        `);
        for (const r of ((cntRows as any).rows ?? cntRows ?? []) as any[]) {
          counts[Number(r.pergunta_id)] = Number(r.total);
        }
      }
      return rows.map((r: any) => ({ ...r, totalRespostas: counts[r.id] ?? 0 }));
    }),

    salvarPerguntaExtra: protectedProcedure.input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      ordem: z.number().int().optional(),
      secaoTitulo: z.string().min(1).max(80),
      tipo: z.enum(["nota_0_10", "texto_curto", "texto_longo", "sim_nao_talvez"]),
      label: z.string().min(1).max(240),
      ajuda: z.string().max(2000).optional().nullable(),
      placeholder: z.string().max(240).optional().nullable(),
      obrigatoria: z.boolean().optional(),
      ativa: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      const db = (await getDb())!;
      if (input.id) {
        const [existing] = await db.select().from(clientePerguntasExtras).where(eq(clientePerguntasExtras.id, input.id));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pergunta não encontrada." });
        if (existing.companyId !== input.companyId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Pergunta não pertence à empresa selecionada." });
        }
        // Tipo NÃO pode mudar depois que a pergunta tem respostas (preservar consistência analítica).
        const [{ count }] = await db.execute(sql`
          SELECT COUNT(*)::int AS count FROM cliente_respostas_extras WHERE pergunta_id = ${input.id}
        `).then((r: any) => (r.rows ?? r ?? [])) as any;
        if ((count ?? 0) > 0 && existing.tipo !== input.tipo) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível mudar o tipo de uma pergunta que já tem respostas. Crie uma nova pergunta." });
        }
        await db.update(clientePerguntasExtras).set({
          secaoTitulo: input.secaoTitulo.trim(),
          tipo: input.tipo,
          label: input.label.trim(),
          ajuda: input.ajuda?.trim() || null,
          placeholder: input.placeholder?.trim() || null,
          obrigatoria: input.obrigatoria ?? false,
          ativa: input.ativa ?? true,
          ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
        }).where(eq(clientePerguntasExtras.id, input.id));
        return { success: true, id: input.id };
      }
      // CREATE — calcula próxima ordem
      const [maxRow] = await db.execute(sql`
        SELECT COALESCE(MAX(ordem), -1) + 1 AS prox
        FROM cliente_perguntas_extras WHERE company_id = ${input.companyId}
      `).then((r: any) => (r.rows ?? r ?? [])) as any;
      const proxOrdem = input.ordem ?? (maxRow?.prox ?? 0);
      const [created] = await db.insert(clientePerguntasExtras).values({
        companyId: input.companyId,
        ordem: proxOrdem,
        secaoTitulo: input.secaoTitulo.trim(),
        tipo: input.tipo,
        label: input.label.trim(),
        ajuda: input.ajuda?.trim() || null,
        placeholder: input.placeholder?.trim() || null,
        obrigatoria: input.obrigatoria ?? false,
        ativa: input.ativa ?? true,
      }).returning({ id: clientePerguntasExtras.id });
      return { success: true, id: created.id };
    }),

    removerPerguntaExtra: protectedProcedure.input(z.object({
      id: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode remover perguntas (apaga as respostas históricas)." });
      }
      const db = (await getDb())!;
      const [existing] = await db.select().from(clientePerguntasExtras).where(eq(clientePerguntasExtras.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pergunta não encontrada." });
      if (existing.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Pergunta não pertence à empresa selecionada." });
      }
      // CASCADE em cliente_respostas_extras remove as respostas atreladas.
      await db.delete(clientePerguntasExtras).where(eq(clientePerguntasExtras.id, input.id));
      return { success: true };
    }),

    reordenarPerguntasExtras: protectedProcedure.input(z.object({
      companyId: z.number(),
      ordemIds: z.array(z.number()), // ids na ordem desejada
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      const db = (await getDb())!;
      // Atualiza em batch — só registros desta empresa.
      for (let i = 0; i < input.ordemIds.length; i++) {
        await db.update(clientePerguntasExtras)
          .set({ ordem: i })
          .where(and(
            eq(clientePerguntasExtras.id, input.ordemIds[i]!),
            eq(clientePerguntasExtras.companyId, input.companyId),
          ));
      }
      return { success: true };
    }),

    // ===== Rev. 1597 — Override de RÓTULO das perguntas CORE =====
    // Apenas o Admin Master pode personalizar o texto exibido das 8 perguntas
    // core do questionário. Chave/tipo/seção continuam fixos para preservar o
    // cálculo do NPS e a paridade Portal × Planejamento.
    listarLabelsCoreOverride: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        SELECT chave, label FROM cliente_perguntas_core_overrides
        WHERE company_id = ${input.companyId}
      `).then((r: any) => (r.rows ?? r ?? [])) as any[];
      const map: Record<string, string> = {};
      for (const r of rows) map[String(r.chave)] = String(r.label);
      return map;
    }),

    salvarLabelCoreOverride: protectedProcedure.input(z.object({
      companyId: z.number(),
      chave: z.enum([
        "notaGeral", "notaEquipe", "notaGestor", "notaEmpresa",
        "notaObra", "notaPrazo", "notaQualidade", "notaEscritorio",
      ]),
      label: z.string().min(1).max(240),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode editar o rótulo das perguntas core." });
      }
      const db = (await getDb())!;
      const label = input.label.trim();
      await db.execute(sql`
        INSERT INTO cliente_perguntas_core_overrides (company_id, chave, label, updated_at)
        VALUES (${input.companyId}, ${input.chave}, ${label}, NOW())
        ON CONFLICT (company_id, chave)
        DO UPDATE SET label = EXCLUDED.label, updated_at = NOW()
      `);
      return { success: true };
    }),

    resetarLabelCoreOverride: protectedProcedure.input(z.object({
      companyId: z.number(),
      chave: z.enum([
        "notaGeral", "notaEquipe", "notaGestor", "notaEmpresa",
        "notaObra", "notaPrazo", "notaQualidade", "notaEscritorio",
      ]),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode redefinir rótulos das perguntas core." });
      }
      const db = (await getDb())!;
      await db.execute(sql`
        DELETE FROM cliente_perguntas_core_overrides
        WHERE company_id = ${input.companyId} AND chave = ${input.chave}
      `);
      return { success: true };
    }),

    // ===== Rev. 1599 — Assistente de IA para criação de perguntas =====
    // Sugere novas perguntas personalizadas para o questionário do Portal do
    // Cliente, levando em conta as 8 perguntas CORE (não duplicar) e as
    // perguntas extras já cadastradas. Devolve sempre JSON com array de
    // sugestões { label, secaoTitulo, tipo, ajuda, motivo }.
    sugerirPerguntasIA: protectedProcedure.input(z.object({
      companyId: z.number(),
      foco: z.string().max(500).optional(),
      quantidade: z.number().int().min(1).max(10).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      // Tenant isolation: admin não-master só pode operar na própria empresa.
      if (ctx.user.role !== "admin_master" && ctx.user.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa." });
      }
      const db = (await getDb())!;
      const [emp] = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);
      const empresaNome = (emp as any)?.razaoSocial || (emp as any)?.nome || "FC Engenharia";

      // Perguntas CORE (não duplicar) + extras já cadastradas
      const { PERGUNTAS_CORE_DEFAULTS } = await import("../../shared/portalPerguntasCore");
      const extras = await db.select().from(clientePerguntasExtras)
        .where(eq(clientePerguntasExtras.companyId, input.companyId));

      const corePart = PERGUNTAS_CORE_DEFAULTS.map((p, i) => `${i + 1}. [${p.secao}] ${p.label}`).join("\n");
      const extrasPart = (extras as any[]).length > 0
        ? (extras as any[]).map((p, i) => `${i + 1}. [${p.secaoTitulo}] (${p.tipo}) ${p.label}`).join("\n")
        : "(nenhuma pergunta personalizada cadastrada ainda)";

      const tipoLabel: Record<string, string> = {
        nota_0_10: "Nota 0–10 (escala numérica, ideal para satisfação/NPS)",
        texto_curto: "Texto curto (frase rápida)",
        texto_longo: "Texto longo (comentário aberto, feedback detalhado)",
        sim_nao_talvez: "Sim / Talvez / Não (resposta categórica)",
      };

      const systemPrompt = `Você é um especialista em pesquisa de satisfação e NPS para empresas de engenharia/construção civil. Está ajudando a equipe da FC Engenharia (gestão de obras, terceirização, projetos) a desenhar perguntas adicionais para o questionário que o cliente responde no Portal do Cliente.

Regras OBRIGATÓRIAS:
- NÃO sugira nada que duplique ou se sobreponha às 8 perguntas CORE (que já cobrem: nota geral, equipe, gestor, empresa, obra, prazo, qualidade, escritório).
- NÃO sugira nada que duplique perguntas personalizadas já cadastradas.
- Cada sugestão precisa ser ACIONÁVEL (gera insight para a operação) e respondível em poucos segundos.
- Tipos de resposta disponíveis: ${Object.entries(tipoLabel).map(([k, v]) => `"${k}" — ${v}`).join("; ")}.
- Prefira "nota_0_10" para perguntas que entram em métricas; "texto_longo" para feedback aberto; "sim_nao_talvez" para diagnósticos rápidos.
- Texto da pergunta direto, em português do Brasil, máx. 180 caracteres.
- Seção (agrupador visual) curta — reaproveite quando fizer sentido (ex.: "Pós-obra", "Comunicação", "Comercial", "Sustentabilidade", "Segurança", "Documentação"). Máx. 60 caracteres.
- Ajuda/contexto opcional, máx. 200 caracteres, ajuda o cliente a responder.

Devolva ESTRITAMENTE um JSON válido, SEM markdown, SEM comentários, no formato:
{"sugestoes":[{"label":"...","secaoTitulo":"...","tipo":"nota_0_10|texto_curto|texto_longo|sim_nao_talvez","ajuda":"...","motivo":"..."}]}`;

      const userPrompt = `Empresa: ${empresaNome}

Perguntas CORE (FIXAS — não duplicar):
${corePart}

Perguntas personalizadas já cadastradas (não duplicar):
${extrasPart}

${input.foco ? `Foco/tema solicitado pelo administrador: ${input.foco}\n\n` : ""}Sugira ${input.quantidade ?? 6} perguntas NOVAS e relevantes que NÃO se sobreponham às acima. Para cada uma, inclua um campo "motivo" curto (máx. 120 caracteres) explicando por que é útil para a operação da empresa.`;

      let parsed: any = { sugestoes: [] };
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 2000,
        });
        const raw = (() => {
          const c = result?.choices?.[0]?.message?.content;
          return typeof c === "string" ? c : Array.isArray(c) ? (c[0] as any)?.text ?? "" : "";
        })();
        const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start >= 0 && end > start) parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch (e: any) {
        console.error("[Questionario IA] sugerirPerguntasIA falhou:", e?.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não conseguiu gerar sugestões agora. Tente novamente em instantes." });
      }

      const tiposValidos = new Set(["nota_0_10", "texto_curto", "texto_longo", "sim_nao_talvez"]);
      const sugestoes = Array.isArray(parsed?.sugestoes) ? parsed.sugestoes : [];

      // Dedupe defensivo: mesmo com a instrução no prompt, a IA pode devolver
      // sugestões que se sobreponham às CORE / extras existentes ou repetidas
      // entre si. Comparamos por uma chave normalizada (lowercase, sem
      // acentos, sem pontuação) do label.
      const norm = (s: string) => s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ").trim();
      const jaUsadas = new Set<string>([
        ...PERGUNTAS_CORE_DEFAULTS.map(p => norm(p.label)),
        ...(extras as any[]).map(p => norm(String(p.label || ""))),
      ]);

      const limpa: Array<any> = [];
      for (const s of sugestoes) {
        const item = {
          label: String(s?.label ?? "").trim().slice(0, 240),
          secaoTitulo: String(s?.secaoTitulo ?? "Personalizadas").trim().slice(0, 80) || "Personalizadas",
          tipo: tiposValidos.has(String(s?.tipo)) ? String(s.tipo) : "nota_0_10",
          ajuda: String(s?.ajuda ?? "").trim().slice(0, 240) || null,
          motivo: String(s?.motivo ?? "").trim().slice(0, 200) || null,
        };
        if (!item.label) continue;
        const key = norm(item.label);
        if (!key || jaUsadas.has(key)) continue;
        jaUsadas.add(key);
        limpa.push(item);
      }

      return { sugestoes: limpa };
    }),

    // Refina o rascunho de uma pergunta personalizada (clareza, neutralidade,
    // tamanho ideal). NÃO altera o tipo nem a seção — apenas o texto e a ajuda.
    refinarPerguntaIA: protectedProcedure.input(z.object({
      companyId: z.number(),
      label: z.string().min(1).max(500),
      tipo: z.enum(["nota_0_10", "texto_curto", "texto_longo", "sim_nao_talvez"]),
      secaoTitulo: z.string().max(80).optional(),
      ajuda: z.string().max(2000).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      // Tenant isolation: admin não-master só pode operar na própria empresa.
      if (ctx.user.role !== "admin_master" && ctx.user.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa." });
      }

      const tipoLabel: Record<string, string> = {
        nota_0_10: "Nota 0–10",
        texto_curto: "Texto curto",
        texto_longo: "Texto longo",
        sim_nao_talvez: "Sim / Talvez / Não",
      };

      const systemPrompt = `Você é um especialista em pesquisa de satisfação para empresas de engenharia/construção. Sua tarefa é REFINAR o texto de uma pergunta de questionário (Portal do Cliente da FC Engenharia) para que fique:
- Clara, direta e neutra (sem viés positivo nem negativo).
- Em português do Brasil, máx. 180 caracteres.
- Coerente com o tipo de resposta indicado (não mudar o tipo).
- Sem repetir o conceito do tipo no texto (ex.: não escrever "dê uma nota").

Também sugira um texto de "ajuda" curto (máx. 200 caracteres) que dê contexto ao cliente.

Devolva ESTRITAMENTE um JSON válido, SEM markdown:
{"label":"...","ajuda":"..."}`;

      const userPrompt = `Tipo de resposta: ${tipoLabel[input.tipo]}
Seção: ${input.secaoTitulo || "Personalizadas"}

Texto atual: ${input.label}
Ajuda atual: ${input.ajuda || "(nenhuma)"}

Refine o texto da pergunta e a ajuda. Mantenha a INTENÇÃO original.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 600,
        });
        const raw = (() => {
          const c = result?.choices?.[0]?.message?.content;
          return typeof c === "string" ? c : Array.isArray(c) ? (c[0] as any)?.text ?? "" : "";
        })();
        const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        const obj = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : {};
        return {
          label: String(obj?.label ?? "").trim().slice(0, 240) || input.label,
          ajuda: String(obj?.ajuda ?? "").trim().slice(0, 240) || (input.ajuda || ""),
        };
      } catch (e: any) {
        console.error("[Questionario IA] refinarPerguntaIA falhou:", e?.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não conseguiu refinar a pergunta agora. Tente novamente em instantes." });
      }
    }),

    // Rev. 1601 — Admin Master libera um usuário-cliente específico para
    // avaliar de novo no período corrente (mês ou ano, conforme config).
    // Idempotente: apenas remove a marcação `(cred_id, ano_mes)` do período
    // vigente. Não mexe em avaliações já registradas (essas continuam no
    // dashboard para auditoria — para apagar, use cancelarAvaliacaoCliente).
    liberarAvaliacaoCredAtual: protectedProcedure.input(z.object({
      credId: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode liberar avaliações." });
      }
      const db = (await getDb())!;
      const [cred] = await db.select().from(portalCredentials).where(eq(portalCredentials.id, input.credId));
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Acesso não encontrado." });
      if (cred.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não pertence à empresa selecionada." });
      }
      const [cfg] = await db.select().from(portalClienteConfig).where(eq(portalClienteConfig.companyId, input.companyId));
      const periodicidade = (cfg?.periodicidade === "anual") ? "anual" : "mensal";
      const fmt = periodicidade === "anual" ? "YYYY" : "YYYY-MM";
      const periodoRow = await db.execute(sql`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', ${fmt}) AS periodo`);
      const anoPeriodo = (((periodoRow as any).rows ?? periodoRow ?? [])[0] as any)?.periodo ?? "";
      // Rev. 2974 — SOFT-RELEASE (ZERO DELETE): marca `liberada_em` em vez de
      // apagar a linha. A marcação permanece (PK cred_id+ano_mes) mas deixa de
      // contar como "já avaliou"; o próximo envio a revive (liberada_em=NULL).
      const del = await db.execute(sql`
        UPDATE cliente_avaliacao_marcacoes
        SET liberada_em = NOW()
        WHERE cred_id = ${input.credId} AND ano_mes = ${anoPeriodo}
          AND liberada_em IS NULL
        RETURNING cred_id
      `);
      const removidos = (((del as any).rows ?? del ?? []) as any[]).length;
      return { success: true, periodicidade, anoPeriodo, jaEstavaLiberado: removidos === 0 };
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
        // Rev. 2974 — SOFT-RELEASE (ZERO DELETE) + correção de casing: a coluna
        // de empresa em `portal_credentials` é camelCase ("companyId"), não
        // `company_id` (causa do erro 42703 "column company_id does not exist").
        // Em vez de apagar a marcação, marca `liberada_em` (libera p/ reavaliar).
        await db.execute(sql`
          UPDATE cliente_avaliacao_marcacoes
          SET liberada_em = NOW()
          WHERE ano_mes = ${periodoLimpo}
            AND liberada_em IS NULL
            AND cred_id IN (
              SELECT id FROM portal_credentials
              WHERE "companyId" = ${aval.companyId} AND tipo = 'cliente'
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

    // Rev. 2890 — Gera um LINK PÚBLICO de avaliação (NPS) para o admin enviar
    // diretamente ao cliente, sem precisar de credencial/login no portal.
    // O token é um JWT "link aberto" (tipo: "cliente" + companyId, SEM portalId):
    // como não há credId, criarAvaliacao/podeAvaliarEsteMes pulam o limite por
    // período (anônimo, reutilizável para envio a vários contatos do cliente).
    // ZERO schema: token autocontido (stateless), validade 180 dias.
    gerarLinkAvaliacao: protectedProcedure.input(z.object({
      companyId: z.number(),
      // Rev. 2892 — link público SEPARADO POR OBRA: quando informado, a obra
      // fica embutida (e travada) no token, evitando avaliação na obra errada.
      obraId: z.number().nullable().optional(),
      // Rev. 2973 — quantidade de links DE USO ÚNICO a gerar de uma vez. Cada
      // link só permite UMA avaliação (one-shot via `linkId`); útil quando há
      // vários avaliadores na mesma obra. Default 1; teto defensivo de 50.
      quantidade: z.number().int().min(1).max(50).optional(),
      // Rev. 2985 — idioma das perguntas da avaliação (pt|en|zh). Embutido no JWT
      // e gravado no short-link p/ a página pública renderizar no idioma certo.
      lang: z.enum(["pt", "en", "zh"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      // Rev. 2890 — guard cross-tenant: admin (não master) só gera link da PRÓPRIA empresa.
      if (ctx.user.role !== "admin_master" && ctx.user.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2978 — GARANTIA: todo link de avaliação DEVE estar vinculado a uma obra
      // (não há mais "link geral sem obra"). Sem obraId → recusa gerar o link.
      if (!input.obraId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a obra para gerar o link de avaliação." });
      }
      const db = (await getDb())!;
      // Rev. 2892 — valida que a obra pertence à empresa (tenant guard) e captura
      // o nome p/ exibir no link público sem nova chamada (payload do JWT é público).
      let obraId: number | null = null;
      let obraNome: string | null = null;
      let gestorNome: string | null = null;
      let encarregadoNome: string | null = null;
      if (input.obraId) {
        // Rev. 2965 — captura o responsável (gestor) da obra p/ pré-preencher o
        // nome do gestor na avaliação automaticamente (sem o cliente digitar).
        const [o] = await db.select({ id: obras.id, nome: obras.nome, responsavel: obras.responsavel }).from(obras).where(and(
          eq(obras.id, input.obraId),
          eq(obras.companyId, input.companyId),
          isNull(obras.deletedAt),
        ));
        if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada nesta empresa." });
        obraId = o.id;
        obraNome = o.nome ?? null;
        gestorNome = (o.responsavel || "").trim() || null;
        // Rev. 2970 — pré-preenche o NOME DO ENCARREGADO a partir do efetivo da
        // obra: procura no quadro (getEquipeObra) o indireto cuja função/cargo
        // contém "ENCARREGADO" e embute no token p/ a avaliação já vir preenchida.
        try {
          const equipe = await getEquipeObra(input.obraId, input.companyId);
          const enc = equipe.find((e: any) =>
            e.categoria === "Indireto" &&
            /ENCARREGAD/.test(`${e.funcao || ""} ${e.cargo || ""}`.toUpperCase())
          );
          encarregadoNome = (enc?.nomeCompleto || "").trim() || null;
        } catch { encarregadoNome = null; }
      }
      const secret = process.env.JWT_SECRET || "portal-secret";
      // Rev. 2973 — gera N tokens DE USO ÚNICO de uma vez. Cada token carrega um
      // `linkId` (nonce) que, no envio da avaliação, é "consumido" atomicamente em
      // cliente_avaliacao_link_uso — então cada link só vale UMA avaliação.
      const qtd = Math.min(50, Math.max(1, input.quantidade ?? 1));
      const lang = input.lang ?? "pt";
      const criadoPorId = (ctx.user as any)?.id ?? null;
      const criadoPorNome = ctx.user?.name ?? null;
      const tokens: string[] = [];
      const codigos: string[] = [];
      for (let i = 0; i < qtd; i++) {
        const linkId = crypto.randomUUID();
        const token = jwt.sign({
          tipo: "cliente",
          companyId: input.companyId,
          linkAberto: true,
          linkId,
          unico: true,
          // Rev. 2985 — idioma embutido p/ a página pública abrir já no idioma certo.
          lang,
          ...(obraId ? { obraId, obraNome, ...(gestorNome ? { gestorNome } : {}), ...(encarregadoNome ? { encarregadoNome } : {}) } : {}),
        }, secret, { expiresIn: "180d" });
        tokens.push(token);
        // Rev. 2980 — SHORT-LINK: guarda o token completo sob um CÓDIGO CURTO. A URL
        // enviada vira /a/<codigo> (curtíssima), em vez de /portal/avaliacao/<JWT longo>.
        // O JWT longo (com obraNome/gestor/encarregado) era TRUNCADO pelo detector de
        // links do WhatsApp → "link não vinculado". Código curto (16 hex) não é truncável.
        // 5 tentativas anti-colisão; falha total → codigo "" → front cai no link longo.
        let codigo = "";
        for (let tryN = 0; tryN < 5; tryN++) {
          const cand = crypto.randomBytes(8).toString("hex");
          try {
            const ins = await db.execute(sql`
              INSERT INTO cliente_avaliacao_shortlink (codigo, token, company_id, obra_id, obra_nome, link_id, lang, criado_por_id, criado_por_nome)
              VALUES (${cand}, ${token}, ${input.companyId}, ${obraId}, ${obraNome}, ${linkId}, ${lang}, ${criadoPorId}, ${criadoPorNome})
              ON CONFLICT (codigo) DO NOTHING
              RETURNING codigo
            `);
            if ((((ins as any).rows ?? ins ?? []) as any[]).length > 0) { codigo = cand; break; }
          } catch { break; /* tabela ausente/erro → fallback p/ link longo */ }
        }
        codigos.push(codigo);
      }
      // Compat: `token`/`tokens` = JWT(s) completos (consumidores antigos seguem ok);
      // `codigo`/`codigos` = códigos curtos do short-link (URL /a/<codigo>).
      return { token: tokens[0], tokens, codigo: codigos[0], codigos, obraId, obraNome, gestorNome, encarregadoNome, lang };
    }),

    // Rev. 2985 — LISTA os links de avaliação (NPS) gerados e ainda ativos (não
    // soft-deletados) da empresa, organizados por OBRA e DATA. Cada item informa
    // o idioma, quem criou e se o link JÁ FOI USADO (join cliente_avaliacao_link_uso
    // por link_id). Links antigos (sem link_id) aparecem como "disponível".
    listarLinksAvaliacao: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      if (ctx.user.role !== "admin_master" && ctx.user.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const db = (await getDb())!;
      try {
        // Rev. 2985 — resolve o NOME da obra AO VIVO (COALESCE com `obras.nome`)
        // para que links ANTIGOS (criados antes desta revisão, sem `obra_nome`
        // gravado) também apareçam com o nome da obra em vez do número.
        const r = await db.execute(sql`
          SELECT s.codigo,
                 s.obra_id,
                 COALESCE(NULLIF(s.obra_nome, ''), o.nome) AS obra_nome,
                 s.lang,
                 to_char((s.criado_em AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS criado_em,
                 s.criado_por_nome,
                 (u.link_id IS NOT NULL) AS usado
          FROM cliente_avaliacao_shortlink s
          LEFT JOIN cliente_avaliacao_link_uso u ON u.link_id = s.link_id
          LEFT JOIN obras o ON o.id = s.obra_id AND o."companyId" = s.company_id
          WHERE s.company_id = ${input.companyId}
            AND s.deletado_em IS NULL
          ORDER BY COALESCE(NULLIF(s.obra_nome, ''), o.nome) ASC NULLS LAST, s.criado_em DESC
        `);
        const rows = (((r as any).rows ?? r ?? []) as any[]);
        return rows.map((x) => ({
          codigo: x.codigo as string,
          obraId: x.obra_id ?? null,
          obraNome: (x.obra_nome ?? null) as string | null,
          lang: (x.lang ?? "pt") as string,
          criadoEm: (x.criado_em ?? null) as string | null,
          criadoPorNome: (x.criado_por_nome ?? null) as string | null,
          usado: x.usado === true || x.usado === "t" || x.usado === 1,
        }));
      } catch (e: any) {
        console.error("[listarLinksAvaliacao] erro:", e?.message || e);
        return [] as Array<{ codigo: string; obraId: number | null; obraNome: string | null; lang: string; criadoEm: string | null; criadoPorNome: string | null; usado: boolean }>;
      }
    }),

    // Rev. 2985 — EXCLUI (soft-delete) um link de avaliação. APENAS o admin_master
    // pode apagar. ZERO DELETE físico: marca deletado_em via UPDATE (R-001/007/010).
    excluirLinkAvaliacao: protectedProcedure.input(z.object({
      companyId: z.number(),
      codigo: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Admin Master pode excluir links de avaliação." });
      }
      const db = (await getDb())!;
      const r = await db.execute(sql`
        UPDATE cliente_avaliacao_shortlink
        SET deletado_em = NOW()
        WHERE codigo = ${input.codigo}
          AND company_id = ${input.companyId}
          AND deletado_em IS NULL
        RETURNING codigo
      `);
      const rows = (((r as any).rows ?? r ?? []) as any[]);
      if (rows.length === 0) {
        // IDEMPOTENTE (Rev. 2985): o WebKit do iPad/iOS às vezes derruba a 1ª
        // requisição e o cliente re-tenta; se o link já foi excluído antes (ou
        // numa tentativa anterior que chegou ao servidor), NÃO falhar — só erra
        // se o código de fato não existir nesta empresa.
        const chk = await db.execute(sql`
          SELECT codigo FROM cliente_avaliacao_shortlink
          WHERE codigo = ${input.codigo} AND company_id = ${input.companyId}
          LIMIT 1
        `);
        const existe = (((chk as any).rows ?? chk ?? []) as any[]).length > 0;
        if (!existe) throw new TRPCError({ code: "NOT_FOUND", message: "Link não encontrado." });
      }
      return { success: true };
    }),

    // Rev. 2987 — exclusão EM LOTE (soft-delete) de vários links de uma vez —
    // APENAS Admin Master. Uma única requisição (melhor p/ iPad/iOS que derruba
    // requisições no transporte). IDEMPOTENTE: links já excluídos só não entram
    // na contagem. ZERO DELETE físico (R-001/007/010).
    excluirLinksAvaliacao: protectedProcedure.input(z.object({
      companyId: z.number(),
      codigos: z.array(z.string().min(1)).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Admin Master pode excluir links de avaliação." });
      }
      const db = (await getDb())!;
      // Rev. 3129 — o `sql` template do Drizzle EXPANDE um array JS em placeholders
      // separados por vírgula (`$2, $3`), então `ANY(${codigos}::text[])` virava o
      // SQL INVÁLIDO `ANY($2, $3::text[])` e a exclusão em lote falhava. Usamos `IN
      // (...)`, que é exatamente o formato que essa expansão gera (`IN ($2, $3)`).
      const r = await db.execute(sql`
        UPDATE cliente_avaliacao_shortlink
        SET deletado_em = NOW()
        WHERE company_id = ${input.companyId}
          AND deletado_em IS NULL
          AND codigo IN (${input.codigos})
        RETURNING codigo
      `);
      const rows = (((r as any).rows ?? r ?? []) as any[]);
      return { success: true, excluidos: rows.length };
    }),

    // Rev. 2892 — lista todas as obras da empresa p/ o seletor do "link por obra".
    obrasDaEmpresaAdmin: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
      }
      if (ctx.user.role !== "admin_master" && ctx.user.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const db = (await getDb())!;
      const list = await db.select({
        id: obras.id, nome: obras.nome, codigo: obras.codigo, status: obras.status,
      }).from(obras).where(and(
        eq(obras.companyId, input.companyId),
        isNull(obras.deletedAt),
      )).orderBy(desc(obras.createdAt));
      return list;
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
      let list = await db.select().from(obras).where(and(...conds, or(...orConds)!)).orderBy(desc(obras.createdAt));
      // Rev. 2851 — restringe às obras liberadas para ESTA credencial (null = todas).
      const wlObras = await _obrasLiberadasDaCredencial(db, decoded);
      if (wlObras !== null) list = list.filter((o: any) => wlObras.includes(o.id));
      const [emp] = await db.select().from(companies).where(eq(companies.id, decoded.companyId));
      const empresaLogoUrl = emp?.logoUrl || null;
      const empresaNome = emp?.nomeFantasia || emp?.razaoSocial || null;
      // Rev. 2990 — ENCARREGADO (efetivo da obra) p/ pré-preencher o NOME DO
      // ENCARREGADO na avaliação do PORTAL LOGADO, EXATAMENTE como já acontece no
      // link público (Rev. 2970). Sem isso o gestor preenchia (via `responsavel`)
      // mas o encarregado ficava como campo vazio — diferença que o usuário pediu
      // para eliminar. Mesma régua do link/podeAvaliarEsteMes: indireto do efetivo
      // cuja função/cargo contém "ENCARREGAD". Defensivo: falha por obra → null
      // (campo volta a ser manual, nunca derruba a lista).
      return await Promise.all(list.map(async (o: any) => {
        let encarregadoNome: string | null = null;
        try {
          const equipe = await getEquipeObra(o.id, decoded.companyId);
          const enc = equipe.find((e: any) =>
            e.categoria === "Indireto" &&
            /ENCARREGAD/.test(`${e.funcao || ""} ${e.cargo || ""}`.toUpperCase())
          );
          encarregadoNome = (enc?.nomeCompleto || "").trim() || null;
        } catch { encarregadoNome = null; }
        return {
          id: o.id, nome: o.nome, codigo: o.codigo, cidade: o.cidade, estado: o.estado,
          status: o.status, dataInicio: o.dataInicio, dataPrevisaoFim: o.dataPrevisaoFim,
          clienteLogoUrl: o.clienteLogoUrl, gerenciadoraNome: o.gerenciadoraNome, gerenciadoraLogoUrl: o.gerenciadoraLogoUrl,
          cliente: o.cliente,
          // Rev. 2965 — responsável (gestor) p/ pré-preencher o nome do gestor na avaliação.
          responsavel: (o.responsavel || "").trim() || null,
          // Rev. 2990 — encarregado derivado do efetivo (paridade com o link público).
          encarregadoNome,
          empresaLogoUrl, empresaNome,
        };
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
      // Rev. 2851 — enforcement por obra. Com obraId: assert direto. Sem obraId:
      // whitelist parcial mostra só obras liberadas (+ comentários globais obraId NULL).
      if (input.obraId) {
        await _assertObraPermitida(db, decoded, input.obraId);
        conds.push(eq(clienteComentarios.obraId, input.obraId));
      } else {
        const wl = await _obrasLiberadasDaCredencial(db, decoded);
        if (wl !== null) {
          conds.push(wl.length ? or(isNull(clienteComentarios.obraId), inArray(clienteComentarios.obraId, wl)) : isNull(clienteComentarios.obraId));
        }
      }
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
      // Rev. 2851 — mesmo enforcement do listarComentarios (não marca lido fora da whitelist).
      if (input.obraId) {
        await _assertObraPermitida(db, decoded, input.obraId);
        conds.push(eq(clienteComentarios.obraId, input.obraId));
      } else {
        const wl = await _obrasLiberadasDaCredencial(db, decoded);
        if (wl !== null) {
          conds.push(wl.length ? or(isNull(clienteComentarios.obraId), inArray(clienteComentarios.obraId, wl)) : isNull(clienteComentarios.obraId));
        }
      }
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
      if (input.obraId) await _assertObraPermitida(db, decoded, input.obraId); // Rev. 2851
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
      // Rev. 2982 — tempo (segundos) que o cliente levou para preencher a avaliação
      // (abertura do formulário → envio). Uso interno (Admin Master). Clampado p/
      // evitar lixo (máx. 24h). Opcional p/ compat com clientes antigos.
      tempoRespostaSegundos: z.number().int().min(0).max(86400).nullable().optional(),
      // Rev. 1595 — Respostas das perguntas extras (personalizadas) cadastradas pelo admin.
      respostasExtras: z.array(z.object({
        perguntaId: z.number(),
        valorNumero: z.number().int().nullable().optional(),
        valorTexto: z.string().optional(),
      })).optional(),
      // Rev. 2965 — Avaliação detalhada por critério (gestor, encarregado, equipe
      // direta, escritório central). Vai p/ a tabela cliente_avaliacao_detalhes (JSONB);
      // as colunas-resumo de cliente_avaliacoes são derivadas da MÉDIA destes critérios.
      detalhes: z.object({
        gestor: z.object({
          nome: z.string().optional(),
          postura: z.number().int().min(0).max(10).nullable().optional(),
          documentos: z.number().int().min(0).max(10).nullable().optional(),
          prontoAtendimento: z.number().int().min(0).max(10).nullable().optional(),
          disponibilidade: z.number().int().min(0).max(10).nullable().optional(),
          conhecimentoTecnico: z.number().int().min(0).max(10).nullable().optional(),
          educacao: z.number().int().min(0).max(10).nullable().optional(),
        }).optional(),
        encarregado: z.object({
          nome: z.string().optional(),
          postura: z.number().int().min(0).max(10).nullable().optional(),
          documentos: z.number().int().min(0).max(10).nullable().optional(),
          prontoAtendimento: z.number().int().min(0).max(10).nullable().optional(),
          disponibilidade: z.number().int().min(0).max(10).nullable().optional(),
          conhecimentoTecnico: z.number().int().min(0).max(10).nullable().optional(),
          educacao: z.number().int().min(0).max(10).nullable().optional(),
        }).optional(),
        equipe: z.object({
          tecnica: z.number().int().min(0).max(10).nullable().optional(),
          organizacao: z.number().int().min(0).max(10).nullable().optional(),
          seguranca: z.number().int().min(0).max(10).nullable().optional(),
          pontualidade: z.number().int().min(0).max(10).nullable().optional(),
          educacao: z.number().int().min(0).max(10).nullable().optional(),
          comunicacao: z.number().int().min(0).max(10).nullable().optional(),
        }).optional(),
        escritorio: z.object({
          atendimento: z.number().int().min(0).max(10).nullable().optional(),
          faturamento: z.number().int().min(0).max(10).nullable().optional(),
          documentacao: z.number().int().min(0).max(10).nullable().optional(),
          agilidade: z.number().int().min(0).max(10).nullable().optional(),
          comunicacao: z.number().int().min(0).max(10).nullable().optional(),
        }).optional(),
      }).optional(),
    })).mutation(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      // Rev. 2892 — se o link foi gerado POR OBRA, a obra do token MANDA (trava):
      // ignora qualquer obraId vindo do cliente p/ evitar avaliação na obra errada.
      const obraIdEfetivo: number | null = (decoded.obraId ? Number(decoded.obraId) : null) ?? (input.obraId ?? null);
      // Rev. 2978 — GARANTIA: NUNCA existe avaliação sem obra vinculada. Bloqueia o
      // envio (inclusive de links ANTIGOS "geral" sem obraId no token) na origem.
      if (!obraIdEfetivo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta avaliação precisa estar vinculada a uma obra. Solicite um novo link de avaliação ao FC." });
      }
      // ANÔNIMA: NÃO armazena clienteId, credId, IP nem user-agent.
      let obraNome: string | null = null;
      if (obraIdEfetivo) {
        await _assertObraPermitida(db, decoded, obraIdEfetivo); // Rev. 2851 — whitelist da credencial
        // Rev. 2892 — tenant guard: a obra DEVE pertencer à empresa do token,
        // independentemente de credencial (link público geral pula a whitelist).
        // Sem isso, um obraId arbitrário gravaria com o companyId do token (IDOR).
        const [o] = await db.select({ nome: obras.nome }).from(obras).where(and(
          eq(obras.id, obraIdEfetivo),
          eq(obras.companyId, decoded.companyId),
          isNull(obras.deletedAt),
        ));
        if (!o) throw new TRPCError({ code: "FORBIDDEN", message: "Obra inválida para esta avaliação." });
        obraNome = o.nome ?? null;
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
        // Rev. 2974 — claim atômico que TAMBÉM revive marcações liberadas
        // (soft-release): se a linha existe mas está `liberada_em IS NOT NULL`,
        // o DO UPDATE a reativa (liberada_em=NULL) e RETURNING devolve → permite.
        // Se está ativa (liberada_em IS NULL), o WHERE falha → 0 linhas → bloqueia.
        const claim = await db.execute(sql`
          INSERT INTO cliente_avaliacao_marcacoes (cred_id, ano_mes)
          VALUES (${credId}, ${anoPeriodo})
          ON CONFLICT (cred_id, ano_mes) DO UPDATE SET liberada_em = NULL
            WHERE cliente_avaliacao_marcacoes.liberada_em IS NOT NULL
          RETURNING cred_id
        `);
        const claimRows = ((claim as any).rows ?? claim ?? []) as any[];
        if (claimRows.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: `Você já enviou a avaliação deste ${labelPer}. Volte no próximo ${labelPer}.` });
        }
      }
      // Rev. 2965 — colunas-resumo derivadas da MÉDIA dos critérios detalhados.
      // Mantém compat: se o cliente enviar a nota-resumo direta (form antigo), ela vence;
      // senão calcula a média (arredondada) dos critérios preenchidos.
      const det = input.detalhes;
      const mediaNotas = (...vals: Array<number | null | undefined>): number | null => {
        const nums = vals.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
        if (nums.length === 0) return null;
        return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
      };
      const g = det?.gestor;
      const e = det?.equipe;
      const esc = det?.escritorio;
      const notaGestorFinal = input.notaGestor ?? (g ? mediaNotas(g.postura, g.documentos, g.prontoAtendimento, g.disponibilidade, g.conhecimentoTecnico, g.educacao) : null);
      const notaEquipeFinal = input.notaEquipe ?? (e ? mediaNotas(e.tecnica, e.organizacao, e.seguranca, e.pontualidade, e.educacao, e.comunicacao) : null);
      const notaEscritorioFinal = input.notaEscritorio ?? (esc ? mediaNotas(esc.atendimento, esc.documentacao, esc.agilidade, esc.comunicacao) : null);
      const notaFaturamentoFinal = input.notaFaturamento ?? (esc?.faturamento ?? null);
      const gestorNomeFinal = (input.gestorNome || g?.nome || "").trim() || null;

      // Rev. 2973 — CLAIM do LINK DE USO ÚNICO + insert da avaliação na MESMA
      // transação: se o token traz `linkId`, "consome" o link atomicamente
      // (PK + ON CONFLICT DO NOTHING). Se o insert da avaliação falhar, a
      // transação faz ROLLBACK e o link NÃO fica gasto (sem persistência).
      // Links antigos (sem `linkId`) seguem o comportamento anterior.
      const novaAval = await db.transaction(async (tx: any) => {
        if (decoded.linkId) {
          const claimLink = await tx.execute(sql`
            INSERT INTO cliente_avaliacao_link_uso (link_id, company_id, obra_id)
            VALUES (${String(decoded.linkId)}, ${decoded.companyId ?? null}, ${obraIdEfetivo})
            ON CONFLICT (link_id) DO NOTHING
            RETURNING link_id
          `);
          const linkRows = ((claimLink as any).rows ?? claimLink ?? []) as any[];
          if (linkRows.length === 0) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Este link de avaliação já foi utilizado. Cada link permite apenas uma avaliação." });
          }
        }
        const [row] = await tx.insert(clienteAvaliacoes).values({
          companyId: decoded.companyId,
          obraId: obraIdEfetivo,
          obraNome,
          notaEquipe: notaEquipeFinal,
          notaObra: input.notaObra ?? null,
          notaAtendimento: input.notaAtendimento ?? null,
          notaPrazo: input.notaPrazo ?? null,
          notaQualidade: input.notaQualidade ?? null,
          notaEmpresa: input.notaEmpresa ?? null,
          notaGestor: notaGestorFinal,
          // Rev. 1592 — Escritório Central
          notaEscritorio: notaEscritorioFinal,
          notaFaturamento: notaFaturamentoFinal,
          notaGeral: input.notaGeral,
          comentarioPositivo: input.comentarioPositivo || null,
          comentarioMelhoria: input.comentarioMelhoria || null,
          comentarioEquipe: input.comentarioEquipe || null,
          comentarioEmpresa: input.comentarioEmpresa || null,
          comentarioGestor: input.comentarioGestor || null,
          comentarioEscritorio: input.comentarioEscritorio || null,
          gestorNome: gestorNomeFinal,
          recomendaria: input.recomendaria ?? null,
          anoPeriodo,
          // Rev. 2982 — tempo de preenchimento (interno, p/ Admin Master).
          tempoRespostaSegundos: input.tempoRespostaSegundos ?? null,
        }).returning({ id: clienteAvaliacoes.id });
        return row;
      });

      // Rev. 2965 — persiste o detalhamento granular (1 linha por avaliação) quando enviado.
      if (det && novaAval?.id) {
        try {
          await db.insert(clienteAvaliacaoDetalhes).values({
            avaliacaoId: novaAval.id,
            companyId: decoded.companyId,
            dados: det,
          });
        } catch (errDet: any) {
          // Não derruba a avaliação se o detalhamento falhar (self-heal pode estar em curso).
          console.error("[criarAvaliacao] falha ao gravar detalhes:", errDet?.message || errDet);
        }
      }

      // Rev. 1595 — Persiste respostas das perguntas extras vinculadas a esta avaliação.
      // Valida que cada perguntaId pertence à mesma empresa antes de inserir.
      const extras = (input.respostasExtras || []).filter(r =>
        (r.valorNumero !== null && r.valorNumero !== undefined) ||
        (r.valorTexto && r.valorTexto.trim().length > 0)
      );
      if (extras.length > 0 && novaAval?.id) {
        const perguntasValidas = await db.select({
          id: clientePerguntasExtras.id,
          tipo: clientePerguntasExtras.tipo,
        }).from(clientePerguntasExtras).where(and(
          eq(clientePerguntasExtras.companyId, decoded.companyId),
          inArray(clientePerguntasExtras.id, extras.map(e => e.perguntaId)),
        ));
        const validMap = new Map(perguntasValidas.map((p: any) => [p.id, p.tipo]));
        const insertVals = extras
          .filter(e => validMap.has(e.perguntaId))
          .map(e => {
            const tipo = validMap.get(e.perguntaId);
            const isNumero = tipo === "nota_0_10" || tipo === "sim_nao_talvez";
            // Rev. 1595 — valida domínio numérico por tipo.
            // nota_0_10 ∈ [0,10]; sim_nao_talvez ∈ {0,1,2}. Fora disso, descarta.
            let valorNumero: number | null = null;
            if (isNumero && e.valorNumero !== null && e.valorNumero !== undefined) {
              const n = Math.trunc(e.valorNumero);
              if (tipo === "nota_0_10" && n >= 0 && n <= 10) valorNumero = n;
              else if (tipo === "sim_nao_talvez" && (n === 0 || n === 1 || n === 2)) valorNumero = n;
            }
            return {
              avaliacaoId: novaAval.id,
              perguntaId: e.perguntaId,
              valorNumero,
              valorTexto: !isNumero ? (e.valorTexto?.trim() || null) : null,
            };
          })
          .filter(v => v.valorNumero !== null || v.valorTexto !== null);
        if (insertVals.length > 0) {
          await db.insert(clienteRespostasExtras).values(insertVals);
        }
      }
      // Rev. 2985 — ALERTA por e-mail aos admins quando o cliente PREENCHE a
      // avaliação. Fire-and-forget (não derruba o envio se o SMTP falhar) e
      // ANÔNIMO: e-mail traz só obra + nota geral + recomendação, NUNCA identidade.
      // TENANT GUARD: notifica APENAS os admins (admin_master/admin) VINCULADOS à
      // empresa da avaliação via `user_companies` — nunca admins de outra empresa.
      (async () => {
        try {
          const dests = await db.select({ name: users.name, email: users.email })
            .from(users)
            .innerJoin(userCompanies, eq(userCompanies.userId, users.id))
            .where(and(
              eq(userCompanies.companyId, decoded.companyId),
              inArray(users.role, ["admin_master", "admin"]),
              isNull(users.deletedAt),
            ));
          const emails = Array.from(new Set(
            (dests as any[]).map((u) => u.email).filter((e: any) => !!e) as string[],
          ));
          if (emails.length === 0) return;
          const recMap: Record<number, string> = { 0: "Não", 1: "Talvez", 2: "Sim, com certeza" };
          const recTxt = (input.recomendaria === 0 || input.recomendaria === 1 || input.recomendaria === 2)
            ? recMap[input.recomendaria] : "—";
          const obraTxt = obraNome || (obraIdEfetivo ? `Obra #${obraIdEfetivo}` : "—");
          const assunto = `Nova avaliação NPS — ${obraTxt}`;
          const html = `
            <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937">
              <h2 style="color:#1B2A4A;margin:0 0 8px">Nova avaliação NPS recebida</h2>
              <p style="margin:0 0 12px;color:#475569">Um cliente acabou de enviar uma avaliação (100% anônima) pelo Portal do Cliente.</p>
              <table style="border-collapse:collapse;font-size:14px">
                <tr><td style="padding:4px 12px 4px 0;color:#64748b">Obra</td><td style="padding:4px 0;font-weight:600">${obraTxt}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#64748b">Nota geral</td><td style="padding:4px 0;font-weight:600">${input.notaGeral}/10</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#64748b">Recomendaria a FC?</td><td style="padding:4px 0;font-weight:600">${recTxt}</td></tr>
              </table>
              <p style="margin:14px 0 0;color:#94a3b8;font-size:12px">Esta avaliação é anônima — não registramos identidade, CNPJ nem IP do respondente.</p>
            </div>`;
          await sendEmail({
            to: emails.join(", "),
            subject: assunto,
            html,
          });
        } catch (errMail: any) {
          console.error("[criarAvaliacao] falha ao enviar alerta de e-mail:", errMail?.message || errMail);
        }
      })();
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
      // Rev. 2971 — resolve gestor + encarregado AO VIVO do efetivo da obra
      // embutida no token, p/ que o pré-preenchimento funcione mesmo em links
      // ANTIGOS (gerados antes da Rev. 2965/2970, sem esses nomes no JWT) e
      // reflita trocas no efetivo. Defensivo: qualquer falha mantém null (manual).
      let gestorNome: string | null = null;
      let encarregadoNome: string | null = null;
      // Rev. 2977 — devolve TAMBÉM obraId/obraNome resolvidos a partir do token
      // VERIFICADO (jwt.verify) p/ o front travar a obra de forma AUTORITATIVA,
      // sem depender só do parse base64 client-side do JWT (defense-in-depth).
      let obraIdTok: number | null = decoded.obraId ? Number(decoded.obraId) : null;
      let obraNomeTok: string | null = (decoded.obraNome ?? null) || null;
      if (decoded.obraId) {
        try {
          const [o] = await db.select({ nome: obras.nome, responsavel: obras.responsavel }).from(obras).where(and(
            eq(obras.id, Number(decoded.obraId)),
            eq(obras.companyId, decoded.companyId),
            isNull(obras.deletedAt),
          ));
          obraNomeTok = (o?.nome || "").trim() || obraNomeTok;
          gestorNome = (o?.responsavel || "").trim() || null;
          const equipe = await getEquipeObra(Number(decoded.obraId), decoded.companyId);
          const enc = equipe.find((e: any) =>
            e.categoria === "Indireto" &&
            /ENCARREGAD/.test(`${e.funcao || ""} ${e.cargo || ""}`.toUpperCase())
          );
          encarregadoNome = (enc?.nomeCompleto || "").trim() || null;
        } catch { encarregadoNome = null; }
      }
      // Rev. 2973 — LINK DE USO ÚNICO: se o token tem `linkId`, o "já avaliou" é
      // por LINK (consumido em cliente_avaliacao_link_uso), independente de credId.
      if (decoded.linkId) {
        const usado = await db.execute(sql`SELECT 1 FROM cliente_avaliacao_link_uso WHERE link_id = ${String(decoded.linkId)} LIMIT 1`);
        const usadoRows = ((usado as any).rows ?? usado ?? []) as any[];
        const jaUsado = usadoRows.length > 0;
        return { podeAvaliar: !jaUsado, jaAvaliou: jaUsado, anoMes, periodicidade, gestorNome, encarregadoNome, obraId: obraIdTok, obraNome: obraNomeTok };
      }
      if (!credId) return { podeAvaliar: true, jaAvaliou: false, anoMes, periodicidade, gestorNome, encarregadoNome, obraId: obraIdTok, obraNome: obraNomeTok };
      const ja = await db.execute(sql`SELECT 1 FROM cliente_avaliacao_marcacoes WHERE cred_id = ${credId} AND ano_mes = ${anoMes} AND liberada_em IS NULL LIMIT 1`);
      const rows = ((ja as any).rows ?? ja ?? []) as any[];
      return { podeAvaliar: rows.length === 0, jaAvaliou: rows.length > 0, anoMes, periodicidade, gestorNome, encarregadoNome, obraId: obraIdTok, obraNome: obraNomeTok };
    }),

    // Rev. 2980 — SHORT-LINK: resolve o CÓDIGO CURTO (/a/<codigo>) → token JWT
    // completo. Público (sem login). Código inexistente → token null (a UI mostra
    // "link inválido"). Resolve o problema do WhatsApp truncar o JWT longo na URL.
    resolverLinkAvaliacao: publicProcedure.input(z.object({
      codigo: z.string().min(1).max(64),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      try {
        const r = await db.execute(sql`SELECT token FROM cliente_avaliacao_shortlink WHERE codigo = ${input.codigo} LIMIT 1`);
        const row = (((r as any).rows ?? r ?? []) as any[])[0];
        return { token: (row?.token as string) || null };
      } catch { return { token: null }; }
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
      await _assertObraPermitida(db, decoded, input.obraId); // Rev. 2851

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
      await _assertObraPermitida(db, decoded, input.obraId); // Rev. 2851

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
        // Rev. 1685 — Datas REAIS por atividade (necessárias para a coluna
        // Real e para a barra verde de execução nas células diárias da
        // Programação Semanal LOTUS). Sem isso, o LOTUS do Portal pintava
        // apenas a barra azul (previsto) e mostrava "—" nas colunas Real
        // mesmo quando o módulo Planejamento já tinha datas reais lançadas.
        dataInicioReal: _toDateStr(a.dataInicioReal),
        dataFimReal: _toDateStr(a.dataFimReal),
        responsavelLotus: a.responsavelLotus ?? null,
        pesoFinanceiro: Number(a.pesoFinanceiro || 0),
        recursoPrincipal: a.recursoPrincipal,
        isGrupo: a.isGrupo,
        isMarco: a.isMarco,
        isIndireta: a.isIndireta,
        isExterna: a.isExterna,
        externaResponsavel: a.externaResponsavel,
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
      // ── Rev. 1637 — Data de Corte (Status Date PMBOK/EVM) ─────────────
      // Portal SEMPRE usa o último cutoff fechado pelo engenheiro (quinta).
      // Entre uma atualização e a próxima o cliente NÃO vê desvio fantasma:
      // o denominador (PV) congela junto com o numerador (EV) na mesma data.
      // Default quando o projeto nunca foi fechado: última quinta ≤ today.
      const { cutoffEfetivo, proximoDiaSemana, todayBR, DIA_CORTE_DEFAULT } = await import("../../shared/dataCorte");
      const { parseCalendarioJson, fracaoDecorridaMs } = await import("../../shared/diasUteis");
      const todayRealStr = todayBR();
      // Rev. 1647 — respeita o dia da semana do cutoff configurado por
      // projeto (default qui=4). Garante paridade Portal × Planejamento
      // mesmo para projetos com cutoff em dia diferente de quinta.
      const dowProj = ((projeto as any).diaCorteSemana ?? DIA_CORTE_DEFAULT) as number;
      const cutoffStr = cutoffEfetivo(_toDateStr((projeto as any).dataCorteAtual), todayRealStr, dowProj);
      const todayStr = cutoffStr; // Portal externo: cutoff oficial substitui today
      // Rev. 1642 — calendário MS Project (paridade 100% Project × ERP).
      // Quando NULL, fracaoDecorridaMs cai para interpolação linear (legado).
      const calMSP = parseCalendarioJson((projeto as any).calendarioJson);
      const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim);

      // ALINHAMENTO COM TELA INTERNA (PlanejamentoDetalhe.tsx calcPesoTotal):
      // semPeso só quando pesoBruto === 0 (TODAS sem peso). Removido o limiar
      // de <20% que existia antes e causava divergência (2,19% portal vs
      // 1,84% interno) quando a obra tinha algumas atividades sem peso.
      const pesoBruto = folhas.reduce((s: number, a: any) => s + _n(a.pesoFinanceiro), 0);
      const usarIgual = pesoBruto === 0;
      const pesoTotal = usarIgual ? (folhas.length || 1) : pesoBruto;
      const pesoDe = (a: any) => usarIgual ? 1 : _n(a.pesoFinanceiro);

      // Semana atual (segunda → domingo) — referenciada à DATA DE CORTE,
      // não ao `today()` real, para evitar atraso fantasma entre quintas.
      const cutoffDate = new Date(cutoffStr + "T12:00:00Z");
      const dow = cutoffDate.getUTCDay();
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(cutoffDate); monday.setUTCDate(cutoffDate.getUTCDate() + diffToMon);
      const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
      const monStr = monday.toISOString().slice(0, 10);
      const sunStr = sunday.toISOString().slice(0, 10);
      // % Previsto — referenciado ao PRÓPRIO cutoff (Status Date), espelhando
      // o Texto10 da linha-resumo do MS Project (Rev. 1646.1). Não extrapola
      // para o fim da semana corrente — isso inflava o número (ex.: 07/05 →
      // ref vira 11/05 → 6 dias úteis em vez de 4 = 2,11% em vez de 1,41%).
      const refMs = new Date(cutoffStr + "T12:00:00Z").getTime();
      // Rev. 1646 — Paridade 100% MS Project: % Previsto agora replica a fórmula
      // da coluna "%PREVISTO (Texto10)" do MS Project (`fracao_dias_uteis(início,
      // ref) / total_dias_uteis`), aplicada no nível-resumo do projeto. NÃO mais
      // média ponderada por `pesoFinanceiro`. Validado no XML REVTE-CIVIL: raiz
      // 284 dias úteis, 4 decorridos em 07/05/2026 → 4/284 = 1,41%.
      let projIni = Infinity, projFim = -Infinity;
      let somaRealizado = 0;
      for (const a of folhas) {
        const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
        const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
        if (ini < projIni) projIni = ini;
        if (fim > projFim) projFim = fim;
        const peso = pesoDe(a);
        somaRealizado += (ultimoAvancoPorAtiv[a.id] ?? 0) * (peso / pesoTotal);
      }
      // Rev. 1646.2 — prioridade ABSOLUTA: usa as datas oficiais da raiz do MSP
      // (gravadas em projeto.dataInicio + projeto.dataTerminoContratual no import).
      // Fallback para min/max das folhas só se não foram importadas. Garante
      // paridade Texto10 do MSP (envelope = root oficial, não envelope de folhas).
      const projIniIsoOfic = (projeto as any)?.dataInicio as string | null | undefined;
      const projFimIsoOfic = (projeto as any)?.dataTerminoContratual as string | null | undefined;
      let projIniEff = projIni, projFimEff = projFim;
      if (projIniIsoOfic && projFimIsoOfic) {
        projIniEff = new Date(projIniIsoOfic + "T12:00:00Z").getTime();
        projFimEff = new Date(projFimIsoOfic + "T12:00:00Z").getTime();
      }
      // Rev. 1646.4 — paridade EXATA com MSP: quando o cutoff bate com o
      // StatusDate gravado no XML, usa o snapshot do %PREVISTO calculado
      // pelo próprio MSP (Texto11 da raiz). Sem isso, a aritmética interna
      // de `ProjDateDiff` (minutos com horas parciais) gera divergência.
      // Validação de stale: snapshot só é confiável se cutoff = StatusDate E
      // o envelope do projeto não foi editado depois do import.
      const envSnapOk = !calMSP?.envelopeStartSnapshot || !calMSP?.envelopeFinishSnapshot
        || ((projeto as any)?.dataInicio === calMSP.envelopeStartSnapshot
            && (projeto as any)?.dataTerminoContratual === calMSP.envelopeFinishSnapshot);
      const usaSnapshot = calMSP?.previstoMspSnapshot != null
        && calMSP?.statusDateSnapshot
        && cutoffStr === calMSP.statusDateSnapshot
        && envSnapOk;
      // Rev. 3288 — PARIDADE TOTAL Portal × Planejamento: o "% Previsto" passa a
      // espelhar EXATAMENTE o módulo interno, lendo a MESMA curva única
      // (`previsto_semanas_json` + override literal `previsto_literal_json`) via o
      // helper compartilhado `parsePrevistoCurva().raizAt(cutoff)` — réplica fiel
      // do hook `previstoCurva.raizAt` de PlanejamentoDetalhe.tsx. Antes o Portal
      // usava `previstoMspSnapshot` (Texto11 da raiz), que divergia da curva no
      // MESMO cutoff (ex.: REVTE-CIVIL — Portal 8% vs módulo 9% em 11/06). Fallback
      // p/ o snapshot/linear SÓ quando a curva está ausente/stale (XML antigo ou
      // revisão divergente). REGRA DE OURO: só REPLICA o snapshot do MSP.
      const { parsePrevistoCurva } = await import("../../shared/previstoCurva");
      const previstoCurva = parsePrevistoCurva(
        (projeto as any).previstoSemanasJson,
        (projeto as any).previstoLiteralJson,
        revisao.id,
      );
      const previstoDaCurva = previstoCurva ? previstoCurva.raizAt(cutoffStr) : null;
      const pctTotalPrevisto = (previstoDaCurva != null && Number.isFinite(previstoDaCurva))
        ? +Number(previstoDaCurva).toFixed(2)
        : usaSnapshot
          ? +Number(calMSP!.previstoMspSnapshot).toFixed(2)
          : (isFinite(projIniEff) && isFinite(projFimEff) && projFimEff > projIniEff)
            ? +Math.min(100, fracaoDecorridaMs(projIniEff, refMs, projFimEff, calMSP) * 100).toFixed(2)
            : 0;
      // Rev. 3286 — REALIZADO do Portal ESPELHA o snapshot MSP da raiz UID=0
      // (`realizadoMspSnapshot` = AD/(AD+RD)) — IDÊNTICO ao módulo Planejamento
      // (`PlanejamentoDetalhe.avancoAtual`). Antes o Portal recalculava a média
      // ponderada por `pesoFinanceiro` (`somaRealizado`), que divergia do módulo
      // (ex.: REVTE-CIVIL — Portal 20,72% vs Planejamento 9,00%). REGRA DE OURO:
      // o Portal só REPLICA o Planejamento (snapshot do XML do MS Project), NUNCA
      // recalcula. Gate igual ao do %Previsto (snapshot presente + statusDate +
      // envelope intacto) + monotonicidade: o cutoff cobre o statusDate
      // (`cutoffStr >= statusDateSnapshot`, espelha `semFimVis >= sd` do módulo).
      // Fallback p/ o cálculo ponderado SÓ quando o snapshot está ausente/stale
      // (XML antigo sem AD/RD gravado) — UI continua mostrando algo, não zero.
      const usaSnapshotReal = calMSP?.realizadoMspSnapshot != null
        && !!calMSP?.statusDateSnapshot
        && envSnapOk
        && cutoffStr >= calMSP.statusDateSnapshot;
      const pctTotalRealizado = usaSnapshotReal
        ? +Math.min(100, Math.max(0, Number(calMSP!.realizadoMspSnapshot))).toFixed(2)
        : +Math.min(100, somaRealizado).toFixed(2);
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
      // Rev. 3288 — Curva S de Trabalho IDÊNTICA ao módulo: reusa o NÚCLEO
      // compartilhado `computeCurvaSData` (extraído de planejamento.getCurvaS),
      // com pesagem por DURAÇÃO (`usarPesoPorDuracao:true` = curva de TRABALHO),
      // ativando o snapshot-baseline (`curvaPrevistoSnapshot`) e o override do
      // realizado pelo `realizadoMspSnapshot` no StatusDate — exatamente como o
      // engenheiro vê na tela interna. Fallback p/ a curva ponderada local (acima)
      // SÓ se o núcleo falhar. REGRA DE OURO: o Portal só REPLICA o Planejamento.
      let curvaData: {
        curvaBaseline: { semana: string; acumulado: number }[];
        curvaPlanejada: { semana: string; acumulado: number }[];
        curvaRealizada: { semana: string; acumulado: number }[];
        curvaTendencia: { semana: string; acumulado: number }[];
      };
      try {
        const { computeCurvaSData } = await import("./planejamento");
        curvaData = await computeCurvaSData({
          projetoId: projeto.id,
          revisaoId: revisao.id,
          baselineId: baselineRev?.id ?? revisao.id,
          usarPesoPorDuracao: true,
        });
      } catch (errCurvaNucleo) {
        console.error(
          `[Portal/CurvaS] Núcleo compartilhado computeCurvaSData falhou (projeto ${projeto.id}, revisão ${revisao.id}) — usando fallback ponderado local:`,
          errCurvaNucleo,
        );
        curvaData = {
          curvaBaseline,
          curvaPlanejada: curvaPlanejadaSep,
          curvaRealizada: curvaRealizadaSerie,
          curvaTendencia,
        };
      }

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
          // Rev. 1642 — Previsto até cutoff usando calendário MS Project (paridade 100%).
          const pctPrev = fracaoDecorridaMs(ini, tod, fim, calMSP) * 100;
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

      // Rev. 1683 — avanços brutos (planejamento_avancos) que a Programação
      // Semanal LOTUS consome para calcular PV/EV/Δ semanais por atividade.
      // No ERP esses dados vêm via `trpc.planejamento.listarAvancos`, que
      // exige sessão autenticada e companyId>0 — indisponível no Portal.
      // Forwardamos a mesma forma (atividadeId, semana ISO, percentualAcumulado,
      // percentualSemanal) para que o componente reuse a lógica existente.
      const avancosLista = avancosRaw.map((av: any) => ({
        atividadeId: av.atividadeId as number,
        semana: _toDateStr(av.semana),
        percentualAcumulado: _n(av.percentualAcumulado),
        percentualSemanal: _n(av.percentualSemanal),
      }));

      return {
        obra,
        abasLiberadas,
        avancosLista,
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
        // Rev. 1637 — Data de Corte oficial (Status Date PMBOK/EVM). Portal usa
        // esta data como denominador de TODOS os indicadores (PV/EV/atrasadas/
        // semana atual). Frontend exibe banner com "Atualizado em DD/MM" e
        // "Próxima atualização: DD/MM (quinta)" para o cliente entender que
        // os números congelam entre uma quinta e a próxima.
        dataCorte: {
          oficial: cutoffStr,
          atualizadoEm: (projeto as any).dataCorteAtualizadaEm ?? null,
          atualizadoPor: (projeto as any).dataCorteAtualizadaPor ?? null,
          proximaAtualizacao: proximoDiaSemana(cutoffStr, dowProj),
          nuncaFechado: !(projeto as any).dataCorteAtual,
          hoje: todayRealStr,
        },
        // Rev. 1642 — calendário do MS Project para o Portal interpolar
        // Previsto% por dias úteis (paridade 100% com ERP/MS Project).
        calendarioJson: (projeto as any).calendarioJson ?? null,
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
      await _assertObraPermitida(db, decoded, input.obraId); // Rev. 2851

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

        // Rev. 1722 — Integração SST: fonte trocada de `sst_integracao_registros`
        // (legado, sempre vazio para muitas obras) para `employee_integrations`,
        // mesma tabela usada pelo módulo Integração SST e pelo Planejamento
        // (Rev. 1714). Schema tem `dataVencimento` (não `dataValidade`), `evidencia`
        // (não `certificadoUrl`) e NÃO tem coluna `status` — vigência é calculada
        // em runtime pelo vencimento. Mantém o mapa por employeeId pegando o
        // registro mais recente.
        const integRows = await db.select({
          id: employeeIntegrations.id,
          employeeId: employeeIntegrations.employeeId,
          dataRealizacao: employeeIntegrations.dataRealizacao,
          dataValidade: employeeIntegrations.dataVencimento,
          evidencia: employeeIntegrations.evidencia,
        }).from(employeeIntegrations).where(and(
          eq(employeeIntegrations.companyId, decoded.companyId),
          inArray(employeeIntegrations.employeeId, empIds),
        )).orderBy(desc(employeeIntegrations.dataRealizacao));
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
            temPdf: !!integ.evidencia,
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
      await _assertObraPermitida(db, decoded, input.obraId); // Rev. 2851

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
      let obraIds = obrasCliente.map((o) => o.id);
      // Rev. 2851 — intersecta com as obras liberadas para ESTA credencial.
      const wlRev = await _obrasLiberadasDaCredencial(db, decoded);
      if (wlRev !== null) obraIds = obraIds.filter((id) => wlRev.includes(id));
      if (obraIds.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Nenhuma obra liberada para este usuário." });

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

    // Rev. 1595 — Perguntas extras (personalizadas) que o admin configurou
    // para o questionário desta empresa. Retorna SOMENTE perguntas ativas,
    // ordenadas pela ordem definida no editor.
    listarPerguntasExtras: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await db.select().from(clientePerguntasExtras)
        .where(and(
          eq(clientePerguntasExtras.companyId, decoded.companyId),
          eq(clientePerguntasExtras.ativa, true),
        ))
        .orderBy(clientePerguntasExtras.ordem, clientePerguntasExtras.id);
      return rows;
    }),

    // Rev. 1597 — Rótulos personalizados das 8 perguntas CORE para esta empresa.
    listarLabelsCore: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const secret = process.env.JWT_SECRET || "portal-secret";
      let decoded: any;
      try { decoded = jwt.verify(input.token, secret); } catch { throw new TRPCError({ code: "UNAUTHORIZED" }); }
      if (decoded.tipo !== "cliente") throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await db.execute(sql`
        SELECT chave, label FROM cliente_perguntas_core_overrides
        WHERE company_id = ${decoded.companyId}
      `).then((r: any) => (r.rows ?? r ?? [])) as any[];
      const map: Record<string, string> = {};
      for (const r of rows) map[String(r.chave)] = String(r.label);
      return map;
    }),
  }),

  // ========== VERIFICAÇÃO PÚBLICA (QR CODE) ==========
  verificar: router({
    // Verificar aptidão de funcionário CLT/PJ pelo QR Code.
    // Rev. 4607: cálculo AO VIVO direto de asos/trainings (a tabela-snapshot
    // employee_aptidao ficava defasada e dizia "sem documentos" p/ quem tinha
    // tudo em dia no Controle de Documentos). Devolve também a lista de
    // documentos PERTINENTES (ASO + treinamentos/NRs com validade) — nada
    // sensível/LGPD: sem RG, sem CPF completo, sem atestados médicos.
    funcionario: publicProcedure.input(z.object({
      id: z.number(),
      tipo: z.enum(["clt", "pj"]),
    })).query(async ({ input }) => {
      const db = (await getDb())!;
      const [emp] = await db.select().from(employees)
        .where(and(eq(employees.id, input.id), isNull(employees.deletedAt))).limit(1);
      if (!emp) return { found: false, message: "Funcionário não encontrado" };

      const [company] = await db.select().from(companies).where(eq(companies.id, emp.companyId)).limit(1);

      const hoje = new Date().toISOString().split("T")[0];

      // ASO mais recente (mesma regra do recálculo do Controle de Documentos)
      const asosResult = await db.select({
        tipo: asos.tipo, dataExame: asos.dataExame, dataValidade: asos.dataValidade,
        restricoes: asos.restricoes, aptoAltura: asos.aptoAltura,
        restricoesOperacionaisRaw: (asos as any).restricoesOperacionais,
      }).from(asos)
        .where(and(eq(asos.employeeId, emp.id), eq(asos.companyId, emp.companyId), isNull(asos.deletedAt)))
        .orderBy(desc(asos.dataExame));
      const asoAtual = asosResult[0] || null;
      // Rev. 4609 — restrição de atividade: SOMENTE flag genérica (LGPD — o
      // texto da restrição é dado de saúde e NUNCA sai na rota pública)
      const aptoAlturaNorm = String(asoAtual?.aptoAltura || "").toUpperCase().replace(/[\s.\-]/g, "");
      const restricaoAtividade = String(asoAtual?.restricoes || "").trim().length > 0
        || String((asoAtual as any)?.restricoesOperacionaisRaw || "").trim().length > 2 // "[]" não conta
        || aptoAlturaNorm.startsWith("INAPTO") || aptoAlturaNorm.startsWith("NAO") || aptoAlturaNorm.startsWith("NÃO");

      // Rev. 4620 — restrição OPERACIONAL no QR público (LGPD, minimização):
      // mostramos apenas O QUE a pessoa não pode fazer (instrução de segurança,
      // base legal: proteção da vida / NRs), NUNCA o porquê médico. Sanitizador
      // conservador: qualquer indício de dado de saúde (código CID, termos de
      // diagnóstico) bloqueia a linha inteira e mantém só o aviso genérico.
      // SAÍDA CANÔNICA (deny-by-default): o QR NUNCA exibe texto do ASO. A linha
      // do texto livre apenas DISPARA uma frase fixa deste dicionário quando
      // (a) tem cara de instrução ("não pode…", "proibido…", "evitar…") e
      // (b) cita uma atividade conhecida. Vazamento de dado de saúde é
      // impossível por construção — nada fora do dicionário sai na rota pública.
      const restricoesOperacionais: string[] = [];
      {
        // Rev. 4622 — PRIORIDADE: checkboxes estruturadas do RH (asos.restricoesOperacionais,
        // keys do dicionário canônico) — fonte explícita, sem depender do texto do médico.
        const { parseRestricoesOperacionais, labelRestricaoOperacional } = await import("../../shared/restricoesOperacionais");
        for (const key of parseRestricoesOperacionais((asoAtual as any)?.restricoesOperacionaisRaw)) {
          const label = labelRestricaoOperacional(key);
          if (label && !restricoesOperacionais.includes(label)) restricoesOperacionais.push(label);
        }
        const OPERACIONAL_RE = /(n[ãa]o\s+(pode|deve|permitid|autorizad|realizar|executar|trabalhar)|proibid|vedad|restri[çc][ãa]o\s+(de|para|a)|restrit[oa]\s+(de|para|a)|evitar|sem\s+(trabalho|exposi[çc]|levantamento|esfor[çc])|inapt[oa]\s+para)/i;
        const CANONICOS: Array<[RegExp, string]> = [
          [/altura/i, "Trabalho em altura: NÃO permitido"],
          [/espa[çc]o\s*confinado/i, "Espaço confinado: NÃO permitido"],
          [/(peso|carga|levantamento|esfor[çc]o\s*f[íi]sic)/i, "Levantamento de peso / esforço físico: restrito"],
          [/ru[íi]do/i, "Exposição a ruído: restrita"],
          [/(calor|temperatura)/i, "Exposição a calor: restrita"],
          [/(eletricidade|el[ée]tric)/i, "Trabalho com eletricidade: NÃO permitido"],
          [/noturno/i, "Trabalho noturno: NÃO permitido"],
          [/(m[áa]quina|equipamento)/i, "Operação de máquinas/equipamentos: restrita"],
          [/(qu[íi]mic|poeira|solvente)/i, "Exposição a agentes químicos/poeira: restrita"],
          [/(dirigir|ve[íi]culo|condu[çc][ãa]o)/i, "Condução de veículos: NÃO permitida"],
          [/(soldag|solda\b)/i, "Atividades de soldagem: restritas"],
          [/(escava[çc]|subsolo)/i, "Trabalho em escavação/subsolo: restrito"],
        ];
        const raw = String(asoAtual?.restricoes || "");
        for (const parte of raw.split(/[;\n•.]+/)) {
          const txt = parte.trim().replace(/\s+/g, " ");
          if (!txt || !OPERACIONAL_RE.test(txt)) continue; // não é instrução → ignora
          for (const [re, frase] of CANONICOS) {
            if (re.test(txt) && !restricoesOperacionais.includes(frase)) restricoesOperacionais.push(frase);
          }
        }
        if (aptoAlturaNorm.startsWith("INAPTO") || aptoAlturaNorm.startsWith("NAO") || aptoAlturaNorm.startsWith("NÃO")) {
          const fraseAltura = "Trabalho em altura: NÃO permitido";
          if (!restricoesOperacionais.includes(fraseAltura)) restricoesOperacionais.unshift(fraseAltura);
        }
      }
      const asoVigente = !!(asoAtual && asoAtual.dataValidade && asoAtual.dataValidade >= hoje);

      // Rev. 4638 — parse robusto de data (aceita YYYY-MM-DD, timestamp ISO e
      // DD/MM/YYYY; senão null) — nunca comparação lexicográfica de texto cru
      const parseDia = (v: any): string | null => {
        const s = String(v || "").trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return null;
      };

      // Rev. 4637 — integrações de cliente (ex.: Santuário): quem escaneia o QR
      // na portaria precisa ver se a integração está vigente. LGPD-safe: só
      // cliente, tipo e datas (mesma regra de status do módulo Integrações).
      const integracoesRows = await db.select({
        tipo: employeeIntegrations.tipo,
        clienteNome: employeeIntegrations.clienteNome,
        dataRealizacao: employeeIntegrations.dataRealizacao,
        dataVencimento: employeeIntegrations.dataVencimento,
      }).from(employeeIntegrations)
        .where(and(eq(employeeIntegrations.employeeId, emp.id), eq(employeeIntegrations.companyId, emp.companyId)))
        .orderBy(desc(employeeIntegrations.dataRealizacao));
      const integracoes = integracoesRows.map((r) => {
        const venc = parseDia(r.dataVencimento);
        return {
          tipo: r.tipo,
          cliente: r.clienteNome || "—",
          dataRealizacao: parseDia(r.dataRealizacao),
          dataVencimento: venc,
          // sem vencimento (ou data ilegível) = vigente, mesma regra do módulo
          vigente: !venc || venc >= hoje,
        };
      });

      // Rev. 4638 — tempo de empresa calculado no SERVIDOR (minimização LGPD:
      // a data de admissão exata não sai na rota pública, só o texto derivado)
      let tempoEmpresa: string | undefined;
      {
        const adm = parseDia((emp as any).dataAdmissao);
        if (adm) {
          const [ay, am, ad] = adm.split("-").map(Number);
          const hj = new Date();
          let meses = (hj.getFullYear() - ay) * 12 + (hj.getMonth() + 1 - am);
          if (hj.getDate() < ad) meses--;
          if (meses >= 0) {
            const anos = Math.floor(meses / 12), resto = meses % 12;
            tempoEmpresa = anos === 0 && resto === 0 ? "Menos de 1 mês"
              : [anos > 0 ? `${anos} ano${anos > 1 ? "s" : ""}` : "", resto > 0 ? `${resto} ${resto > 1 ? "meses" : "mês"}` : ""].filter(Boolean).join(" e ");
          }
        }
      }

      // Treinamentos (lista pública LGPD-safe: nome, norma, datas, vigência)
      const treinamentosResult = await db.select({
        nome: trainings.nome, norma: trainings.norma, cargaHoraria: trainings.cargaHoraria,
        dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade,
      }).from(trainings)
        .where(and(eq(trainings.employeeId, emp.id), eq(trainings.companyId, emp.companyId), isNull(trainings.deletedAt)))
        .orderBy(desc(trainings.dataRealizacao));
      const treinamentos = treinamentosResult.map((t) => ({
        ...t,
        vigente: !!(t.dataValidade && t.dataValidade >= hoje),
      }));
      const treinamentosVigentes = treinamentos.filter((t) => t.vigente);
      const treinamentosOk = treinamentosVigentes.length > 0;
      const nrsVigentes = treinamentosVigentes.filter((t) => (t.norma || "").toUpperCase().startsWith("NR"));
      const nrOk = nrsVigentes.length > 0 || treinamentosOk;

      // Documentos pessoais: só o booleano (nenhum dado exposto — LGPD)
      const docsOk = !!(emp.cpf && emp.nomeCompleto && emp.dataNascimento);

      const pendencias: string[] = [];
      if (!asoVigente) pendencias.push("ASO vencido ou inexistente");
      if (!treinamentosOk) pendencias.push("Nenhum treinamento vigente");
      if (!docsOk) pendencias.push("Dados pessoais incompletos");
      // Mesma semântica do recálculo oficial (recalcAll): apto | inapto
      const aptidaoCalc = pendencias.length === 0 ? "apto" : "inapto";

      return {
        found: true,
        nome: emp.nomeCompleto,
        // Rev. 4635 — sem CPF na rota pública (pedido do usuário); identificação
        // pelo número interno (mesma fonte do crachá: codigoInterno || matricula)
        numeroInterno: (emp as any).codigoInterno || (emp as any).matricula || undefined,
        // Rev. 4638 — só o texto derivado (a data exata de admissão não sai)
        tempoEmpresa,
        funcao: emp.funcao || emp.cargo,
        setor: emp.setor,
        foto: emp.fotoUrl,
        tipo: input.tipo.toUpperCase(),
        empresa: company?.nomeFantasia || company?.razaoSocial || "N/A",
        // Rev. 4634 — logo da empresa no cartão público (só a URL, nada sensível)
        logoEmpresa: (company as any)?.logoUrl || undefined,
        status: emp.status,
        aptidao: aptidaoCalc,
        motivoInapto: pendencias.length > 0 ? pendencias.join("; ") : undefined,
        asoVigente,
        treinamentosOk,
        documentosOk: docsOk,
        nrOk,
        restricaoAtividade,
        // Rev. 4620 — instruções de segurança (sanitizadas; nunca o motivo médico)
        restricoesOperacionais: restricoesOperacionais.length > 0 ? restricoesOperacionais : undefined,
        ultimaVerificacao: new Date().toISOString(),
        // Documentos pertinentes (LGPD-safe)
        aso: asoAtual ? { tipo: asoAtual.tipo, dataExame: asoAtual.dataExame, dataValidade: asoAtual.dataValidade, vigente: asoVigente } : null,
        treinamentos,
        // Rev. 4637 — integrações de cliente (realização + vencimento + vigência)
        integracoes: integracoes.length > 0 ? integracoes : undefined,
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
        // Rev. 4635 — sem CPF na rota pública; número interno (ex. FEL-00054)
        numeroInterno: (func as any).numeroInterno || undefined,
        // Rev. 4638 — só o texto derivado (a data exata de admissão não sai)
        tempoEmpresa: (() => {
          const m = String((func as any).dataAdmissao || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (!m) return undefined;
          const hj = new Date();
          let meses = (hj.getFullYear() - Number(m[1])) * 12 + (hj.getMonth() + 1 - Number(m[2]));
          if (hj.getDate() < Number(m[3])) meses--;
          if (meses < 0) return undefined;
          const anos = Math.floor(meses / 12), resto = meses % 12;
          return anos === 0 && resto === 0 ? "Menos de 1 mês"
            : [anos > 0 ? `${anos} ano${anos > 1 ? "s" : ""}` : "", resto > 0 ? `${resto} ${resto > 1 ? "meses" : "mês"}` : ""].filter(Boolean).join(" e ");
        })(),
        funcao: func.funcao,
        foto: (func as any).fotoUrl,
        tipo: "TERCEIRO",
        empresa: company?.nomeFantasia || company?.razaoSocial || "N/A",
        // Rev. 4634 — logo da empresa no cartão público (só a URL, nada sensível)
        logoEmpresa: (company as any)?.logoUrl || undefined,
        empresaTerceira: empTerceira?.razaoSocial || "N/A",
        status: func.status,
        aptidao: func.statusAptidao || "pendente",
        motivoInapto: func.motivoInapto,
      };
    }),
  }),
});
