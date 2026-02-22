import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { fechamentoPontoRouter } from "./routers/fechamentoPonto";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createCompany, updateCompany, getCompanies, getCompanyById, deleteCompany, restoreCompany,
  createEmployee, updateEmployee, getEmployees, getEmployeeById, deleteEmployee, softDeleteEmployee, restoreEmployee, getDeletedEmployees, permanentDeleteEmployee, getEmployeeStats,
  createEmployeeHistory, getEmployeeHistory,
  createUserProfile, getUserProfiles, getUserProfilesByCompany, updateUserProfile, deleteUserProfile,
  setPermissions, getPermissions,
  createAuditLog, getAuditLogs,
  getAllUsers,
  // Ponto/Folha
  createTimeRecord, getTimeRecords, bulkCreateTimeRecords, createPayroll, getPayrolls, updatePayroll, deletePayroll,
  // Documentos e Uploads
  createPayrollUpload, getPayrollUploads, updatePayrollUploadStatus, deletePayrollUpload,
  createDixiDevice, getDixiDevices, updateDixiDevice, deleteDixiDevice, restoreDixiDevice,
  checkDuplicateCpf, checkBlacklist, getBlacklistedEmployees,
  // Obras
  createObra, getObras, getObraById, updateObra, deleteObra, restoreObra, getObrasByCompanyActive,
  getObraFuncionarios, allocateEmployeeToObra, removeEmployeeFromObra, getObraHorasRateio,
  getObraSns, getObraSnsByCompany, getActiveSnsByCompany, checkSnAvailability, addSnToObra, updateSnObra, removeSnFromObra, releaseObraSns, findObraBySn,
  // Setores e Funções
  listSectors, createSector, updateSector, deleteSector, restoreSector,
  listJobFunctions, createJobFunction, updateJobFunction, deleteJobFunction, restoreJobFunction,
} from "./db";
import { DEFAULT_PERMISSIONS, MODULE_KEYS } from "../shared/modules";
import { getDb } from "./db";
import { obraSns, employees, blacklistReactivationRequests } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import type { ProfileType } from "../shared/modules";
import { dashboardsRouter } from "./routers/dashboards";
import { validateCNPJ } from "../shared/cnpj";
import { TRPCError } from "@trpc/server";
import { importExcelRouter } from "./routers/importExcel";
import { payrollParsersRouter } from "./routers/payrollParsers";
import { folhaPagamentoRouter } from "./routers/folhaPagamento";
import { controleDocumentosRouter } from "./routers/controleDocumentos";
import { processosTrabRouter } from "./routers/processosTrabalhistas";
import { homeDataRouter } from "./routers/homeData";
import { episRouter } from "./routers/epis";
import { menuConfigRouter } from "./routers/menuConfig";
import { goldenRulesRouter } from "./routers/goldenRules";
import { notificationsRouter } from "./routers/notifications";
import { storagePut } from "./storage";
import { dispararNotificacao, mapStatusToTipoMovimentacao, getMotivoAfastamento } from "./services/emailNotification";

// Helper: generic CRUD builder
function crudRouter(opts: {
  listFn: (companyId: number, ...args: any[]) => Promise<any[]>;
  createFn: (data: any) => Promise<{ id: number }>;
  deleteFn: (id: number) => Promise<void>;
  updateFn?: (id: number, data: any) => Promise<void>;
  extraListInput?: z.ZodTypeAny;
}) {
  return router({
    list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => opts.listFn(input.companyId)),
    create: protectedProcedure.input(z.any()).mutation(({ input }) => opts.createFn(input)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { opts.deleteFn(input.id); return { success: true }; }),
    ...(opts.updateFn ? { update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { opts.updateFn!(input.id, input); return { success: true }; }) } : {}),
  });
}

