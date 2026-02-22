import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { fechamentoPontoRouter } from "./routers/fechamentoPonto";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createCompany, updateCompany, getCompanies, getCompanyById, deleteCompany,
  createEmployee, updateEmployee, getEmployees, getEmployeeById, deleteEmployee, getEmployeeStats,
  createEmployeeHistory, getEmployeeHistory,
  createUserProfile, getUserProfiles, getUserProfilesByCompany, updateUserProfile, deleteUserProfile,
  setPermissions, getPermissions,
  createAuditLog, getAuditLogs,
  getAllUsers,
  // Ponto/Folha
  createTimeRecord, getTimeRecords, bulkCreateTimeRecords, createPayroll, getPayrolls, updatePayroll, deletePayroll,
  // Documentos e Uploads
  createPayrollUpload, getPayrollUploads, updatePayrollUploadStatus, deletePayrollUpload,
  createDixiDevice, getDixiDevices, updateDixiDevice, deleteDixiDevice,
  checkDuplicateCpf,
  // Obras
  createObra, getObras, getObraById, updateObra, deleteObra, getObrasByCompanyActive,
  getObraFuncionarios, allocateEmployeeToObra, removeEmployeeFromObra, getObraHorasRateio,
  getObraSns, getObraSnsByCompany, getActiveSnsByCompany, checkSnAvailability, addSnToObra, updateSnObra, removeSnFromObra, releaseObraSns, findObraBySn,
  // Setores e Funções
  listSectors, createSector, updateSector, deleteSector,
  listJobFunctions, createJobFunction, updateJobFunction, deleteJobFunction,
} from "./db";
import { DEFAULT_PERMISSIONS, MODULE_KEYS } from "../shared/modules";
import { getDb } from "./db";
import { obraSns } from "../drizzle/schema";
import { eq } from "drizzle-orm";
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
      await deleteCompany(input.id);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "empresas", entityType: "company", entityId: input.id, details: `Empresa excluída` });
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
      await deleteSector(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "cadastro", entityType: "sector", entityId: input.id, details: `Setor excluído` });
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
      await deleteJobFunction(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "cadastro", entityType: "jobFunction", entityId: input.id, details: `Função excluída` });
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
      if (input.cpf) {
        const dup = await checkDuplicateCpf(input.cpf);
        if (dup && (dup as any[]).length > 0) throw new TRPCError({ code: "CONFLICT", message: `CPF já cadastrado para: ${(dup as any[])[0]?.nomeCompleto}` });
      }
      const result = await createEmployee(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "colaboradores", entityType: "employee", entityId: result.id, details: `Colaborador criado: ${input.nomeCompleto}` });
      return result;
    }),
    update: protectedProcedure.input(z.any()).mutation(async ({ input, ctx }: any) => {
      // Frontend envia { id, companyId, data } - extrair dados corretamente
      const employeeData = input.data || input;
      // Proteger código interno JFC: somente ADM Master pode alterar
      if (employeeData.codigoInterno !== undefined && ctx.user.role !== 'admin') {
        delete employeeData.codigoInterno;
      }
      await updateEmployee(input.id, input.companyId, employeeData);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador atualizado: ${employeeData.nomeCompleto || input.nomeCompleto || ""}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteEmployee(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador excluído` });
      return { success: true };
    }),
    history: router({
      list: protectedProcedure.input(z.object({ employeeId: z.number(), companyId: z.number() })).query(({ input }) => getEmployeeHistory(input.employeeId, input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createEmployeeHistory(input)),
    }),
    checkDuplicateCpf: protectedProcedure.input(z.object({ cpf: z.string(), companyId: z.number() })).query(({ input }) => checkDuplicateCpf(input.cpf, input.companyId)),
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
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteDixiDevice(input.id); return { success: true }; }),
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
    })).mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { sql } = await import("drizzle-orm");
      const idList = input.ids.join(",");
      await db.execute(sql.raw(`DELETE FROM \`${input.table}\` WHERE id IN (${idList})`));
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
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteObra(input.id)),
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
      obraId: z.number(),
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
      role: z.enum(["user", "admin"]).default("user"),
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
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode resetar senhas" });
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
  }),

  // ============================================================
  // CONFIGURAÇÕES: LIMPEZA GERAL DO BANCO
  // ============================================================
  settings: router({
    cleanDatabase: protectedProcedure.input(z.object({
      confirmPassword: z.string(),
      modules: z.array(z.string()).min(1),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode limpar o banco" });
      const CLEAN_PASSWORD = "LIMPAR2026";
      if (input.confirmPassword !== CLEAN_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha de confirmação incorreta" });
      }
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { sql } = await import("drizzle-orm");
      const tableMap: Record<string, string> = {
        colaboradores: "employees",
        obras: "obras",
        setores: "setores",
        funcoes: "funcoes",
        folha_pagamento: "payroll",
        registros_ponto: "time_records",
        uploads_folha: "payroll_uploads",
        documentos: "employee_documents",
        historico: "employee_history",
        pagamentos_extras: "extra_payments",
        adiantamentos: "advance_payments",
        vr_beneficios: "vr_benefits",
      };
      let cleaned = 0;
      for (const mod of input.modules) {
        const tableName = tableMap[mod];
        if (tableName) {
          await db.execute(sql.raw(`DELETE FROM \`${tableName}\``));
          cleaned++;
        }
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
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode alterar critérios" });
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
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode restaurar padrões" });
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
});
export type AppRouter = typeof appRouter;
