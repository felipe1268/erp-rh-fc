import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db";
import { portalCredentials, funcionariosTerceiros, empresasTerceiras, parceirosConveniados, lancamentosParceiros, employees, employeeAptidao, companies } from "../../drizzle/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { storagePut } from "../storage";

function generateTempPassword(): string {
  return "mudar123";
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
      return { senhaTemporaria: "mudar123", cnpj: cnpjClean, nomeEmpresa: input.nomeEmpresa || "" };
    }),

    listarAcessos: protectedProcedure.input(z.object({
      companyId: z.number(),
      tipo: z.enum(["terceiro", "parceiro"]).optional(),
    })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      let conditions: any[] = [eq(portalCredentials.companyId, input.companyId)];
      if (input.tipo) conditions.push(eq(portalCredentials.tipo, input.tipo));
      const creds = await db.select().from(portalCredentials).where(and(...conditions));
      return creds.map((c: any) => ({ ...c, senhaHash: undefined }));
    }),

    desativarAcesso: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(portalCredentials).set({ ativo: 0 }).where(eq(portalCredentials.id, input.id));
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
    listarPendentes: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const funcs = await db.select().from(funcionariosTerceiros).where(
        eq(funcionariosTerceiros.companyId, input.companyId)
      );
      // Get empresa names
      const empresaIds = Array.from(new Set(funcs.map((f: any) => f.empresaTerceiraId)));
      const empresas = empresaIds.length > 0 ? await db.select().from(empresasTerceiras).where(
        eq(empresasTerceiras.companyId, input.companyId)
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
      return { id: result.insertId, success: true };
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