export const appRouter = router({
  system: systemRouter,
  docs: controleDocumentosRouter,
  home: homeDataRouter,
  epis: episRouter,
  menuConfig: menuConfigRouter,
  goldenRules: goldenRulesRouter,
  notifications: notificationsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============================================================
  // COMPANIES (MULTI-TENANT)
  // ============================================================
  companies: router({
    list: protectedProcedure.query(async () => getCompanies()),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => getCompanyById(input.id)),
    create: protectedProcedure.input(z.object({
      cnpj: z.string().min(14), razaoSocial: z.string().min(1),
      nomeFantasia: z.string().optional(), endereco: z.string().optional(),
      cidade: z.string().optional(), estado: z.string().optional(),
      cep: z.string().optional(), telefone: z.string().optional(), email: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!validateCNPJ(input.cnpj)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido. Verifique os dígitos e tente novamente." });
      }
      const result = await createCompany(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "empresas", entityType: "company", entityId: result.id, details: `Empresa criada: ${input.razaoSocial}` });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), cnpj: z.string().optional(), razaoSocial: z.string().optional(),
      nomeFantasia: z.string().optional(), endereco: z.string().optional(),
      cidade: z.string().optional(), estado: z.string().optional(),
      cep: z.string().optional(), telefone: z.string().optional(), email: z.string().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateCompany(id, { ...data, isActive: data.isActive !== undefined ? (data.isActive ? 1 : 0) : undefined } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "empresas", entityType: "company", entityId: id, details: `Empresa atualizada` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteCompany(input.id, ctx.user.id, ctx.user.name ?? "Sistema");
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "empresas", entityType: "company", entityId: input.id, details: `Empresa excluída (lixeira)` });
      return { success: true };
    }),
    uploadLogo: protectedProcedure.input(z.object({
      companyId: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const suffix = Math.random().toString(36).slice(2, 10);
      const ext = input.fileName.split(".").pop() || "png";
      const key = `company-logos/${input.companyId}-${suffix}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await updateCompany(input.companyId, { logoUrl: url } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "empresas", entityType: "company", entityId: input.companyId, details: `Logo da empresa atualizado` });
      return { url };
    }),
  }),

  // ============================================================
  // SETORES
  // ============================================================
  sectors: router({
    list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => listSectors(input.companyId)),
    create: protectedProcedure.input(z.object({
      companyId: z.number(), nome: z.string().min(1), descricao: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const result = await createSector(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "cadastro", entityType: "sector", entityId: result.id, details: `Setor criado: ${input.nome}` });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(), nome: z.string().optional(), descricao: z.string().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, companyId, ...data } = input;
      await updateSector(id, companyId, data);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "cadastro", entityType: "sector", entityId: id, details: `Setor atualizado` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteSector(input.id, input.companyId, ctx.user.id, ctx.user.name ?? "Sistema");
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "cadastro", entityType: "sector", entityId: input.id, details: `Setor excluído (lixeira)` });
      return { success: true };
    }),
  }),

  // ============================================================
  // FUNÇÕES (JOB FUNCTIONS)
  // ============================================================
  jobFunctions: router({
    list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => listJobFunctions(input.companyId)),
    create: protectedProcedure.input(z.object({
      companyId: z.number(), nome: z.string().min(1), descricao: z.string().optional(), ordemServico: z.string().optional(), cbo: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const result = await createJobFunction(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "cadastro", entityType: "jobFunction", entityId: result.id, details: `Função criada: ${input.nome}` });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ordemServico: z.string().optional(), cbo: z.string().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, companyId, ...data } = input;
      await updateJobFunction(id, companyId, data);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "cadastro", entityType: "jobFunction", entityId: id, details: `Função atualizada` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteJobFunction(input.id, input.companyId, ctx.user.id, ctx.user.name ?? "Sistema");
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "cadastro", entityType: "jobFunction", entityId: input.id, details: `Função excluída (lixeira)` });
      return { success: true };
    }),
  }),

  // ============================================================
  // EMPLOYEES
  // ============================================================
  employees: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), search: z.string().optional(), status: z.string().optional() })).query(({ input }) => getEmployees(input.companyId, input.search, input.status)),
    getById: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).query(({ input }) => getEmployeeById(input.id, input.companyId)),
    stats: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getEmployeeStats(input.companyId)),
    create: protectedProcedure.input(z.any()).mutation(async ({ input, ctx }) => {
      // === REGRA-MÃE DE UNICIDADE ===
      // Valida CPF em TODAS as empresas do grupo (não apenas na empresa atual)
      if (input.cpf && !input.cpf.startsWith('000.000')) {
        const dup = await checkDuplicateCpf(input.cpf);
        if (dup && (dup as any[]).length > 0) {
          const dupInfo = (dup as any[])[0];
          throw new TRPCError({ code: "CONFLICT", message: `⚠️ CPF já cadastrado!\n\nO CPF ${input.cpf} pertence a: ${dupInfo.nomeCompleto}\nEmpresa: ${dupInfo.empresa || 'N/A'}\nStatus: ${dupInfo.status || 'N/A'}\n\nNão é possível cadastrar o mesmo CPF novamente em nenhuma empresa do grupo.` });
        }
        // Verificar se está na Blacklist
        const blacklisted = await checkBlacklist(input.cpf);
        if (blacklisted) {
          throw new TRPCError({ code: "FORBIDDEN", message: `🚫 FUNCIONÁRIO NA BLACKLIST!\n\n${blacklisted.nomeCompleto} (CPF: ${input.cpf}) está na Blacklist da empresa.\nMotivo: ${blacklisted.motivoListaNegra || 'Não informado'}\nData: ${blacklisted.dataListaNegra || 'N/A'}\nRegistrado por: ${(blacklisted as any).listaNegraPor || 'N/A'}\n\nPara reativar este funcionário, é necessária a aprovação de 2 diretores da empresa.` });
        }
      }
      // Verificar RG duplicado (se informado)
      if (input.rg && input.rg.trim()) {
        const db = await getDb();
        if (db) {
          const rgDup = await db.select().from(employees).where(and(eq(employees.rg, input.rg), sql`${employees.rg} IS NOT NULL AND ${employees.rg} != ''`));
          if (rgDup.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: `⚠️ RG já cadastrado!\n\nO RG ${input.rg} pertence a: ${rgDup[0].nomeCompleto}\nStatus: ${rgDup[0].status || 'N/A'}\n\nVerifique se não é o mesmo funcionário.` });
          }
        }
      }
      const result = await createEmployee(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "colaboradores", entityType: "employee", entityId: result.id, details: `Colaborador criado: ${input.nomeCompleto}` });
      // Disparo automático de notificação de contratação
      if (input.status === "Ativo" && input.companyId) {
        try {
          const company = await getCompanyById(input.companyId);
          await dispararNotificacao(input.companyId, "contratacao", {
            nome: input.nomeCompleto || "",
            cpf: input.cpf || "",
            funcao: input.funcao || "",
            setor: input.setor || "",
            empresa: company?.razaoSocial || company?.nomeFantasia || "",
            dataAdmissao: input.dataAdmissao || "",
            employeeId: result.id,
            statusAnterior: null as any,
            statusNovo: "Ativo",
          }, ctx.user.id, ctx.user.name ?? "Sistema");
        } catch (e) { console.error("[Notificação] Erro ao disparar contratação:", e); }
      }
      return result;
    }),
    update: protectedProcedure.input(z.any()).mutation(async ({ input, ctx }: any) => {
      // Frontend envia { id, companyId, data } - extrair dados corretamente
      const employeeData = input.data || input;
      // Proteger código interno JFC: somente ADM Master pode alterar
      if (employeeData.codigoInterno !== undefined && ctx.user.role !== 'admin') {
        delete employeeData.codigoInterno;
      }
      // Buscar dados ANTES da atualização para detectar mudança de status
      let empAnterior: any = null;
      try {
        empAnterior = await getEmployeeById(input.id, input.companyId);
      } catch (e) { /* ignore */ }
      
      const statusAnteriorCheck = empAnterior?.status || null;
      const statusNovoCheck = employeeData.status || null;
      
      // === DESLIGAMENTO: CAMPOS OBRIGATÓRIOS ===
      if (statusNovoCheck === 'Desligado' && statusAnteriorCheck !== 'Desligado') {
        if (!employeeData.categoriaDesligamento || !employeeData.categoriaDesligamento.trim()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '⚠️ Campo obrigatório!\n\nA CATEGORIA do desligamento é obrigatória.\nSelecione uma das opções: Término de contrato, Justa causa, Pedido de demissão, Acordo mútuo, Fim de obra, Baixo desempenho, Indisciplina ou Outros.' });
        }
        // Motivo detalhado só é obrigatório quando incluir na Blacklist
        if (employeeData.listaNegra && (!employeeData.motivoDesligamento || !employeeData.motivoDesligamento.trim())) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '⚠️ Campo obrigatório!\n\nO MOTIVO DETALHADO do desligamento é obrigatório quando o funcionário é incluído na Blacklist.\nDescreva o motivo pelo qual o funcionário não poderá ser recontratado.' });
        }
        // Registrar dados de auditoria do desligamento
        employeeData.desligadoPor = ctx.user.name ?? 'Sistema';
        employeeData.desligadoUserId = ctx.user.id;
        employeeData.dataDesligamentoEfetiva = employeeData.dataDesligamentoEfetiva || new Date().toISOString().split('T')[0];
      }
      
      // === BLACKLIST: CAMPOS OBRIGATÓRIOS ===
      if (employeeData.listaNegra === 1 && empAnterior?.listaNegra !== 1) {
        if (!employeeData.motivoListaNegra || !employeeData.motivoListaNegra.trim()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '⚠️ Campo obrigatório!\n\nO MOTIVO da inclusão na Blacklist é obrigatório.\nDescreva detalhadamente por que este funcionário não poderá ser recontratado.' });
        }
        employeeData.listaNegraPor = ctx.user.name ?? 'Sistema';
        employeeData.listaNegraUserId = ctx.user.id;
        employeeData.dataListaNegra = new Date().toISOString().split('T')[0];
      }
      
      // === REATIVAÇÃO DE BLACKLIST: REQUER APROVAÇÃO DUPLA ===
      if (empAnterior?.listaNegra === 1 && employeeData.listaNegra === 0) {
        // Verificar se há aprovação dupla
        const db = await getDb();
        if (db) {
          const approvedReqs = await db.select().from(blacklistReactivationRequests).where(
            and(
              eq(blacklistReactivationRequests.employeeId, input.id),
              eq(blacklistReactivationRequests.status, 'aprovado')
            )
          );
          if (approvedReqs.length === 0) {
            throw new TRPCError({ code: 'FORBIDDEN', message: '🚫 REATIVAÇÃO BLOQUEADA!\n\nEste funcionário está na Blacklist.\nPara removê-lo da Blacklist, é necessária a aprovação de 2 diretores da empresa.\n\nSolicite a reativação pelo menu "Blacklist" e aguarde as aprovações.' });
          }
        }
      }
      
      await updateEmployee(input.id, input.companyId, employeeData);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador atualizado: ${employeeData.nomeCompleto || input.nomeCompleto || ""}` });
      
      // Disparo automático de notificação por mudança de status
      const statusAnterior = empAnterior?.status || null;
      const statusNovo = employeeData.status || null;
      if (statusNovo && statusAnterior !== statusNovo) {
        const tipoMov = mapStatusToTipoMovimentacao(statusAnterior, statusNovo);
        if (tipoMov && input.companyId) {
          try {
            const company = await getCompanyById(input.companyId);
            const nome = employeeData.nomeCompleto || empAnterior?.nomeCompleto || "";
            await dispararNotificacao(input.companyId, tipoMov, {
              nome,
              cpf: employeeData.cpf || empAnterior?.cpf || "",
              funcao: employeeData.funcao || empAnterior?.funcao || "",
              setor: employeeData.setor || empAnterior?.setor || "",
              empresa: company?.razaoSocial || company?.nomeFantasia || "",
              dataDesligamento: statusNovo === "Desligado" ? (employeeData.dataDesligamento || new Date().toISOString().split("T")[0]) : undefined,
              motivoAfastamento: ["Afastado", "Licenca", "Recluso"].includes(statusNovo) ? getMotivoAfastamento(statusNovo) : undefined,
              employeeId: input.id,
              statusAnterior: statusAnterior || undefined,
              statusNovo,
            }, ctx.user.id, ctx.user.name ?? "Sistema");
          } catch (e) { console.error("[Notificação] Erro ao disparar mudança de status:", e); }
        }
      }
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number(), reason: z.string().optional() })).mutation(async ({ input, ctx }) => {
      // Buscar nome do colaborador antes de excluir
      const emp = await getEmployeeById(input.id, input.companyId);
      const empNome = emp?.nomeCompleto || `#${input.id}`;
      await softDeleteEmployee(input.id, input.companyId, ctx.user.id, ctx.user.name ?? "Sistema", input.reason);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador excluído (lixeira): ${empNome}${input.reason ? ` — Motivo: ${input.reason}` : ""}` });
      return { success: true };
    }),
    // Lixeira - listar excluídos
    listDeleted: protectedProcedure.input(z.object({ companyId: z.number().optional() })).query(({ input }) => getDeletedEmployees(input.companyId)),
    // Restaurar colaborador
    restore: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id, input.companyId);
      const empNome = emp?.nomeCompleto || `#${input.id}`;
      await restoreEmployee(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "RESTORE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador restaurado da lixeira: ${empNome}` });
      return { success: true };
    }),
    // Exclusão permanente
    permanentDelete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id, input.companyId);
      const empNome = emp?.nomeCompleto || `#${input.id}`;
      await permanentDeleteEmployee(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "PERMANENT_DELETE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador excluído permanentemente: ${empNome}` });
      return { success: true };
    }),
    history: router({
      list: protectedProcedure.input(z.object({ employeeId: z.number(), companyId: z.number() })).query(({ input }) => getEmployeeHistory(input.employeeId, input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createEmployeeHistory(input)),
    }),
    checkDuplicateCpf: protectedProcedure.input(z.object({ cpf: z.string(), companyId: z.number() })).query(({ input }) => checkDuplicateCpf(input.cpf, input.companyId)),
    uploadFoto: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `employee-photos/${input.companyId}/${input.employeeId}-${suffix}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await updateEmployee(input.employeeId, input.companyId, { fotoUrl: url } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: input.employeeId, details: `Foto 3x4 atualizada` });
      return { url };
    }),
    removeFoto: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      await updateEmployee(input.employeeId, input.companyId, { fotoUrl: null } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: input.employeeId, details: `Foto 3x4 removida` });
      return { success: true };
    }),
  }),

  // ============================================================
  // PERFIS DE ACESSO
  // ============================================================
  profiles: router({
    list: protectedProcedure.query(({ ctx }) => getUserProfiles(ctx.user.id)),
    listByCompany: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getUserProfilesByCompany(input.companyId)),
    create: protectedProcedure.input(z.object({
      userId: z.number(), companyId: z.number(), profileType: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const result = await createUserProfile({ ...input, profileType: input.profileType as ProfileType });
      const defaultPerms = DEFAULT_PERMISSIONS[input.profileType as ProfileType] || {};
      const permEntries = Object.entries(defaultPerms).map(([module, p]: [string, any]) => ({
        profileId: result.id, module, canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete,
      }));
      await setPermissions(result.id, permEntries);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "usuarios", entityType: "profile", entityId: result.id, details: `Perfil ${input.profileType} criado` });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), profileType: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await updateUserProfile(input.id, { profileType: input.profileType as ProfileType });
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "profile", entityId: input.id, details: `Perfil atualizado` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteUserProfile(input.id);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "usuarios", entityType: "profile", entityId: input.id, details: `Perfil excluído` });
      return { success: true };
    }),
    permissions: router({
      get: protectedProcedure.input(z.object({ profileId: z.number() })).query(({ input }) => getPermissions(input.profileId)),
      set: protectedProcedure.input(z.object({ profileId: z.number(), permissions: z.any() })).mutation(async ({ input, ctx }) => {
        const permEntries = Object.entries(input.permissions).map(([module, val]: [string, any]) => {
          if (typeof val === 'boolean') return { profileId: input.profileId, module, canView: val, canCreate: val, canEdit: val, canDelete: val };
          return { profileId: input.profileId, module, canView: val?.canView ?? false, canCreate: val?.canCreate ?? false, canEdit: val?.canEdit ?? false, canDelete: val?.canDelete ?? false };
        });
        await setPermissions(input.profileId, permEntries);
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "permissions", entityId: input.profileId, details: `Permissões atualizadas` });
        return { success: true };
      }),
    }),
    moduleKeys: publicProcedure.query(() => MODULE_KEYS),
  }),

  // ============================================================
  // AUDITORIA DO SISTEMA
  // ============================================================
  audit: router({
    list: protectedProcedure.input(z.object({ companyId: z.number().optional(), limit: z.number().optional() })).query(({ input }) => getAuditLogs(input.companyId, input.limit ?? 100)),
  }),

  // ============================================================
  // PONTO E FOLHA
  // ============================================================
  timesheet: router({
    records: router({
      list: protectedProcedure.input(z.object({ companyId: z.number(), employeeId: z.number(), month: z.string().optional() })).query(({ input }) => getTimeRecords(input.companyId, input.employeeId, input.month)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createTimeRecord(input)),
      bulkCreate: protectedProcedure.input(z.object({ records: z.array(z.any()) })).mutation(({ input }) => { bulkCreateTimeRecords(input.records); return { success: true }; }),
    }),
    payroll: router({
      list: protectedProcedure.input(z.object({ companyId: z.number(), month: z.string().optional(), employeeId: z.number().optional() })).query(({ input }) => getPayrolls(input.companyId, input.month, input.employeeId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createPayroll(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updatePayroll(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deletePayroll(input.id); return { success: true }; }),
    }),
  }),

  // ============================================================
  // UPLOADS DE FOLHA (Cartão de Ponto, Folha, Vale)
  // ============================================================
  payrollUploads: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), month: z.string().optional(), category: z.string().optional() })).query(({ input }) => getPayrollUploads(input.companyId, input.month, input.category)),
    create: protectedProcedure.input(z.any()).mutation(({ input }) => createPayrollUpload(input)),
    updateStatus: protectedProcedure.input(z.object({ id: z.number(), status: z.string(), recordsProcessed: z.number().optional(), errorMessage: z.string().optional() })).mutation(({ input }) => { updatePayrollUploadStatus(input.id, input.status, input.recordsProcessed, input.errorMessage); return { success: true }; }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deletePayrollUpload(input.id); return { success: true }; }),
  }),

  // ============================================================
  // DISPOSITIVOS DIXI (Vinculação Sn -> Obra)
  // ============================================================
  dixiDevices: router({
    list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDixiDevices(input.companyId)),
    create: protectedProcedure.input(z.any()).mutation(({ input }) => createDixiDevice(input)),
    update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateDixiDevice(input.id, input); return { success: true }; }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteDixiDevice(input.id, ctx.user.id, ctx.user.name ?? "Sistema");
      return { success: true };
    }),
  }),

  // ============================================================
  // IMPORTAÇÃO EXCEL
  // ============================================================
  import: importExcelRouter,

  // ============================================================
  // EXCLUSÃO EM LOTE (BATCH DELETE)
  // ============================================================
  batch: router({
    delete: protectedProcedure.input(z.object({
      table: z.enum([
        "employees", "payroll", "time_records", "payroll_uploads",
        "employee_history", "extra_payments", "advance_payments", "vr_benefits",
        "obras", "obra_funcionarios",
      ]),
      ids: z.array(z.number()).min(1),
    })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { sql } = await import("drizzle-orm");
      const idList = input.ids.join(",");
      // Soft delete: marca deletedAt em vez de remover permanentemente
      await db.execute(sql.raw(`UPDATE \`${input.table}\` SET deletedAt = NOW(), deletedBy = '${(ctx.user.name ?? 'Sistema').replace(/'/g, "''")}', deletedByUserId = ${ctx.user.id} WHERE id IN (${idList})`));
      return { success: true, deleted: input.ids.length };
    }),
  }),

  // ============================================================
  // DASHBOARDS INTERATIVOS
  // ============================================================
  dashboards: dashboardsRouter,

  // ============================================================
  // FOLHA DE PAGAMENTO (parsers, vales, extras, VR)
  // ============================================================
  payrollParsers: payrollParsersRouter,

  // ============================================================
  // FOLHA DE PAGAMENTO (novo módulo redesenhado)
  // ============================================================
  folha: folhaPagamentoRouter,

  // ============================================================
  // FECHAMENTO DE PONTO (upload DIXI, cálculo horas, inconsistências)
  // ============================================================
  fechamentoPonto: fechamentoPontoRouter,

  // ============================================================
  // PROCESSOS TRABALHISTAS
  // ============================================================
  processos: processosTrabRouter,

  // ============================================================
  // OBRAS
  // ============================================================
  obras: router({
    list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getObras(input.companyId)),
    listActive: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getObrasByCompanyActive(input.companyId)),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => getObraById(input.id)),
    create: protectedProcedure.input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      codigo: z.string().optional(),
      numOrcamento: z.string().optional(),
      snRelogioPonto: z.string().optional(),
      cliente: z.string().optional(),
      responsavel: z.string().optional(),
      endereco: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      dataInicio: z.string().optional(),
      dataPrevisaoFim: z.string().optional(),
      dataFimReal: z.string().optional(),
      status: z.enum(["Planejamento", "Em_Andamento", "Paralisada", "Concluida", "Cancelada"]).optional(),
      valorContrato: z.string().optional(),
      observacoes: z.string().optional(),
    })).mutation(({ input }) => createObra(input as any)),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      codigo: z.string().optional(),
      numOrcamento: z.string().optional(),
      snRelogioPonto: z.string().optional(),
      cliente: z.string().optional(),
      responsavel: z.string().optional(),
      endereco: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      dataInicio: z.string().optional(),
      dataPrevisaoFim: z.string().optional(),
      dataFimReal: z.string().optional(),
      status: z.enum(["Planejamento", "Em_Andamento", "Paralisada", "Concluida", "Cancelada"]).optional(),
      valorContrato: z.string().optional(),
      observacoes: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      // Se status mudou para Concluída/Paralisada/Cancelada, liberar SNs
      if (data.status && ["Concluida", "Paralisada", "Cancelada"].includes(data.status)) {
        await releaseObraSns(id);
      }
      return updateObra(id, data as any);
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteObra(input.id, ctx.user.id, ctx.user.name ?? "Sistema");
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "obras", entityType: "obra", entityId: input.id, details: `Obra excluída (lixeira)` });
      return { success: true };
    }),
    // Funcionários alocados
    funcionarios: protectedProcedure.input(z.object({ obraId: z.number() })).query(({ input }) => getObraFuncionarios(input.obraId)),
    allocateEmployee: protectedProcedure.input(z.object({
      obraId: z.number(),
      employeeId: z.number(),
      companyId: z.number(),
      funcaoNaObra: z.string().optional(),
      dataInicio: z.string().optional(),
    })).mutation(({ input }) => allocateEmployeeToObra(input)),
    removeEmployee: protectedProcedure.input(z.object({ employeeId: z.number() })).mutation(({ input }) => removeEmployeeFromObra(input.employeeId)),
    // Rateio de horas
    horasRateio: protectedProcedure.input(z.object({
      companyId: z.number(),
      mesAno: z.string(),
      obraId: z.number().optional(),
    })).query(({ input }) => getObraHorasRateio(input.companyId, input.mesAno, input.obraId)),
    // ============================================================
    // SNs (Relógios de Ponto) por Obra
    // ============================================================
    listSns: protectedProcedure.input(z.object({ obraId: z.number() })).query(({ input }) => getObraSns(input.obraId)),
    listSnsByCompany: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getObraSnsByCompany(input.companyId)),
    listActiveSns: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getActiveSnsByCompany(input.companyId)),
    checkSnAvailability: protectedProcedure.input(z.object({
      companyId: z.number(),
      sn: z.string().min(1),
      excludeObraId: z.number().optional(),
    })).query(({ input }) => checkSnAvailability(input.companyId, input.sn, input.excludeObraId)),
    addSn: protectedProcedure.input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      sn: z.string().min(1),
      apelido: z.string().optional(),
    })).mutation(async ({ input }) => {
      // Validar unicidade antes de adicionar
      const check = await checkSnAvailability(input.companyId, input.sn, input.obraId);
      if (!check.available) {
        throw new Error(`SN "${input.sn}" já está em uso na obra "${check.usedByObra}". Libere-o primeiro.`);
      }
      return addSnToObra(input);
    }),
    updateSn: protectedProcedure.input(z.object({ id: z.number(), sn: z.string().optional(), obraId: z.number().optional(), status: z.string().optional(), apelido: z.string().optional(), companyId: z.number().optional() })).mutation(async ({ input }) => {
      // Validar SN duplicado ao editar
      if (input.sn && input.companyId) {
        const check = await checkSnAvailability(input.companyId, input.sn);
        if (!check.available) {
          // Verificar se o conflito é com o próprio registro
          const db = await getDb();
          if (db) {
            const [current] = await db.select({ id: obraSns.id, sn: obraSns.sn }).from(obraSns).where(eq(obraSns.id, input.id));
            if (!current || current.sn !== input.sn) {
              throw new Error(`SN "${input.sn}" já está em uso na obra "${check.usedByObra}". Não é permitido duplicar SN.`);
            }
          }
        }
      }
      return updateSnObra(input.id, { sn: input.sn, obraId: input.obraId, status: input.status, apelido: input.apelido });
    }),
    removeSn: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => removeSnFromObra(input.id)),
    releaseSns: protectedProcedure.input(z.object({ obraId: z.number() })).mutation(({ input }) => releaseObraSns(input.obraId)),
  }),

  // ============================================================
  // LOGIN COM SENHA & GERENCIAMENTO DE USUÁRIOS
  // ============================================================
  userManagement: router({
    listUsers: protectedProcedure.query(async () => {
      const allUsers = await getAllUsers();
      return allUsers.map((u: any) => ({ ...u, password: undefined }));
    }),
    createLocalUser: protectedProcedure.input(z.object({
      username: z.string().min(3),
      name: z.string().min(1),
      email: z.string().email().optional(),
      role: z.enum(["user", "admin", "admin_master"]).default("user"),
      password: z.string().optional(),
    })).mutation(async ({ input }) => {
      const bcrypt = await import("bcryptjs");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select().from(users).where(eq(users.username, input.username));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Username já existe" });
      const defaultPwd = input.password || "fc2026";
      const hashed = bcrypt.hashSync(defaultPwd, 10);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await db.insert(users).values({
        openId, name: input.name, email: input.email || null,
        username: input.username, password: hashed,
        mustChangePassword: 1, loginMethod: "local", role: input.role,
      });
      return { id: Number(result[0].insertId), username: input.username, defaultPassword: defaultPwd };
    }),
    loginLocal: publicProcedure.input(z.object({
      username: z.string(), password: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const bcrypt = await import("bcryptjs");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(eq(users.username, input.username));
      if (!user || !user.password) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      const valid = bcrypt.compareSync(input.password, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: user.id, openId: user.openId }, process.env.JWT_SECRET || "secret", { expiresIn: "7d" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
      await db.update(users).set({ lastSignedIn: new Date().toISOString() }).where(eq(users.id, user.id));
      return { success: true, mustChangePassword: !!user.mustChangePassword, user: { id: user.id, name: user.name, role: user.role } };
    }),
    changePassword: protectedProcedure.input(z.object({
      currentPassword: z.string(), newPassword: z.string().min(4),
    })).mutation(async ({ input, ctx }) => {
      const bcrypt = await import("bcryptjs");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.password) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não possui login local" });
      const valid = bcrypt.compareSync(input.currentPassword, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta" });
      const hashed = bcrypt.hashSync(input.newPassword, 10);
      await db.update(users).set({ password: hashed, mustChangePassword: 0 } as any).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    resetPassword: protectedProcedure.input(z.object({
      userId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode resetar senhas" });
      const bcrypt = await import("bcryptjs");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const defaultPwd = "fc2026";
      const hashed = bcrypt.hashSync(defaultPwd, 10);
      await db.update(users).set({ password: hashed, mustChangePassword: 1 } as any).where(eq(users.id, input.userId));
      return { success: true, defaultPassword: defaultPwd };
    }),
    updateRole: protectedProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin", "admin_master"]),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode alterar perfis" });
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar seu próprio perfil" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ role: input.role } as any).where(eq(users.id, input.userId));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "user", entityId: input.userId, details: `Perfil alterado para ${input.role}` });
      return { success: true };
    }),
    updateUser: protectedProcedure.input(z.object({
      userId: z.number(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      username: z.string().min(3).optional(),
      newPassword: z.string().min(6).optional(),
      role: z.enum(["admin", "user", "admin_master"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode editar usuários" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const updateData: any = {};
      if (input.name) updateData.name = input.name;
      if (input.email) updateData.email = input.email;
      if (input.username) updateData.username = input.username;
      if (input.role) {
        if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode alterar perfil" });
        updateData.role = input.role;
      }
      if (input.newPassword) {
        if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode alterar senhas" });
        const bcrypt = await import("bcryptjs");
        updateData.password = await bcrypt.hash(input.newPassword, 10);
      }
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, input.userId));
      }
      const logDetails = { ...updateData };
      if (logDetails.password) logDetails.password = "[REDACTED]";
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "user", entityId: input.userId, details: `Usuário editado: ${JSON.stringify(logDetails)}` });
      return { success: true };
    }),
    deleteUser: protectedProcedure.input(z.object({
      userId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode excluir usuários" });
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir a si mesmo" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(eq(users.id, input.userId));
      const { sql } = await import("drizzle-orm");
      await db.update(users).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(users.id, input.userId));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "usuarios", entityType: "user", entityId: input.userId, details: `Usuário ${user?.name || 'desconhecido'} excluído (lixeira)` });
      return { success: true };
    }),
  }),

  // ============================================================
  // CONFIGURAÇÕES: LIMPEZA GERAL DO BANCO
  // ============================================================
  settings: router({
    cleanDatabase: protectedProcedure.input(z.object({
      confirmPassword: z.string(),
      modules: z.array(z.string()).min(1),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode limpar o banco" });
      const CLEAN_PASSWORD = "LIMPAR2026";
      if (input.confirmPassword !== CLEAN_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de confirmação incorreta" });
      }
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { sql } = await import("drizzle-orm");
      // Mapeamento de módulos para tabelas (com tabelas dependentes)
      const moduleTablesMap: Record<string, string[]> = {
        colaboradores: [
          // Tabelas dependentes primeiro (ordem de exclusão segura)
          "insurance_alerts_log", "notification_logs", "blacklist_reactivation_requests",
          "asos", "trainings", "training_documents", "atestados", "warnings",
          "accidents", "epi_deliveries", "time_records", "time_inconsistencies",
          "payroll", "vr_benefits", "advances", "extra_payments",
          "monthly_payroll_summary", "folha_itens",
          "obra_funcionarios", "obra_horas_rateio", "manual_obra_assignments",
          "employee_history", "cipa_members",
          "processos_andamentos", "processos_trabalhistas",
          "employees"
        ],
        obras: ["obra_funcionarios", "obra_horas_rateio", "manual_obra_assignments", "obra_sns", "obras"],
        setores: ["sectors"],
        funcoes: ["job_functions"],
        folha_pagamento: ["folha_itens", "monthly_payroll_summary", "payroll", "folha_lancamentos"],
        registros_ponto: ["time_inconsistencies", "time_records", "ponto_consolidacao"],
        uploads_folha: ["payroll_uploads"],
        documentos: ["asos", "trainings", "training_documents", "atestados", "warnings", "accidents", "epi_deliveries"],
        historico: ["employee_history"],
        pagamentos_extras: ["extra_payments"],
        adiantamentos: ["advances"],
        vr_beneficios: ["vr_benefits"],
        processos: ["processos_andamentos", "processos_trabalhistas"],
      };
      // Desabilitar FK checks para evitar erros de ordem de exclusão
      await db.execute(sql.raw(`SET FOREIGN_KEY_CHECKS = 0`));
      let cleaned = 0;
      try {
        const alreadyCleaned = new Set<string>();
        for (const mod of input.modules) {
          const tables = moduleTablesMap[mod];
          if (tables) {
            for (const tableName of tables) {
              if (!alreadyCleaned.has(tableName)) {
                try {
                  await db.execute(sql.raw(`DELETE FROM \`${tableName}\``));
                  alreadyCleaned.add(tableName);
                } catch (e) {
                  // Tabela pode não existir ainda, ignorar
                  console.warn(`Aviso: não foi possível limpar tabela ${tableName}:`, e);
                }
              }
            }
            cleaned++;
          }
        }
      } finally {
        // Sempre reabilitar FK checks
        await db.execute(sql.raw(`SET FOREIGN_KEY_CHECKS = 1`));
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "configuracoes", entityType: "database", entityId: 0, details: `Limpeza geral: ${input.modules.join(", ")} (${cleaned} tabelas)` });
      return { success: true, tablesCleared: cleaned };
    }),
  }),

  // ============================================================
  // CRITÉRIOS DO SISTEMA
  // ============================================================
  criteria: router({
    getAll: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(systemCriteria)
        .where(eq(systemCriteria.companyId, input.companyId))
        .orderBy(systemCriteria.categoria, systemCriteria.chave);
      return rows;
    }),

    getByCategory: protectedProcedure.input(z.object({
      companyId: z.number(),
      categoria: z.string(),
    })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.categoria, input.categoria)
        ));
      return rows;
    }),

    updateBatch: protectedProcedure.input(z.object({
      companyId: z.number(),
      criterios: z.array(z.object({
        chave: z.string(),
        valor: z.string(),
      })),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode alterar critérios" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      let updated = 0;
      for (const c of input.criterios) {
        const existing = await db.select().from(systemCriteria)
          .where(and(
            eq(systemCriteria.companyId, input.companyId),
            eq(systemCriteria.chave, c.chave)
          )).limit(1);
        if (existing.length > 0) {
          await db.update(systemCriteria)
            .set({ valor: c.valor, atualizadoPor: ctx.user.name ?? "Sistema" })
            .where(eq(systemCriteria.id, existing[0].id));
          updated++;
        }
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "criterios", entityId: input.companyId, details: `Atualizado ${updated} critérios` });
      return { success: true, updated };
    }),

    resetToDefault: protectedProcedure.input(z.object({
      companyId: z.number(),
      categoria: z.string(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode restaurar padrões" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.categoria, input.categoria)
        ));
      let reset = 0;
      for (const row of rows) {
        if (row.valorPadraoClt) {
          await db.update(systemCriteria)
            .set({ valor: row.valorPadraoClt, atualizadoPor: ctx.user.name ?? "Sistema" })
            .where(eq(systemCriteria.id, row.id));
          reset++;
        }
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "criterios", entityId: input.companyId, details: `Restaurado padrão CLT: ${input.categoria} (${reset} critérios)` });
      return { success: true, reset };
    }),

    initDefaults: protectedProcedure.input(z.object({
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select().from(systemCriteria)
        .where(eq(systemCriteria.companyId, input.companyId)).limit(1);
      if (existing.length > 0) return { success: true, message: "Critérios já inicializados", created: 0 };

      const defaults = [
        // HORAS EXTRAS
        { categoria: "horas_extras", chave: "he_dias_uteis", valor: "50", descricao: "Percentual de hora extra em dias úteis", valorPadraoClt: "50", unidade: "%" },
        { categoria: "horas_extras", chave: "he_domingos_feriados", valor: "100", descricao: "Percentual de hora extra em domingos e feriados", valorPadraoClt: "100", unidade: "%" },
        { categoria: "horas_extras", chave: "he_adicional_noturno", valor: "20", descricao: "Percentual de adicional noturno", valorPadraoClt: "20", unidade: "%" },
        { categoria: "horas_extras", chave: "he_noturno_inicio", valor: "22:00", descricao: "Início do horário noturno", valorPadraoClt: "22:00", unidade: "hora" },
        { categoria: "horas_extras", chave: "he_noturno_fim", valor: "05:00", descricao: "Fim do horário noturno", valorPadraoClt: "05:00", unidade: "hora" },
        { categoria: "horas_extras", chave: "he_interjornada", valor: "50", descricao: "Percentual de hora extra interjornada", valorPadraoClt: "50", unidade: "%" },
        { categoria: "horas_extras", chave: "he_limite_mensal", valor: "44", descricao: "Limite máximo de horas extras mensais", valorPadraoClt: "44", unidade: "horas" },
        { categoria: "horas_extras", chave: "he_banco_horas", valor: "0", descricao: "Empresa utiliza banco de horas (0=Não, 1=Sim)", valorPadraoClt: "0", unidade: "bool" },
        // JORNADA
        { categoria: "jornada", chave: "jornada_horas_diarias", valor: "8", descricao: "Horas diárias padrão de trabalho", valorPadraoClt: "8", unidade: "horas" },
        { categoria: "jornada", chave: "jornada_horas_semanais", valor: "44", descricao: "Horas semanais padrão", valorPadraoClt: "44", unidade: "horas" },
        { categoria: "jornada", chave: "jornada_intervalo_almoco", valor: "60", descricao: "Intervalo mínimo para almoço", valorPadraoClt: "60", unidade: "min" },
        { categoria: "jornada", chave: "jornada_descanso_semanal", valor: "1", descricao: "Dias de descanso semanal remunerado", valorPadraoClt: "1", unidade: "dias" },
        { categoria: "jornada", chave: "jornada_sabado_tipo", valor: "compensado", descricao: "Tipo de sábado (compensado, meio_periodo, normal, folga)", valorPadraoClt: "compensado", unidade: "tipo" },
        // PONTO
        { categoria: "ponto", chave: "ponto_tolerancia_atraso", valor: "10", descricao: "Tolerância de atraso na entrada (minutos)", valorPadraoClt: "10", unidade: "min" },
        { categoria: "ponto", chave: "ponto_tolerancia_saida", valor: "10", descricao: "Tolerância de saída antecipada (minutos)", valorPadraoClt: "10", unidade: "min" },
        { categoria: "ponto", chave: "ponto_batida_impar_tolerancia", valor: "30", descricao: "Tolerância para batida ímpar (minutos)", valorPadraoClt: "30", unidade: "min" },
        { categoria: "ponto", chave: "ponto_falta_apos_atraso", valor: "120", descricao: "Considerar falta após X minutos de atraso", valorPadraoClt: "120", unidade: "min" },
        { categoria: "ponto", chave: "ponto_hora_noturna_reduzida", valor: "52:30", descricao: "Duração da hora noturna reduzida (mm:ss)", valorPadraoClt: "52:30", unidade: "mm:ss" },
        // FOLHA
        { categoria: "folha", chave: "folha_dia_vale", valor: "20", descricao: "Dia do mês para pagamento do vale", valorPadraoClt: "20", unidade: "dia" },
        { categoria: "folha", chave: "folha_dia_pagamento", valor: "5", descricao: "Dia útil para pagamento do salário", valorPadraoClt: "5", unidade: "dia_util" },
        { categoria: "folha", chave: "folha_percentual_adiantamento", valor: "40", descricao: "Percentual do salário para adiantamento", valorPadraoClt: "40", unidade: "%" },
        { categoria: "folha", chave: "folha_desconto_vr_faltas", valor: "1", descricao: "Descontar VR nos dias de falta (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "folha", chave: "folha_desconto_vt_faltas", valor: "1", descricao: "Descontar VT nos dias de falta (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        // ADVERTÊNCIAS
        { categoria: "advertencias", chave: "adv_qtd_para_suspensao", valor: "3", descricao: "Advertências para gerar suspensão", valorPadraoClt: "3", unidade: "qtd" },
        { categoria: "advertencias", chave: "adv_dias_suspensao", valor: "3", descricao: "Dias de suspensão padrão", valorPadraoClt: "3", unidade: "dias" },
        { categoria: "advertencias", chave: "adv_suspensoes_para_justa_causa", valor: "3", descricao: "Suspensões para justa causa", valorPadraoClt: "3", unidade: "qtd" },
        { categoria: "advertencias", chave: "adv_validade_meses", valor: "6", descricao: "Validade da advertência em meses", valorPadraoClt: "6", unidade: "meses" },
        // BENEFÍCIOS
        { categoria: "beneficios", chave: "ben_vr_valor_diario", valor: "0", descricao: "Valor diário do VR/VA (R$)", valorPadraoClt: "0", unidade: "R$" },
        { categoria: "beneficios", chave: "ben_vt_percentual_desconto", valor: "6", descricao: "Percentual de desconto do VT", valorPadraoClt: "6", unidade: "%" },
        { categoria: "beneficios", chave: "ben_dias_uteis_mes", valor: "22", descricao: "Dias úteis padrão por mês", valorPadraoClt: "22", unidade: "dias" },
        // FÉRIAS
        { categoria: "ferias", chave: "ferias_periodo_aquisitivo", valor: "12", descricao: "Meses para período aquisitivo", valorPadraoClt: "12", unidade: "meses" },
        { categoria: "ferias", chave: "ferias_dias_direito", valor: "30", descricao: "Dias de férias por período", valorPadraoClt: "30", unidade: "dias" },
        { categoria: "ferias", chave: "ferias_abono_pecuniario", valor: "1", descricao: "Permitir venda de 1/3 (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "ferias", chave: "ferias_adicional_terco", valor: "33.33", descricao: "Adicional de 1/3 de férias (%)", valorPadraoClt: "33.33", unidade: "%" },
        // RESCISÃO
        { categoria: "rescisao", chave: "rescisao_aviso_previo_dias", valor: "30", descricao: "Dias de aviso prévio base", valorPadraoClt: "30", unidade: "dias" },
        { categoria: "rescisao", chave: "rescisao_aviso_adicional_ano", valor: "3", descricao: "Dias adicionais por ano trabalhado", valorPadraoClt: "3", unidade: "dias" },
        { categoria: "rescisao", chave: "rescisao_multa_fgts", valor: "40", descricao: "Multa sobre FGTS na demissão sem justa causa", valorPadraoClt: "40", unidade: "%" },
        // FOLHA - Controles adicionais
        { categoria: "folha", chave: "folha_bloquear_consolidacao_inconsistencias", valor: "1", descricao: "Bloquear consolidação com inconsistências pendentes (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
      ];

      for (const d of defaults) {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          ...d,
          atualizadoPor: ctx.user.name ?? "Sistema",
        });
      }

      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "configuracoes", entityType: "criterios", entityId: input.companyId, details: `Critérios padrão CLT inicializados (${defaults.length} itens)` });
      return { success: true, message: "Critérios padrão inicializados", created: defaults.length };
    }),
  }),

  // ============================================================
  // LIXEIRA (TRASH) - Listar e restaurar itens excluídos
  // ============================================================
  trash: router({
    // Listar todos os itens excluídos de todas as entidades
    listAll: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { isNotNull, eq, desc } = await import("drizzle-orm");
      const { companies, employees, obras, sectors, jobFunctions, dixiDevices, asos, atestados, trainings, warnings, goldenRules, documentTemplates, epiDeliveries, users } = await import("../drizzle/schema");

      const items: any[] = [];

      // Empresas excluídas
      const delCompanies = await db.select().from(companies).where(isNotNull(companies.deletedAt));
      delCompanies.forEach((c: any) => items.push({ id: c.id, entity: 'company', label: c.razaoSocial || c.nomeFantasia, deletedAt: c.deletedAt, deletedBy: c.deletedBy }));

      // Funcionários excluídos
      const delEmployees = await db.select().from(employees).where(and(eq(employees.companyId, input.companyId), isNotNull(employees.deletedAt)));
      delEmployees.forEach((e: any) => items.push({ id: e.id, entity: 'employee', label: e.nomeCompleto || e.cpf, deletedAt: e.deletedAt, deletedBy: e.deletedBy }));

      // Obras excluídas
      const delObras = await db.select().from(obras).where(and(eq(obras.companyId, input.companyId), isNotNull(obras.deletedAt)));
      delObras.forEach((o: any) => items.push({ id: o.id, entity: 'obra', label: o.nome, deletedAt: o.deletedAt, deletedBy: o.deletedBy }));

      // Setores excluídos
      const delSectors = await db.select().from(sectors).where(and(eq(sectors.companyId, input.companyId), isNotNull(sectors.deletedAt)));
      delSectors.forEach((s: any) => items.push({ id: s.id, entity: 'sector', label: s.nome, deletedAt: s.deletedAt, deletedBy: s.deletedBy }));

      // Funções excluídas
      const delFunctions = await db.select().from(jobFunctions).where(and(eq(jobFunctions.companyId, input.companyId), isNotNull(jobFunctions.deletedAt)));
      delFunctions.forEach((f: any) => items.push({ id: f.id, entity: 'jobFunction', label: f.nome, deletedAt: f.deletedAt, deletedBy: f.deletedBy }));

      // Relógios de ponto excluídos
      const delDevices = await db.select().from(dixiDevices).where(and(eq(dixiDevices.companyId, input.companyId), isNotNull(dixiDevices.deletedAt)));
      delDevices.forEach((d: any) => items.push({ id: d.id, entity: 'dixiDevice', label: d.nome || d.serialNumber, deletedAt: d.deletedAt, deletedBy: d.deletedBy }));

      // ASOs excluídos
      const delAsos = await db.select().from(asos).where(and(eq(asos.companyId, input.companyId), isNotNull(asos.deletedAt)));
      delAsos.forEach((a: any) => items.push({ id: a.id, entity: 'aso', label: `ASO #${a.id} (Func. #${a.employeeId})`, deletedAt: a.deletedAt, deletedBy: a.deletedBy }));

      // Atestados excluídos
      const delAtestados = await db.select().from(atestados).where(and(eq(atestados.companyId, input.companyId), isNotNull(atestados.deletedAt)));
      delAtestados.forEach((a: any) => items.push({ id: a.id, entity: 'atestado', label: `Atestado #${a.id} (Func. #${a.employeeId})`, deletedAt: a.deletedAt, deletedBy: a.deletedBy }));

      // Treinamentos excluídos
      const delTrainings = await db.select().from(trainings).where(and(eq(trainings.companyId, input.companyId), isNotNull(trainings.deletedAt)));
      delTrainings.forEach((t: any) => items.push({ id: t.id, entity: 'training', label: `Treinamento #${t.id} — ${t.nome || ''}`, deletedAt: t.deletedAt, deletedBy: t.deletedBy }));

      // Advertências excluídas
      const delWarnings = await db.select().from(warnings).where(and(eq(warnings.companyId, input.companyId), isNotNull(warnings.deletedAt)));
      delWarnings.forEach((w: any) => items.push({ id: w.id, entity: 'warning', label: `Advertência #${w.id} (Func. #${w.employeeId})`, deletedAt: w.deletedAt, deletedBy: w.deletedBy }));

      // Regras de ouro excluídas
      const delRules = await db.select().from(goldenRules).where(and(eq(goldenRules.companyId, input.companyId), isNotNull(goldenRules.deletedAt)));
      delRules.forEach((r: any) => items.push({ id: r.id, entity: 'goldenRule', label: r.titulo, deletedAt: r.deletedAt, deletedBy: r.deletedBy }));

      // Modelos de documentos excluídos
      const delTemplates = await db.select().from(documentTemplates).where(and(eq(documentTemplates.companyId, input.companyId), isNotNull(documentTemplates.deletedAt)));
      delTemplates.forEach((t: any) => items.push({ id: t.id, entity: 'documentTemplate', label: `Modelo: ${t.nome || t.tipo}`, deletedAt: t.deletedAt, deletedBy: t.deletedBy }));

      // Entregas de EPI excluídas
      const delEpiDeliveries = await db.select().from(epiDeliveries).where(and(eq(epiDeliveries.companyId, input.companyId), isNotNull(epiDeliveries.deletedAt)));
      delEpiDeliveries.forEach((e: any) => items.push({ id: e.id, entity: 'epiDelivery', label: `Entrega EPI #${e.id}`, deletedAt: e.deletedAt, deletedBy: e.deletedBy }));

      // Usuários excluídos
      const delUsers = await db.select().from(users).where(isNotNull(users.deletedAt));
      delUsers.forEach((u: any) => items.push({ id: u.id, entity: 'user', label: u.name || u.email, deletedAt: u.deletedAt, deletedBy: u.deletedBy }));

      // Ordenar por data de exclusão (mais recente primeiro)
      items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
      return items;
    }),

    // Restaurar item da lixeira
    restore: protectedProcedure.input(z.object({ id: z.number(), entity: z.string(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { sql: sqlFn } = await import("drizzle-orm");

      const entityMap: Record<string, string> = {
        company: 'companies',
        employee: 'employees',
        obra: 'obras',
        sector: 'sectors',
        jobFunction: 'job_functions',
        dixiDevice: 'dixi_devices',
        aso: 'asos',
        atestado: 'atestados',
        training: 'trainings',
        warning: 'warnings',
        goldenRule: 'golden_rules',
        documentTemplate: 'document_templates',
        epiDelivery: 'epi_deliveries',
        user: 'users',
      };

      const tableName = entityMap[input.entity];
      if (!tableName) throw new TRPCError({ code: "BAD_REQUEST", message: "Entidade inválida" });

      await db.execute(sqlFn.raw(`UPDATE \`${tableName}\` SET deletedAt = NULL, deletedBy = NULL, deletedByUserId = NULL WHERE id = ${input.id}`));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "RESTORE", module: "lixeira", entityType: input.entity, entityId: input.id, details: `Item restaurado da lixeira: ${input.entity} #${input.id}` });
      return { success: true };
    }),

    // Exclusão permanente
    permanentDelete: protectedProcedure.input(z.object({ id: z.number(), entity: z.string(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { sql: sqlFn } = await import("drizzle-orm");

      const entityMap: Record<string, string> = {
        company: 'companies',
        employee: 'employees',
        obra: 'obras',
        sector: 'sectors',
        jobFunction: 'job_functions',
        dixiDevice: 'dixi_devices',
        aso: 'asos',
        atestado: 'atestados',
        training: 'trainings',
        warning: 'warnings',
        goldenRule: 'golden_rules',
        documentTemplate: 'document_templates',
        epiDelivery: 'epi_deliveries',
        user: 'users',
      };

      const tableName = entityMap[input.entity];
      if (!tableName) throw new TRPCError({ code: "BAD_REQUEST", message: "Entidade inválida" });

      await db.execute(sqlFn.raw(`DELETE FROM \`${tableName}\` WHERE id = ${input.id}`));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "PERMANENT_DELETE", module: "lixeira", entityType: input.entity, entityId: input.id, details: `Item excluído permanentemente: ${input.entity} #${input.id}` });
      return { success: true };
    }),
  }),
});
export type AppRouter = typeof appRouter;
