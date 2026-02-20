import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
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
  // SST
  createAso, getAsos, updateAso, deleteAso,
  createTraining, getTrainings, updateTraining, deleteTraining,
  createEpi, getEpis, updateEpi, deleteEpi, createEpiDelivery, getEpiDeliveries,
  createAccident, getAccidents, updateAccident, deleteAccident,
  createWarning, getWarnings, updateWarning, deleteWarning,
  createRisk, getRisks, updateRisk, deleteRisk,
  // Ponto/Folha
  createTimeRecord, getTimeRecords, bulkCreateTimeRecords, createPayroll, getPayrolls, updatePayroll, deletePayroll,
  // Ativos
  createVehicle, getVehicles, updateVehicle, deleteVehicle,
  createEquipment, getEquipments, updateEquipment, deleteEquipment,
  createExtinguisher, getExtinguishers, updateExtinguisher, deleteExtinguisher,
  createHydrant, getHydrants, updateHydrant, deleteHydrant,
  // Qualidade
  createAudit, getAudits, updateAudit, deleteAudit,
  createDeviation, getDeviations, updateDeviation, deleteDeviation,
  createActionPlan, getActionPlans, updateActionPlan, deleteActionPlan,
  createDds, getDdsList, deleteDds,
  // CIPA
  createCipaElection, getCipaElections, updateCipaElection, deleteCipaElection,
  createCipaMember, getCipaMembers, updateCipaMember, deleteCipaMember,
  // Dashboard
  getSSTStats,
  // Documentos e Uploads
  createTrainingDocument, getTrainingDocuments, getEmployeeTrainingDocuments, deleteTrainingDocument,
  createPayrollUpload, getPayrollUploads, updatePayrollUploadStatus, deletePayrollUpload,
  createDixiDevice, getDixiDevices, updateDixiDevice, deleteDixiDevice,
  checkBlacklist, getBlacklistedEmployees, searchEmployeesByTraining,
} from "./db";
import { DEFAULT_PERMISSIONS, MODULE_KEYS } from "../shared/modules";
import type { ProfileType } from "../shared/modules";
import { dashboardsRouter } from "./routers/dashboards";
import { validateCNPJ } from "../shared/cnpj";
import { TRPCError } from "@trpc/server";
import { importExcelRouter } from "./routers/importExcel";
import { payrollParsersRouter } from "./routers/payrollParsers";

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
      // Validar CNPJ
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
      await updateCompany(id, data);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "empresas", entityType: "company", entityId: id, details: `Empresa atualizada` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteCompany(input.id);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "empresas", entityType: "company", entityId: input.id, details: `Empresa excluída` });
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
      const result = await createEmployee(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", companyId: input.companyId, action: "CREATE", module: "core_rh", entityType: "employee", entityId: result.id, details: `Colaborador criado: ${input.nomeCompleto}` });
      await createEmployeeHistory({ employeeId: result.id, companyId: input.companyId, tipo: "Admissao", descricao: `Colaborador ${input.nomeCompleto} admitido`, valorNovo: input.cargo ?? "", dataEvento: new Date(input.dataAdmissao ?? new Date().toISOString().split("T")[0]), registradoPor: ctx.user.id });
      return result;
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number(), data: z.record(z.string(), z.any()) })).mutation(async ({ input, ctx }) => {
      await updateEmployee(input.id, input.companyId, input.data as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", companyId: input.companyId, action: "UPDATE", module: "core_rh", entityType: "employee", entityId: input.id, details: `Colaborador atualizado` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteEmployee(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", companyId: input.companyId, action: "DELETE", module: "core_rh", entityType: "employee", entityId: input.id, details: `Colaborador excluído` });
      return { success: true };
    }),
    history: protectedProcedure.input(z.object({ employeeId: z.number(), companyId: z.number() })).query(({ input }) => getEmployeeHistory(input.employeeId, input.companyId)),
  }),

  // ============================================================
  // USER PROFILES & PERMISSIONS
  // ============================================================
  profiles: router({
    listUsers: protectedProcedure.query(() => getAllUsers()),
    getUserProfiles: protectedProcedure.input(z.object({ userId: z.number() })).query(({ input }) => getUserProfiles(input.userId)),
    getByCompany: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getUserProfilesByCompany(input.companyId)),
    create: protectedProcedure.input(z.object({
      userId: z.number(), companyId: z.number(),
      profileType: z.enum(["adm_master", "adm", "operacional", "avaliador", "consulta"]),
    })).mutation(async ({ input, ctx }) => {
      const result = await createUserProfile(input);
      const defaults = DEFAULT_PERMISSIONS[input.profileType as ProfileType];
      const perms = MODULE_KEYS.map(mod => ({ profileId: result.id, module: mod, ...defaults[mod] }));
      await setPermissions(result.id, perms);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", companyId: input.companyId, action: "CREATE", module: "usuarios", entityType: "user_profile", entityId: result.id, details: `Perfil ${input.profileType} criado` });
      return result;
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), profileType: z.enum(["adm_master", "adm", "operacional", "avaliador", "consulta"]).optional(), isActive: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateUserProfile(id, data);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "user_profile", entityId: id, details: `Perfil atualizado` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteUserProfile(input.id);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "usuarios", entityType: "user_profile", entityId: input.id, details: `Perfil excluído` });
      return { success: true };
    }),
    getPermissions: protectedProcedure.input(z.object({ profileId: z.number() })).query(({ input }) => getPermissions(input.profileId)),
    setPermissions: protectedProcedure.input(z.object({
      profileId: z.number(),
      permissions: z.array(z.object({ module: z.string(), canView: z.boolean(), canCreate: z.boolean(), canEdit: z.boolean(), canDelete: z.boolean() })),
    })).mutation(async ({ input, ctx }) => {
      await setPermissions(input.profileId, input.permissions.map(p => ({ ...p, profileId: input.profileId })));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "permissions", entityId: input.profileId, details: `Permissões atualizadas` });
      return { success: true };
    }),
  }),

  // ============================================================
  // AUDIT LOGS
  // ============================================================
  audit: router({
    list: protectedProcedure.input(z.object({ companyId: z.number().optional(), limit: z.number().optional() })).query(({ input }) => getAuditLogs(input.companyId, input.limit ?? 100)),
  }),

  // ============================================================
  // SST MODULE
  // ============================================================
  sst: router({
    asos: router({
      list: protectedProcedure.input(z.object({ companyId: z.number(), employeeId: z.number().optional() })).query(({ input }) => getAsos(input.companyId, input.employeeId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createAso(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateAso(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteAso(input.id); return { success: true }; }),
    }),
    trainings: router({
      list: protectedProcedure.input(z.object({ companyId: z.number(), employeeId: z.number().optional() })).query(({ input }) => getTrainings(input.companyId, input.employeeId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createTraining(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateTraining(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteTraining(input.id); return { success: true }; }),
    }),
    epis: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getEpis(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createEpi(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateEpi(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteEpi(input.id); return { success: true }; }),
      deliveries: router({
        list: protectedProcedure.input(z.object({ companyId: z.number(), employeeId: z.number().optional() })).query(({ input }) => getEpiDeliveries(input.companyId, input.employeeId)),
        create: protectedProcedure.input(z.any()).mutation(({ input }) => createEpiDelivery(input)),
      }),
    }),
    accidents: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getAccidents(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createAccident(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateAccident(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteAccident(input.id); return { success: true }; }),
    }),
    warnings: router({
      list: protectedProcedure.input(z.object({ companyId: z.number(), employeeId: z.number().optional() })).query(({ input }) => getWarnings(input.companyId, input.employeeId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createWarning(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateWarning(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteWarning(input.id); return { success: true }; }),
    }),
    risks: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getRisks(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createRisk(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateRisk(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteRisk(input.id); return { success: true }; }),
    }),
    stats: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getSSTStats(input.companyId)),
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
  // GESTÃO DE ATIVOS
  // ============================================================
  assets: router({
    vehicles: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getVehicles(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createVehicle(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateVehicle(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteVehicle(input.id); return { success: true }; }),
    }),
    equipment: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getEquipments(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createEquipment(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateEquipment(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteEquipment(input.id); return { success: true }; }),
    }),
    extinguishers: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getExtinguishers(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createExtinguisher(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateExtinguisher(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteExtinguisher(input.id); return { success: true }; }),
    }),
    hydrants: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getHydrants(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createHydrant(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateHydrant(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteHydrant(input.id); return { success: true }; }),
    }),
  }),

  // ============================================================
  // AUDITORIA E QUALIDADE
  // ============================================================
  quality: router({
    audits: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getAudits(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createAudit(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateAudit(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteAudit(input.id); return { success: true }; }),
    }),
    deviations: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDeviations(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createDeviation(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateDeviation(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteDeviation(input.id); return { success: true }; }),
    }),
    actions: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getActionPlans(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createActionPlan(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateActionPlan(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteActionPlan(input.id); return { success: true }; }),
    }),
    dds: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDdsList(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createDds(input)),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteDds(input.id); return { success: true }; }),
    }),
  }),

  // ============================================================
  // CIPA
  // ============================================================
  cipa: router({
    members: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
        // Get all elections for this company, then get members for the latest
        const elections = await getCipaElections(input.companyId);
        if (elections.length === 0) return [];
        const latest = elections[0];
        const membersData = await getCipaMembers(latest.id, input.companyId);
        return membersData.map((m: any) => ({ ...m.member, employeeName: m.employee?.nomeCompleto ?? "-", employeeCargo: m.employee?.cargo ?? "-" }));
      }),
      create: protectedProcedure.input(z.any()).mutation(async ({ input }) => {
        // Ensure there's an election, create one if not
        const elections = await getCipaElections(input.companyId);
        let electionId: number;
        if (elections.length === 0) {
          const e = await createCipaElection({ companyId: input.companyId, gestao: new Date().getFullYear() + "/" + (new Date().getFullYear() + 1), status: "Em_Andamento", mandatoInicio: new Date() });
          electionId = e.id;
        } else {
          electionId = elections[0].id;
        }
        return createCipaMember({ ...input, electionId });
      }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteCipaMember(input.id); return { success: true }; }),
    }),
    elections: router({
      list: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getCipaElections(input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createCipaElection(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updateCipaElection(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteCipaElection(input.id); return { success: true }; }),
    }),
   }),

  // ============================================================
  // DOCUMENTOS DE TREINAMENTO
  // ============================================================
  trainingDocs: router({
    list: protectedProcedure.input(z.object({ trainingId: z.number() })).query(({ input }) => getTrainingDocuments(input.trainingId)),
    byEmployee: protectedProcedure.input(z.object({ employeeId: z.number() })).query(({ input }) => getEmployeeTrainingDocuments(input.employeeId)),
    create: protectedProcedure.input(z.any()).mutation(({ input }) => createTrainingDocument(input)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deleteTrainingDocument(input.id); return { success: true }; }),
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
  // LISTA NEGRA E BUSCA POR TREINAMENTO
  // ============================================================
  blacklist: router({
    check: protectedProcedure.input(z.object({ cpf: z.string() })).query(({ input }) => checkBlacklist(input.cpf)),
    list: protectedProcedure.input(z.object({ companyId: z.number().optional() })).query(({ input }) => getBlacklistedEmployees(input.companyId)),
  }),
  searchByTraining: protectedProcedure.input(z.object({ companyId: z.number(), trainingName: z.string() })).query(({ input }) => searchEmployeesByTraining(input.companyId, input.trainingName)),

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
        "employees", "asos", "trainings", "epis", "epi_deliveries",
        "accidents", "warnings", "risks", "vehicles", "equipment",
        "extinguishers", "hydrants", "audits", "deviations",
        "action_plans", "dds", "cipa_elections", "cipa_members",
        "payroll", "time_records", "chemicals", "payroll_uploads",
        "training_documents"
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
  // LOGIN COM SENHA & GERENCIAMENTO DE USUÁRIOS
  // ============================================================
  userManagement: router({
    // Listar todos os usuários do sistema
    listUsers: protectedProcedure.query(async () => {
      const bcrypt = await import("bcryptjs");
      const allUsers = await getAllUsers();
      return allUsers.map((u: any) => ({ ...u, password: undefined }));
    }),
    // Criar usuário local com username/senha
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
      // Verificar se username já existe
      const existing = await db.select().from(users).where(eq(users.username, input.username));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Username já existe" });
      const defaultPwd = input.password || "fc2026";
      const hashed = bcrypt.hashSync(defaultPwd, 10);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await db.insert(users).values({
        openId, name: input.name, email: input.email || null,
        username: input.username, password: hashed,
        mustChangePassword: true, loginMethod: "local", role: input.role,
      });
      return { id: Number(result[0].insertId), username: input.username, defaultPassword: defaultPwd };
    }),
    // Login local com username/senha
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
      // Criar sessão via cookie
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: user.id, openId: user.openId }, process.env.JWT_SECRET || "secret", { expiresIn: "7d" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      return { success: true, mustChangePassword: !!user.mustChangePassword, user: { id: user.id, name: user.name, role: user.role } };
    }),
    // Trocar senha
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
      await db.update(users).set({ password: hashed, mustChangePassword: false }).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    // Resetar senha de um usuário (admin)
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
      await db.update(users).set({ password: hashed, mustChangePassword: true }).where(eq(users.id, input.userId));
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
      // Verificar senha de confirmação
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
        treinamentos: "trainings",
        asos: "asos",
        advertencias: "warnings",
        epis: "epis",
        epi_entregas: "epi_deliveries",
        acidentes: "accidents",
        riscos: "risks",
        auditorias: "audits",
        desvios: "deviations",
        planos_acao: "action_plans",
        dds: "dds",
        cipa_eleicoes: "cipa_elections",
        cipa_membros: "cipa_members",
        folha_pagamento: "payroll",
        registros_ponto: "time_records",
        veiculos: "vehicles",
        equipamentos: "equipments",
        extintores: "extinguishers",
        hidrantes: "hydrants",
        quimicos: "chemicals",
        uploads_folha: "payroll_uploads",
        documentos_treinamento: "training_documents",
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
});
export type AppRouter = typeof appRouter;
