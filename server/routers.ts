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
} from "./db";
import { DEFAULT_PERMISSIONS, MODULE_KEYS } from "../shared/modules";
import type { ProfileType, ModuleKey } from "../shared/modules";

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
    list: protectedProcedure.query(async () => {
      return getCompanies();
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return getCompanyById(input.id);
    }),
    create: protectedProcedure.input(z.object({
      cnpj: z.string().min(14),
      razaoSocial: z.string().min(1),
      nomeFantasia: z.string().optional(),
      endereco: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const result = await createCompany(input);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "CREATE",
        module: "empresas",
        entityType: "company",
        entityId: result.id,
        details: `Empresa criada: ${input.razaoSocial}`,
      });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      cnpj: z.string().optional(),
      razaoSocial: z.string().optional(),
      nomeFantasia: z.string().optional(),
      endereco: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateCompany(id, data);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "UPDATE",
        module: "empresas",
        entityType: "company",
        entityId: id,
        details: `Empresa atualizada: ${JSON.stringify(data)}`,
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteCompany(input.id);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "DELETE",
        module: "empresas",
        entityType: "company",
        entityId: input.id,
        details: `Empresa excluída`,
      });
      return { success: true };
    }),
  }),

  // ============================================================
  // EMPLOYEES
  // ============================================================
  employees: router({
    list: protectedProcedure.input(z.object({
      companyId: z.number(),
      search: z.string().optional(),
      status: z.string().optional(),
    })).query(async ({ input }) => {
      return getEmployees(input.companyId, input.search, input.status);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).query(async ({ input }) => {
      return getEmployeeById(input.id, input.companyId);
    }),
    stats: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      return getEmployeeStats(input.companyId);
    }),
    create: protectedProcedure.input(z.object({
      companyId: z.number(),
      nomeCompleto: z.string().min(1),
      cpf: z.string().min(11),
      rg: z.string().optional(),
      orgaoEmissor: z.string().optional(),
      dataNascimento: z.string().optional(),
      sexo: z.enum(["M", "F", "Outro"]).optional(),
      estadoCivil: z.enum(["Solteiro", "Casado", "Divorciado", "Viuvo", "Uniao_Estavel"]).optional(),
      nacionalidade: z.string().optional(),
      naturalidade: z.string().optional(),
      nomeMae: z.string().optional(),
      nomePai: z.string().optional(),
      ctps: z.string().optional(),
      serieCTPS: z.string().optional(),
      pis: z.string().optional(),
      tituloEleitor: z.string().optional(),
      certificadoReservista: z.string().optional(),
      cnh: z.string().optional(),
      categoriaCNH: z.string().optional(),
      validadeCNH: z.string().optional(),
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      telefone: z.string().optional(),
      celular: z.string().optional(),
      email: z.string().optional(),
      contatoEmergencia: z.string().optional(),
      telefoneEmergencia: z.string().optional(),
      cargo: z.string().optional(),
      funcao: z.string().optional(),
      setor: z.string().optional(),
      dataAdmissao: z.string().optional(),
      salarioBase: z.string().optional(),
      horasMensais: z.string().optional(),
      tipoContrato: z.enum(["CLT", "PJ", "Temporario", "Estagio", "Aprendiz"]).optional(),
      jornadaTrabalho: z.string().optional(),
      banco: z.string().optional(),
      agencia: z.string().optional(),
      conta: z.string().optional(),
      tipoConta: z.enum(["Corrente", "Poupanca"]).optional(),
      chavePix: z.string().optional(),
      matricula: z.string().optional(),
      status: z.enum(["Ativo", "Ferias", "Afastado", "Licenca", "Desligado", "Recluso"]).optional(),
      observacoes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const result = await createEmployee(input as any);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        companyId: input.companyId,
        action: "CREATE",
        module: "core_rh",
        entityType: "employee",
        entityId: result.id,
        details: `Colaborador criado: ${input.nomeCompleto}`,
      });
      await createEmployeeHistory({
        employeeId: result.id,
        companyId: input.companyId,
        tipo: "Admissao",
        descricao: `Colaborador ${input.nomeCompleto} admitido`,
        valorNovo: input.cargo ?? "",
        dataEvento: new Date(input.dataAdmissao ?? new Date().toISOString().split("T")[0]),
        registradoPor: ctx.user.id,
      });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      companyId: z.number(),
      data: z.record(z.string(), z.any()),
    })).mutation(async ({ input, ctx }) => {
      const { id: _id, companyId: _cid, ...updateData } = input.data as any;
      await updateEmployee(input.id, input.companyId, input.data as any);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        companyId: input.companyId,
        action: "UPDATE",
        module: "core_rh",
        entityType: "employee",
        entityId: input.id,
        details: `Colaborador atualizado: ${JSON.stringify(Object.keys(input.data))}`,
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteEmployee(input.id, input.companyId);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        companyId: input.companyId,
        action: "DELETE",
        module: "core_rh",
        entityType: "employee",
        entityId: input.id,
        details: `Colaborador excluído`,
      });
      return { success: true };
    }),
    history: protectedProcedure.input(z.object({ employeeId: z.number(), companyId: z.number() })).query(async ({ input }) => {
      return getEmployeeHistory(input.employeeId, input.companyId);
    }),
  }),

  // ============================================================
  // USER PROFILES & PERMISSIONS
  // ============================================================
  profiles: router({
    listUsers: protectedProcedure.query(async () => {
      return getAllUsers();
    }),
    getUserProfiles: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      return getUserProfiles(input.userId);
    }),
    getByCompany: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      return getUserProfilesByCompany(input.companyId);
    }),
    create: protectedProcedure.input(z.object({
      userId: z.number(),
      companyId: z.number(),
      profileType: z.enum(["adm_master", "adm", "operacional", "avaliador", "consulta"]),
    })).mutation(async ({ input, ctx }) => {
      const result = await createUserProfile(input);
      // Set default permissions
      const defaults = DEFAULT_PERMISSIONS[input.profileType as ProfileType];
      const perms = MODULE_KEYS.map(mod => ({
        profileId: result.id,
        module: mod,
        ...defaults[mod],
      }));
      await setPermissions(result.id, perms);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        companyId: input.companyId,
        action: "CREATE",
        module: "usuarios",
        entityType: "user_profile",
        entityId: result.id,
        details: `Perfil ${input.profileType} criado para usuário ${input.userId}`,
      });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      profileType: z.enum(["adm_master", "adm", "operacional", "avaliador", "consulta"]).optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateUserProfile(id, data);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "UPDATE",
        module: "usuarios",
        entityType: "user_profile",
        entityId: id,
        details: `Perfil atualizado: ${JSON.stringify(data)}`,
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteUserProfile(input.id);
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "DELETE",
        module: "usuarios",
        entityType: "user_profile",
        entityId: input.id,
        details: `Perfil excluído`,
      });
      return { success: true };
    }),
    getPermissions: protectedProcedure.input(z.object({ profileId: z.number() })).query(async ({ input }) => {
      return getPermissions(input.profileId);
    }),
    setPermissions: protectedProcedure.input(z.object({
      profileId: z.number(),
      permissions: z.array(z.object({
        module: z.string(),
        canView: z.boolean(),
        canCreate: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      })),
    })).mutation(async ({ input, ctx }) => {
      await setPermissions(input.profileId, input.permissions.map(p => ({ ...p, profileId: input.profileId })));
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Sistema",
        action: "UPDATE",
        module: "usuarios",
        entityType: "permissions",
        entityId: input.profileId,
        details: `Permissões atualizadas`,
      });
      return { success: true };
    }),
  }),

  // ============================================================
  // AUDIT LOGS
  // ============================================================
  audit: router({
    list: protectedProcedure.input(z.object({
      companyId: z.number().optional(),
      limit: z.number().optional(),
    })).query(async ({ input }) => {
      return getAuditLogs(input.companyId, input.limit ?? 100);
    }),
  }),
});

export type AppRouter = typeof appRouter;
