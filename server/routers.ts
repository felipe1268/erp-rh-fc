import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { fechamentoPontoRouter } from "./routers/fechamentoPonto";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createCompany, updateCompany, getCompanies, getCompanyById, deleteCompany, restoreCompany,
  getCompaniesForUser, getUserCompanyLinks, setUserCompanies, getConstrutoras, getConstrutorasIds,
  getUserPermissions, setUserPermissions,
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
  getObraFuncionarios, allocateEmployeeToObra, removeEmployeeFromObra, getObraHorasRateio, checkEmployeeAllocations,
  getEquipeObra, getEfetivoDashboardMensal,
  getEmployeeSiteHistory, getEfetivoPorObra, getEfetivoHistorico, getFuncionariosSemObra, transferirFuncionariosEmLote,
  detectarInconsistenciaPonto, getInconsistenciasPendentes, resolverInconsistenciaEsporadico, resolverInconsistenciaTransferir, countInconsistenciasPendentes, getOndeTrabalhouNoMes,
  getObraSns, getObraSnsByCompany, getActiveSnsByCompany, getAvailableSns, checkSnAvailability, addSnToObra, updateSnObra, removeSnFromObra, releaseObraSns, findObraBySn,
  // Setores e Funções
  listSectors, createSector, updateSector, deleteSector, restoreSector,
  listJobFunctions, createJobFunction, updateJobFunction, deleteJobFunction, restoreJobFunction,
  // Revisões
  getRevisions, getLatestRevision, createRevision, deleteRevision,
  // Grupos de Usuários
  listUserGroups, getUserGroupById, createUserGroup, updateUserGroup, deleteUserGroup,
  getGroupPermissions, setGroupPermissions, getGroupMembers, getUserGroupMemberships,
  addUserToGroup, removeUserFromGroup, setUserGroups, getUserEffectiveGroupPermissions,
} from "./db";
import { DEFAULT_PERMISSIONS, MODULE_KEYS } from "../shared/modules";
import { getDb } from "./db";
import { obraSns, employees, blacklistReactivationRequests } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "./companyHelper";
import type { ProfileType } from "../shared/modules";
import { dashboardsRouter } from "./routers/dashboards";
import { validateCNPJ } from "../shared/cnpj";
import { TRPCError } from "@trpc/server";
import { importExcelRouter } from "./routers/importExcel";
import { payrollParsersRouter } from "./routers/payrollParsers";
import { folhaPagamentoRouter } from "./routers/folhaPagamento";
import { controleDocumentosRouter } from "./routers/controleDocumentos";
import { getAvailableTables, getTableStructure, importTableData } from "./routers/importData";
import { processosTrabRouter } from "./routers/processosTrabalhistas";
import { homeDataRouter } from "./routers/homeData";
import { episRouter } from "./routers/epis";
import { menuConfigRouter } from "./routers/menuConfig";
import { goldenRulesRouter } from "./routers/goldenRules";
import { visaoPanoramicaRouter } from "./routers/visaoPanoramica";
import { datajudAutoCheckRouter, startAutoCheckJob } from "./routers/datajudAutoCheck";
import { valeAlimentacaoRouter } from "./routers/valeAlimentacao";
import { notificationsRouter } from "./routers/notifications";
import { avisoPrevioFeriasRouter } from "./routers/avisoPrevioFerias";
import { cipaRouter } from "./routers/cipa";
import { pjContractsRouter } from "./routers/pjContracts";
import { insuranceRouter } from "./routers/insurance";
import { dixiPontoRouter } from "./routers/dixiPonto";
import { heSolicitacoesRouter } from "./routers/heSolicitacoes";
import { pontoDescontosRouter } from "./routers/pontoDescontos";
import { feriadosRouter } from "./routers/feriados";
import { employeeDocumentsRouter } from "./routers/employeeDocuments";
import { pjMedicoesRouter } from "./routers/pjMedicoes";
import { dissidioRouter } from "./routers/dissidio";
import { sindicalRouter } from "./routers/sindical";
import { avaliacaoRouter } from "./routers/avaliacao";
import { assistenteIARouter } from "./routers/assistenteIA";
import { sprint1Router } from "./routers/sprint1Foundation";
import { medicosClinicasRouter } from "./routers/medicosClinicas";
import { terceirosRouter } from "./routers/terceiros";
import { parceirosRouter } from "./routers/parceiros";
import { portalExternoRouter } from "./routers/portalExterno";
import { payrollEngineRouter } from "./routers/payrollEngine";
import { fieldNotesRouter } from "./routers/fieldNotes";
import { epiAvancadoRouter } from "./routers/epiAvancado";
import { backupRouter } from "./routers/backup";
import { migrationRouter } from "./routers/migration";
import { contractsRouter } from "./routers/contracts";
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
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => opts.listFn(input.companyId)),
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
  insurance: insuranceRouter,
  menuConfig: menuConfigRouter,
  goldenRules: goldenRulesRouter,
  notifications: notificationsRouter,
  avaliacao: avaliacaoRouter,
  assistenteIA: assistenteIARouter,
  sprint1: sprint1Router,
  medicosClinicas: medicosClinicasRouter,
  terceiros: terceirosRouter,
  parceiros: parceirosRouter,
  portalExterno: portalExternoRouter,
  payrollEngine: payrollEngineRouter,
  fieldNotes: fieldNotesRouter,
  epiAvancado: epiAvancadoRouter,
  backup: backupRouter,
  migration: migrationRouter,
  contracts: contractsRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { password, ...safeUser } = opts.ctx.user as any;
      return safeUser;
    }),
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
    list: protectedProcedure.query(async ({ ctx }) => getCompaniesForUser(ctx.user.id, ctx.user.role)),
    // Listar empresas que compartilham recursos ("Construtoras")
    construtoras: protectedProcedure.query(async () => getConstrutoras()),
    construtorasIds: protectedProcedure.query(async () => getConstrutorasIds()),
    // Toggle compartilhaRecursos (só Admin Master)
    toggleCompartilhaRecursos: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), compartilhaRecursos: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode alterar esta configuração' });
      const db = (await getDb())!;
      await db.update(companies).set({ compartilhaRecursos: input.compartilhaRecursos ? 1 : 0 } as any).where(eq(companies.id, input.companyId));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'empresas', entityType: 'company', entityId: input.companyId, details: `Compartilha recursos: ${input.compartilhaRecursos}` });
      return { success: true };
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => getCompanyById(input.id)),
    create: protectedProcedure.input(z.object({
      cnpj: z.string().min(14), razaoSocial: z.string().min(1),
      nomeFantasia: z.string().optional(), endereco: z.string().optional(),
      cidade: z.string().optional(), estado: z.string().optional(),
      cep: z.string().optional(), telefone: z.string().optional(), email: z.string().optional(),
      inscricaoEstadual: z.string().optional(), inscricaoMunicipal: z.string().optional(),
      grupoEmpresarial: z.string().optional(),
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
      cep: z.string().optional(), telefone: z.string().optional(), email: z.string().optional(),
      inscricaoEstadual: z.string().optional(), inscricaoMunicipal: z.string().optional(),
      grupoEmpresarial: z.string().optional(),
      isActive: z.boolean().optional(),
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
    uploadLogo: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), base64: z.string(),
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
    // Numeração Interna - Configuração
    getNumbering: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input }) => {
      const company = await getCompanyById(input.companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
      return {
        prefixoCodigo: (company as any).prefixoCodigo || 'EMP',
        nextCodigoInterno: (company as any).nextCodigoInterno || 1,
        numerosProibidos: (company as any).numerosProibidos || '13,17,22,24,69,171,666',
      };
    }),
    updateNumbering: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), prefixoCodigo: z.string().min(1).max(10),
      nextCodigoInterno: z.number().min(1),
      numerosProibidos: z.string().max(500).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode alterar a numeração" });
      const updateData: any = { prefixoCodigo: input.prefixoCodigo, nextCodigoInterno: input.nextCodigoInterno };
      if (input.numerosProibidos !== undefined) updateData.numerosProibidos = input.numerosProibidos;
      await updateCompany(input.companyId, updateData);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "company", entityId: input.companyId, details: `Numeração interna alterada: prefixo=${input.prefixoCodigo}, próximo=${input.nextCodigoInterno}${input.numerosProibidos !== undefined ? `, proibidos=${input.numerosProibidos}` : ''}` });
      return { success: true };
    }),
    resetNumbering: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), confirmPassword: z.string(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode resetar a numeração" });
      if (input.confirmPassword.trim() !== "RESETAR2026") throw new TRPCError({ code: "BAD_REQUEST", message: "Senha de confirmação incorreta. Digite exatamente: RESETAR2026" });
      await updateCompany(input.companyId, { nextCodigoInterno: 1 } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "company", entityId: input.companyId, details: `Numeração interna RESETADA para 1` });
      return { success: true };
    }),
  }),

  // ============================================================
  // SETORES
  // ============================================================
  sectors: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => listSectors(input.companyId)),
    create: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1), descricao: z.string().optional(),
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
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => listJobFunctions(input.companyId)),
    create: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1), descricao: z.string().optional(), ordemServico: z.string().optional(), cbo: z.string().optional(),
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
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), search: z.string().optional(), status: z.string().optional() })).query(({ input }) => getEmployees(input.companyId, input.search, input.status, input.companyIds)),
    getById: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).query(({ input }) => getEmployeeById(input.id, input.companyId)),
    stats: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getEmployeeStats(input.companyId)),
    create: protectedProcedure.input(z.any()).mutation(async ({ input, ctx }) => {
      // === REGRA-MÃE DE UNICIDADE ===
      // Valida CPF em TODAS as empresas do grupo (não apenas na empresa atual)
      if (input.cpf && !input.cpf.startsWith('000.000')) {
        // Verificar se está na Blacklist (sempre bloqueia)
        const blacklisted = await checkBlacklist(input.cpf);
        if (blacklisted) {
          throw new TRPCError({ code: "FORBIDDEN", message: `\ud83d\udeab FUNCION\u00c1RIO NA BLACKLIST!\n\n${blacklisted.nomeCompleto} (CPF: ${input.cpf}) est\u00e1 na Blacklist da empresa.\nMotivo: ${blacklisted.motivoListaNegra || 'N\u00e3o informado'}\nData: ${blacklisted.dataListaNegra || 'N/A'}\nRegistrado por: ${(blacklisted as any).listaNegraPor || 'N/A'}\n\nPara reativar este funcion\u00e1rio, \u00e9 necess\u00e1ria a aprova\u00e7\u00e3o de 2 diretores da empresa.` });
        }
        // Verificar CPF duplicado com suporte a recontratação
        const dup = await checkDuplicateCpf(input.cpf);
        if (dup && (dup as any[]).length > 0) {
          const dupInfo = (dup as any[])[0];
          // Se o funcionário está desligado e flag de recontratação está ativa, permitir
          const isDesligado = dupInfo.status === 'Desligado' || dupInfo.status === 'Inativo';
          if (isDesligado && input._recontratacao) {
            // Verificar carência de recontratação
            if (dupInfo.dataDesligamento) {
              const dataDeslig = new Date(dupInfo.dataDesligamento);
              const hoje = new Date();
              const diffDias = Math.floor((hoje.getTime() - dataDeslig.getTime()) / (1000 * 60 * 60 * 24));
              // Carência padrão de 90 dias (pode ser configurado nos critérios)
              if (diffDias < 90) {
                throw new TRPCError({ code: "CONFLICT", message: `\u26a0\ufe0f Car\u00eancia de recontrata\u00e7\u00e3o!\n\n${dupInfo.nomeCompleto} foi desligado h\u00e1 ${diffDias} dias.\nCar\u00eancia m\u00ednima: 90 dias.\nData de desligamento: ${dupInfo.dataDesligamento}\n\nAguarde o t\u00e9rmino da car\u00eancia para recontrata\u00e7\u00e3o.` });
              }
            }
            // Permitir recontratação - não bloquear
          } else if (isDesligado) {
            // Funcionário desligado mas sem flag de recontratação - informar que pode recontratar
            throw new TRPCError({ code: "CONFLICT", message: `\u26a0\ufe0f CPF j\u00e1 cadastrado (Funcion\u00e1rio Desligado)\n\nO CPF ${input.cpf} pertence a: ${dupInfo.nomeCompleto}\nEmpresa: ${dupInfo.empresa || 'N/A'}\nStatus: ${dupInfo.status}\nData Desligamento: ${dupInfo.dataDesligamento || 'N/A'}\n\n\ud83d\udd04 Este funcion\u00e1rio pode ser RECONTRATADO.\nUse a op\u00e7\u00e3o de recontrata\u00e7\u00e3o no cadastro para prosseguir.` });
          } else {
            throw new TRPCError({ code: "CONFLICT", message: `\u26a0\ufe0f CPF j\u00e1 cadastrado!\n\nO CPF ${input.cpf} pertence a: ${dupInfo.nomeCompleto}\nEmpresa: ${dupInfo.empresa || 'N/A'}\nStatus: ${dupInfo.status || 'N/A'}\n\nN\u00e3o \u00e9 poss\u00edvel cadastrar o mesmo CPF novamente em nenhuma empresa do grupo.` });
          }
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
      // Disparo automático de notificação de contratação (fire-and-forget, não bloqueia o retorno)
      if (input.status === "Ativo" && input.companyId) {
        (async () => {
          try {
            const company = await getCompanyById(input.companyId);
            await dispararNotificacao(input.companyId, "contratacao", {
              nome: input.nomeCompleto || "",
              cpf: input.cpf || "",
              funcao: input.funcao || "",
              setor: input.setor || "",
              empresa: company?.razaoSocial || company?.nomeFantasia || "",
              dataAdmissao: input.dataAdmissao || "",
              dataNascimento: input.dataNascimento || "",
              estadoCivil: input.estadoCivil || "",
              salario: input.salarioBase || "",
              employeeId: result.id,
              statusAnterior: null as any,
              statusNovo: "Ativo",
            }, ctx.user.id, ctx.user.name ?? "Sistema");
          } catch (e) { console.error("[Notificação] Erro ao disparar contratação:", e); }
        })();
      }
      return result;
    }),
    update: protectedProcedure.input(z.any()).mutation(async ({ input, ctx }: any) => {
      // Frontend envia { id, companyId, data } - extrair dados corretamente
      const employeeData = input.data || input;
      // Proteger código interno JFC: somente ADM Master pode alterar
      if (employeeData.codigoInterno !== undefined && ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') {
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
        // Automaticamente mudar status para Lista_Negra
        employeeData.status = 'Lista_Negra';
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
        // Ao remover da blacklist, voltar status para Desligado (pode ser recontratado)
        if (employeeData.status === 'Lista_Negra') {
          employeeData.status = 'Desligado';
        }
      }
      
      await updateEmployee(input.id, input.companyId, employeeData);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador atualizado: ${employeeData.nomeCompleto || input.nomeCompleto || ""}` });
      
      // === AUTO-DESALOCAÇÃO: Remover de obra quando status muda para Desligado ou Lista_Negra ===
      const statusAnterior = empAnterior?.status || null;
      const statusNovo = employeeData.status || null;
      if (statusNovo && ['Desligado', 'Lista_Negra'].includes(statusNovo) && statusAnterior !== statusNovo) {
        try {
          const allocations = await checkEmployeeAllocations([input.id]);
          const activeAlloc = allocations.find((a: any) => a.employeeId === input.id);
          if (activeAlloc) {
            await removeEmployeeFromObra(input.id, `Auto-desalocação: status alterado para ${statusNovo}`, ctx.user.name ?? 'Sistema', ctx.user.id);
            await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "obras", entityType: "obra_funcionario", entityId: activeAlloc.obraAtualId, details: `Funcionário ${employeeData.nomeCompleto || empAnterior?.nomeCompleto || ''} removido automaticamente da obra ${activeAlloc.obraAtualNome} (status: ${statusNovo})` });
            console.log(`[AutoDesalocação] Funcionário #${input.id} removido da obra #${activeAlloc.obraAtualId} (status: ${statusNovo})`);
          }
        } catch (e) { console.error('[AutoDesalocação] Erro:', e); }
      }
      
      // Disparo automático de notificação por mudança de status (fire-and-forget, não bloqueia o retorno)
      if (statusNovo && statusAnterior !== statusNovo) {
        const tipoMov = mapStatusToTipoMovimentacao(statusAnterior, statusNovo);
        if (tipoMov && input.companyId) {
          (async () => {
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
          })();
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
    // === CONTRATO DE EXPERIÊNCIA ===
    prorrogarExperiencia: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      obs: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      const expStatus = (emp as any).experienciaStatus;
      if (expStatus !== 'em_experiencia') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Só é possível prorrogar contratos no 1º período de experiência' });
      await updateEmployee(input.employeeId, input.companyId, {
        experienciaStatus: 'prorrogado',
        experienciaProrrogadoEm: new Date().toISOString().split('T')[0],
        experienciaProrrogadoPor: ctx.user.name ?? 'Sistema',
        experienciaObs: input.obs || null,
      } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Contrato de experiência PRORROGADO para 2º período. ${input.obs || ''}` });
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Outros' as any, descricao: `Contrato de experiência prorrogado para 2º período por ${ctx.user.name}. ${input.obs || ''}`, data: new Date().toISOString().split('T')[0], registradoPor: ctx.user.name ?? 'Sistema' } as any);
      return { success: true };
    }),
    efetivarExperiencia: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      obs: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      await updateEmployee(input.employeeId, input.companyId, {
        experienciaStatus: 'efetivado',
        experienciaEfetivadoEm: new Date().toISOString().split('T')[0],
        experienciaEfetivadoPor: ctx.user.name ?? 'Sistema',
        experienciaObs: input.obs || null,
      } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Colaborador EFETIVADO após período de experiência. ${input.obs || ''}` });
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Outros' as any, descricao: `Colaborador efetivado após período de experiência por ${ctx.user.name}. ${input.obs || ''}`, data: new Date().toISOString().split('T')[0], registradoPor: ctx.user.name ?? 'Sistema' } as any);
      return { success: true };
    }),
    desligarExperiencia: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      motivo: z.string().min(1),
      obs: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      await updateEmployee(input.employeeId, input.companyId, {
        experienciaStatus: 'desligado_experiencia',
        status: 'Desligado',
        dataDemissao: new Date().toISOString().split('T')[0],
        dataDesligamentoEfetiva: new Date().toISOString().split('T')[0],
        categoriaDesligamento: 'Término de contrato',
        motivoDesligamento: input.motivo,
        desligadoPor: ctx.user.name ?? 'Sistema',
        desligadoUserId: ctx.user.id,
        experienciaObs: input.obs || null,
      } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Colaborador DESLIGADO durante período de experiência. Motivo: ${input.motivo}` });
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Desligamento' as any, descricao: `Desligado durante período de experiência por ${ctx.user.name}. Motivo: ${input.motivo}`, data: new Date().toISOString().split('T')[0], registradoPor: ctx.user.name ?? 'Sistema' } as any);
      // Auto-desalocação de obra
      try {
        const allocations = await checkEmployeeAllocations([input.employeeId]);
        const activeAlloc = allocations.find((a: any) => a.employeeId === input.employeeId);
        if (activeAlloc) {
          await removeEmployeeFromObra(input.employeeId, 'Auto-desalocação: desligamento durante período de experiência', ctx.user.name ?? 'Sistema', ctx.user.id);
          console.log(`[AutoDesalocação] Funcionário #${input.employeeId} removido da obra #${activeAlloc.obraAtualId} (desligamento experiência)`);
        }
      } catch (e) { console.error('[AutoDesalocação] Erro:', e); }
      return { success: true };
    }),
  }),

  // ============================================================
  // PERFIS DE ACESSO
  // ============================================================
  profiles: router({
    list: protectedProcedure.query(({ ctx }) => getUserProfiles(ctx.user.id)),
    listByCompany: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getUserProfilesByCompany(input.companyId)),
    create: protectedProcedure.input(z.object({
      userId: z.number(), companyId: z.number(), profileType: z.string(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin pode gerenciar perfis" });
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
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin pode gerenciar perfis" });
      await updateUserProfile(input.id, { profileType: input.profileType as ProfileType });
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "profile", entityId: input.id, details: `Perfil atualizado` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin pode gerenciar perfis" });
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
      list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(), month: z.string().optional() })).query(({ input }) => getTimeRecords(input.companyId, input.employeeId, input.month)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createTimeRecord(input)),
      bulkCreate: protectedProcedure.input(z.object({ records: z.array(z.any()) })).mutation(({ input }) => { bulkCreateTimeRecords(input.records); return { success: true }; }),
    }),
    payroll: router({
      list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), month: z.string().optional(), employeeId: z.number().optional() })).query(({ input }) => getPayrolls(input.companyId, input.month, input.employeeId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createPayroll(input)),
      update: protectedProcedure.input(z.any()).mutation(({ input }: any) => { updatePayroll(input.id, input); return { success: true }; }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deletePayroll(input.id); return { success: true }; }),
    }),
  }),

  // ============================================================
  // UPLOADS DE FOLHA (Cartão de Ponto, Folha, Vale)
  // ============================================================
  payrollUploads: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), month: z.string().optional(), category: z.string().optional() })).query(({ input }) => getPayrollUploads(input.companyId, input.month, input.category)),
    create: protectedProcedure.input(z.any()).mutation(({ input }) => createPayrollUpload(input)),
    updateStatus: protectedProcedure.input(z.object({ id: z.number(), status: z.string(), recordsProcessed: z.number().optional(), errorMessage: z.string().optional() })).mutation(({ input }) => { updatePayrollUploadStatus(input.id, input.status, input.recordsProcessed, input.errorMessage); return { success: true }; }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => { deletePayrollUpload(input.id); return { success: true }; }),
  }),

  // ============================================================
  // DISPOSITIVOS DIXI (Vinculação Sn -> Obra)
  // ============================================================
  dixiDevices: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDixiDevices(input.companyId)),
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
  visaoPanoramica: visaoPanoramicaRouter,

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
  // DIXI PONTO (AFD)
  // ============================================================
  dixiPonto: dixiPontoRouter,

  // ============================================================
  // SOLICITAÇÃO DE HORAS EXTRAS
  // ============================================================
  heSolicitacoes: heSolicitacoesRouter,

  // ============================================================
  // DESCONTOS CLT (Motor de Cálculo)
  // ============================================================
  pontoDescontos: pontoDescontosRouter,

  // ============================================================
  // PROCESSOS TRABALHISTAS
  // ============================================================
  processos: processosTrabRouter,

  // ============================================================
  // OBRAS
  // ============================================================
  obras: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input }) => {
      if (input.companyIds && input.companyIds.length > 0) {
        const results = await Promise.all(input.companyIds.map(id => getObras(id)));
        return results.flat();
      }
      return getObras(input.companyId);
    }),
    listActive: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getObrasByCompanyActive(input.companyId, input.companyIds)),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => getObraById(input.id)),
    create: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1),
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
      sns: z.array(z.object({ sn: z.string(), apelido: z.string().optional() })).optional(),
      usarConvencaoMatriz: z.number().optional(),
      convencaoId: z.number().nullable().optional(),
    })).mutation(async ({ input }) => {
      const { sns, ...obraData } = input;
      const result = await createObra(obraData as any);
      // Auto-link SNs if provided
      if (sns && sns.length > 0 && result?.id) {
        for (const snItem of sns) {
          try {
            await addSnToObra({ companyId: input.companyId, obraId: result.id, sn: snItem.sn, apelido: snItem.apelido });
          } catch (e) {
            // Skip SNs that fail (e.g. already in use)
          }
        }
      }
      return result;
    }),
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
      usarConvencaoMatriz: z.number().optional(),
      convencaoId: z.number().nullable().optional(),
      convencaoDivergencias: z.string().nullable().optional(),
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
    // Check if employees already have active allocations (pre-validation)
    checkAllocations: protectedProcedure.input(z.object({
      employeeIds: z.array(z.number()),
    })).query(({ input }) => checkEmployeeAllocations(input.employeeIds)),
    allocateEmployee: protectedProcedure.input(z.object({
      obraId: z.number(),
      employeeId: z.number(),
      companyId: z.number(),
      funcaoNaObra: z.string().optional(),
      dataInicio: z.string().optional(),
      motivo: z.string().optional(),
    })).mutation(({ input, ctx }) => allocateEmployeeToObra({ ...input, registradoPor: ctx.user.name ?? 'Sistema', registradoPorUserId: ctx.user.id })),
    removeEmployee: protectedProcedure.input(z.object({ employeeId: z.number(), motivo: z.string().optional() })).mutation(({ input, ctx }) => removeEmployeeFromObra(input.employeeId, input.motivo, ctx.user.name ?? 'Sistema', ctx.user.id)),
    // Histórico de alocações de um funcionário
    employeeHistory: protectedProcedure.input(z.object({ employeeId: z.number() })).query(({ input }) => getEmployeeSiteHistory(input.employeeId)),
    // Efetivo atual por obra
    efetivoPorObra: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getEfetivoPorObra(input.companyId)),
    // Efetivo histórico (evolução mensal)
    efetivoHistorico: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), meses: z.number().optional() })).query(({ input }) => getEfetivoHistorico(input.companyId, input.meses)),
    // Funcionários sem obra
    semObra: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getFuncionariosSemObra(input.companyId)),
    equipeObra: protectedProcedure.input(z.object({ obraId: z.number(), companyId: z.number() })).query(({ input }) => getEquipeObra(input.obraId, input.companyId)),
    efetivoDashMensal: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesRef: z.string() })).query(({ input }) => getEfetivoDashboardMensal(input.companyId, input.mesRef)),
    // Transferência em lote
    transferirEmLote: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraDestinoId: z.number(),
      employeeIds: z.array(z.number()),
      dataInicio: z.string(),
      motivo: z.string().optional(),
    })).mutation(({ input, ctx }) => transferirFuncionariosEmLote({ ...input, registradoPor: ctx.user.name ?? 'Sistema', registradoPorUserId: ctx.user.id })),
    // Rateio de horas
    horasRateio: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesAno: z.string(),
      obraId: z.number().optional(),
    })).query(({ input }) => getObraHorasRateio(input.companyId, input.mesAno, input.obraId)),
    // ============================================================
    // SNs (Relógios de Ponto) por Obra
    // ============================================================
    listSns: protectedProcedure.input(z.object({ obraId: z.number() })).query(({ input }) => getObraSns(input.obraId)),
    listSnsByCompany: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getObraSnsByCompany(input.companyId)),
    listActiveSns: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getActiveSnsByCompany(input.companyId)),
    listAvailableSns: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getAvailableSns(input.companyId)),
    checkSnAvailability: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), sn: z.string().min(1),
      excludeObraId: z.number().optional(),
    })).query(({ input }) => checkSnAvailability(input.companyId, input.sn, input.excludeObraId)),
    addSn: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional(),
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
    // ============================================================
    // INCONSISTÊNCIAS PONTO x OBRA
    // ============================================================
    inconsistencias: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getInconsistenciasPendentes(input.companyId)),
    inconsistenciasCount: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => countInconsistenciasPendentes(input.companyId)),
    resolverEsporadico: protectedProcedure.input(z.object({ id: z.number(), observacoes: z.string().optional() })).mutation(({ input, ctx }) => resolverInconsistenciaEsporadico(input.id, ctx.user.id, ctx.user.name ?? 'Sistema', input.observacoes)),
    resolverTransferir: protectedProcedure.input(z.object({ id: z.number(), observacoes: z.string().optional() })).mutation(({ input, ctx }) => resolverInconsistenciaTransferir(input.id, ctx.user.id, ctx.user.name ?? 'Sistema', input.observacoes)),
    ondeTrabalhou: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(), mesAno: z.string() })).query(({ input }) => getOndeTrabalhouNoMes(input.companyId, input.employeeId, input.mesAno)),
  }),

  // ============================================================
  // LOGIN COM SENHA & GERENCIAMENTO DE USUÁRIOS
  // ============================================================
  userManagement: router({
    listUsers: protectedProcedure.query(async () => {
      const allUsers = await getAllUsers();
      // Buscar vínculos de empresa para cada usuário
      const usersWithCompanies = await Promise.all(allUsers.map(async (u: any) => {
        const links = await getUserCompanyLinks(u.id);
        return { ...u, password: undefined, companyIds: links.map((l: any) => l.companyId) };
      }));
      return usersWithCompanies;
    }),
    // Listar vínculos de empresa de um usuário
    getUserCompanies: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      const links = await getUserCompanyLinks(input.userId);
      return links.map((l: any) => l.companyId);
    }),
    // Definir empresas que um usuário pode acessar
    setUserCompanies: protectedProcedure.input(z.object({
      userId: z.number(),
      companyIds: z.array(z.number()),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar acesso a empresas' });
      }
      await setUserCompanies(input.userId, input.companyIds);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_companies', entityId: input.userId, details: `Empresas do usuário atualizadas: [${input.companyIds.join(', ')}]` });
      return { success: true };
    }),
    // Listar permissões granulares de um usuário
    getUserPermissions: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      const perms = await getUserPermissions(input.userId);
      return perms.map((p: any) => ({ moduleId: p.moduleId, featureKey: p.featureKey, canAccess: !!p.canAccess }));
    }),
    // Definir permissões granulares de um usuário
    setUserPermissions: protectedProcedure.input(z.object({
      userId: z.number(),
      permissions: z.array(z.object({
        moduleId: z.string(),
        featureKey: z.string(),
        canAccess: z.boolean(),
      })),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar permissões' });
      }
      await setUserPermissions(input.userId, input.permissions);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_permissions', entityId: input.userId, details: `Permissões do usuário atualizadas: ${input.permissions.filter(p => p.canAccess).length} funcionalidades habilitadas` });
      return { success: true };
    }),
    // Obter permissões do usuário logado (para sidebar/frontend)
    getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
      // Admin Master tem acesso total
      if (ctx.user.role === 'admin_master') {
        return { isAdminMaster: true, permissions: [], groupPermissions: null };
      }
      const perms = await getUserPermissions(ctx.user.id);
      // Buscar permissões de grupo do usuário
      const groupPerms = await getUserEffectiveGroupPermissions(ctx.user.id);
      return {
        isAdminMaster: false,
        permissions: perms.map((p: any) => ({ moduleId: p.moduleId, featureKey: p.featureKey, canAccess: !!p.canAccess })),
        groupPermissions: groupPerms.groups.length > 0 ? {
          groups: groupPerms.groups,
          routes: groupPerms.permissions.map((p: any) => ({
            rota: p.rota,
            canView: !!p.canView,
            canEdit: !!p.canEdit,
            canCreate: !!p.canCreate,
            canDelete: !!p.canDelete,
            ocultarValores: !!p.ocultarValores,
            ocultarDocumentos: !!p.ocultarDocumentos,
          })),
          somenteVisualizacao: groupPerms.somenteVisualizacao,
          ocultarDadosSensiveis: groupPerms.ocultarDadosSensiveis,
        } : null,
      };
    }),
    createLocalUser: protectedProcedure.input(z.object({
      username: z.string().min(3),
      name: z.string().min(1),
      email: z.string().email().optional(),
      role: z.enum(["user", "admin", "admin_master"]).default("user"),
      password: z.string().optional(),
      companyIds: z.array(z.number()).optional(),
    })).mutation(async ({ input }) => {
      const bcrypt = await import("bcryptjs");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select().from(users).where(eq(users.username, input.username));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Username já existe" });
      const defaultPwd = input.password || "asdf1020";
      const hashed = bcrypt.hashSync(defaultPwd, 10);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await db.insert(users).values({
        openId, name: input.name, email: input.email || null,
        username: input.username, password: hashed,
        mustChangePassword: 1, loginMethod: "local", role: input.role,
      });
      const newUserId = Number(result[0].insertId);
      // Se companyIds foram passados, vincular o usuário às empresas
      if (input.companyIds && input.companyIds.length > 0) {
        await setUserCompanies(newUserId, input.companyIds);
      }
      return { id: newUserId, username: input.username, defaultPassword: defaultPwd };
    }),
    loginLocal: publicProcedure.input(z.object({
      username: z.string(), password: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const bcrypt = await import("bcryptjs");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq, or, sql } = await import("drizzle-orm");
      const loginInput = input.username.trim();
      // Buscar por username OU email (case-insensitive)
      const results = await db.select().from(users).where(
        or(
          sql`LOWER(${users.username}) = LOWER(${loginInput})`,
          sql`LOWER(${users.email}) = LOWER(${loginInput})`
        )
      );
      // Priorizar usuário com loginMethod = 'local' e senha definida
      let user = results.find(u => u.loginMethod === 'local' && u.password) || results.find(u => u.password) || results[0];
      if (!user || !user.password) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      const valid = bcrypt.compareSync(input.password, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      // Usar o SDK para gerar o token no formato correto (openId, appId, name)
      const { sdk } = await import("./_core/sdk");
      const token = await sdk.createSessionToken(user.openId, { expiresInMs: 7 * 24 * 60 * 60 * 1000, name: user.name || "" });
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
      const defaultPwd = "asdf1020";
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
        // Admin Master pode definir qualquer perfil; Admin pode definir user ou admin (não admin_master)
        if (ctx.user.role === "admin_master") {
          updateData.role = input.role;
        } else if (ctx.user.role === "admin") {
          if (input.role === "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode promover para Admin Master" });
          updateData.role = input.role;
        } else {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para alterar perfil" });
        }
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
        contratos_pj: ["pj_payments", "pj_contracts"],
        cipa: ["cipa_members", "cipa_meetings", "cipa_elections"],
        epis: ["epi_deliveries", "epis"],
        equipamentos: ["equipment"],
        veiculos: ["vehicles"],
        extintores: ["extinguishers"],
        hidrantes: ["hydrants"],
        riscos: ["chemicals", "risks"],
        dds: ["dds"],
        desvios: ["deviations"],
        planos_acao: ["action_plans"],
        ferias: ["vacation_periods"],
        seguros: ["insurance_alerts_log", "insurance_alert_recipients", "insurance_alert_config"],
        auditoria: ["audit_logs", "audits"],
        templates: ["document_templates", "email_templates", "termination_notices"],
        criterios: ["system_criteria"],
        notificacoes: ["notification_logs", "notification_recipients"],
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
    getAll: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(systemCriteria)
        .where(companyFilter(systemCriteria.companyId, input))
        .orderBy(systemCriteria.categoria, systemCriteria.chave);
      return rows;
    }),

    getByCategory: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), categoria: z.string(),
    })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db.select().from(systemCriteria)
        .where(and(
          companyFilter(systemCriteria.companyId, input),
          eq(systemCriteria.categoria, input.categoria)
        ));
      return rows;
    }),

    updateBatch: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), criterios: z.array(z.object({
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
            companyFilter(systemCriteria.companyId, input),
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

    resetToDefault: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), categoria: z.string(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode restaurar padrões" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db.select().from(systemCriteria)
        .where(and(
          companyFilter(systemCriteria.companyId, input),
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

    initDefaults: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select().from(systemCriteria)
        .where(companyFilter(systemCriteria.companyId, input));
      // Get existing chaves to avoid duplicates
      const existingChaves = new Set(existing.map((e: any) => e.chave));

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
        // ATESTADOS
        { categoria: "atestados", chave: "atestado_motivo_obrigatorio", valor: "1", descricao: "Motivo do atestado obrigatório (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        // EPIs / SEGURANÇA
        { categoria: "epi", chave: "epi_bdi_percentual", valor: "40", descricao: "Percentual de BDI sobre custo do EPI para cobrança por perda/mau uso", valorPadraoClt: "40", unidade: "%" },
        { categoria: "epi", chave: "epi_cobranca_perda", valor: "1", descricao: "Cobrar EPI em caso de perda (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "epi", chave: "epi_cobranca_mau_uso", valor: "1", descricao: "Cobrar EPI em caso de mau uso/dano (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "epi", chave: "epi_cobranca_furto", valor: "1", descricao: "Cobrar EPI em caso de furto/extravio (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "epi", chave: "epi_foto_obrigatoria_troca", valor: "1", descricao: "Foto obrigatória para troca por mau uso/dano (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        // VALE - Regra dia 10
        { categoria: "folha", chave: "folha_vale_corte_dia", valor: "10", descricao: "Admitidos após este dia não recebem vale no mês (0=desativado)", valorPadraoClt: "10", unidade: "dia" },
        { categoria: "folha", chave: "folha_vale_proporcional", valor: "0", descricao: "Vale proporcional para admitidos após corte (0=Não recebe, 1=Proporcional)", valorPadraoClt: "0", unidade: "bool" },
        // DIFERENÇAS SALARIAIS
        { categoria: "folha", chave: "folha_alerta_diferenca_salarial", valor: "1", descricao: "Alertar diferenças salariais entre sistema e contabilidade (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "folha", chave: "folha_tolerancia_diferenca_centavos", valor: "50", descricao: "Tolerância em centavos para diferenças salariais", valorPadraoClt: "50", unidade: "centavos" },
        // ADVERTÊNCIAS PONTO
        { categoria: "ponto", chave: "ponto_adv_atrasos_mes", valor: "3", descricao: "Qtd atrasos/mês para sugerir advertência", valorPadraoClt: "3", unidade: "qtd" },
        { categoria: "ponto", chave: "ponto_adv_faltas_mes", valor: "2", descricao: "Qtd faltas injustificadas/mês para sugerir advertência", valorPadraoClt: "2", unidade: "qtd" },
        { categoria: "ponto", chave: "ponto_adv_he_nao_autorizada", valor: "1", descricao: "Sugerir advertência para HE não autorizada (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        // RECONTRATAÇÃO
        { categoria: "cadastro", chave: "cadastro_permitir_recontratacao", valor: "1", descricao: "Permitir recontratação de funcionário desligado com mesmo CPF (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "cadastro", chave: "cadastro_recontratacao_carencia_dias", valor: "90", descricao: "Carência mínima em dias para recontratação", valorPadraoClt: "90", unidade: "dias" },
        // TERCEIROS
        { categoria: "terceiros", chave: "terceiros_prazo_docs_dias", valor: "10", descricao: "Prazo em dias para envio de documentos mensais", valorPadraoClt: "10", unidade: "dias" },
        { categoria: "terceiros", chave: "terceiros_alerta_vencimento_dias", valor: "10", descricao: "Dias antes do vencimento para enviar alerta", valorPadraoClt: "10", unidade: "dias" },
        { categoria: "terceiros", chave: "terceiros_alerta_segundo_dias", valor: "5", descricao: "Dias antes do vencimento para segundo alerta", valorPadraoClt: "5", unidade: "dias" },
        { categoria: "terceiros", chave: "terceiros_bloquear_medicao_pendencia", valor: "1", descricao: "Bloquear medição se há documentos pendentes (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "terceiros", chave: "terceiros_exigir_cnd", valor: "1", descricao: "Exigir CND para liberação de medição (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "terceiros", chave: "terceiros_exigir_fgts", valor: "1", descricao: "Exigir comprovante FGTS mensal (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "terceiros", chave: "terceiros_exigir_inss", valor: "1", descricao: "Exigir comprovante INSS mensal (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "terceiros", chave: "terceiros_exigir_folha", valor: "1", descricao: "Exigir folha de pagamento mensal (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "terceiros", chave: "terceiros_validacao_ia_auto", valor: "0", descricao: "Validar documentos automaticamente com IA ao receber (0=Não, 1=Sim)", valorPadraoClt: "0", unidade: "bool" },
        { categoria: "terceiros", chave: "terceiros_portal_expiracao_link_dias", valor: "30", descricao: "Dias de validade do link do portal externo", valorPadraoClt: "30", unidade: "dias" },
        // PARCEIROS CONVENIADOS
        { categoria: "parceiros", chave: "parceiros_limite_desconto_folha_pct", valor: "30", descricao: "Limite máximo de desconto em folha por convênios (%)", valorPadraoClt: "30", unidade: "%" },
        { categoria: "parceiros", chave: "parceiros_aprovacao_obrigatoria", valor: "1", descricao: "Exigir aprovação do RH para lançamentos (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "parceiros", chave: "parceiros_prazo_fechamento_dia", valor: "25", descricao: "Dia do mês para fechamento dos lançamentos", valorPadraoClt: "25", unidade: "dia" },
        { categoria: "parceiros", chave: "parceiros_prazo_pagamento_dias", valor: "30", descricao: "Prazo em dias para pagamento ao parceiro após fechamento", valorPadraoClt: "30", unidade: "dias" },
        { categoria: "parceiros", chave: "parceiros_comprovante_obrigatorio", valor: "1", descricao: "Exigir comprovante/nota fiscal do parceiro (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "parceiros", chave: "parceiros_portal_expiracao_link_dias", valor: "30", descricao: "Dias de validade do link do portal do parceiro", valorPadraoClt: "30", unidade: "dias" },
        // JURÍDICO TRABALHISTA
        { categoria: "juridico", chave: "juridico_provisao_automatica", valor: "1", descricao: "Calcular provisão automaticamente ao cadastrar processo (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "juridico", chave: "juridico_alerta_audiencia_dias", valor: "7", descricao: "Dias antes da audiência para enviar alerta", valorPadraoClt: "7", unidade: "dias" },
        { categoria: "juridico", chave: "juridico_alerta_prazo_dias", valor: "5", descricao: "Dias antes do prazo judicial para enviar alerta", valorPadraoClt: "5", unidade: "dias" },
        { categoria: "juridico", chave: "juridico_risco_alto_provisao_pct", valor: "100", descricao: "Percentual de provisão para risco ALTO (%)", valorPadraoClt: "100", unidade: "%" },
        { categoria: "juridico", chave: "juridico_risco_medio_provisao_pct", valor: "50", descricao: "Percentual de provisão para risco MÉDIO (%)", valorPadraoClt: "50", unidade: "%" },
        { categoria: "juridico", chave: "juridico_risco_baixo_provisao_pct", valor: "25", descricao: "Percentual de provisão para risco BAIXO (%)", valorPadraoClt: "25", unidade: "%" },
        // SST - SEGURANÇA E SAÚDE DO TRABALHO
        { categoria: "sst", chave: "sst_aso_alerta_vencimento_dias", valor: "30", descricao: "Dias antes do vencimento do ASO para alertar", valorPadraoClt: "30", unidade: "dias" },
        { categoria: "sst", chave: "sst_treinamento_alerta_vencimento_dias", valor: "30", descricao: "Dias antes do vencimento do treinamento para alertar", valorPadraoClt: "30", unidade: "dias" },
        { categoria: "sst", chave: "sst_ca_alerta_vencimento_dias", valor: "60", descricao: "Dias antes do vencimento do CA para alertar", valorPadraoClt: "60", unidade: "dias" },
        { categoria: "sst", chave: "sst_estoque_minimo_epi", valor: "5", descricao: "Quantidade mínima de estoque para alerta de EPI", valorPadraoClt: "5", unidade: "qtd" },
        { categoria: "sst", chave: "sst_bloquear_obra_sem_aso", valor: "0", descricao: "Bloquear alocação em obra sem ASO válido (0=Não, 1=Sim)", valorPadraoClt: "0", unidade: "bool" },
        { categoria: "sst", chave: "sst_cipa_renovacao_alerta_dias", valor: "60", descricao: "Dias antes do fim do mandato CIPA para alertar renovação", valorPadraoClt: "60", unidade: "dias" },
        // AVALIAÇÃO DE DESEMPENHO
        { categoria: "avaliacao", chave: "avaliacao_nota_minima_aprovacao", valor: "6", descricao: "Nota mínima para aprovação na avaliação (0-10)", valorPadraoClt: "6", unidade: "nota" },
        { categoria: "avaliacao", chave: "avaliacao_ciclo_padrao_meses", valor: "3", descricao: "Intervalo padrão entre ciclos de avaliação (meses)", valorPadraoClt: "3", unidade: "meses" },
        { categoria: "avaliacao", chave: "avaliacao_autoavaliacao", valor: "1", descricao: "Permitir autoavaliação do colaborador (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "avaliacao", chave: "avaliacao_peso_pilar1", valor: "33.33", descricao: "Peso do Pilar 1 - Postura e Disciplina (%)", valorPadraoClt: "33.33", unidade: "%" },
        { categoria: "avaliacao", chave: "avaliacao_peso_pilar2", valor: "33.33", descricao: "Peso do Pilar 2 - Desempenho Técnico (%)", valorPadraoClt: "33.33", unidade: "%" },
        { categoria: "avaliacao", chave: "avaliacao_peso_pilar3", valor: "33.34", descricao: "Peso do Pilar 3 - Atitude e Crescimento (%)", valorPadraoClt: "33.34", unidade: "%" },
        { categoria: "avaliacao", chave: "avaliacao_clima_anonimo", valor: "1", descricao: "Pesquisa de clima anônima por padrão (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        // CRACHÁS
        { categoria: "crachas", chave: "crachas_cor_clt", valor: "#1B4F72", descricao: "Cor do crachá para funcionários CLT (hex)", valorPadraoClt: "#1B4F72", unidade: "cor" },
        { categoria: "crachas", chave: "crachas_cor_pj", valor: "#196F3D", descricao: "Cor do crachá para PJ (hex)", valorPadraoClt: "#196F3D", unidade: "cor" },
        { categoria: "crachas", chave: "crachas_cor_terceiro", valor: "#D35400", descricao: "Cor do crachá para terceiros (hex)", valorPadraoClt: "#D35400", unidade: "cor" },
        { categoria: "crachas", chave: "crachas_validade_dias", valor: "365", descricao: "Validade do crachá em dias", valorPadraoClt: "365", unidade: "dias" },
        { categoria: "crachas", chave: "crachas_qrcode_dados", valor: "nome,cpf,funcao,empresa", descricao: "Dados incluídos no QR Code (separados por vírgula)", valorPadraoClt: "nome,cpf,funcao,empresa", unidade: "lista" },
        // NOTIFICAÇÕES E ALERTAS GERAIS
        { categoria: "notificacoes", chave: "notif_email_ativo", valor: "1", descricao: "Enviar notificações por e-mail (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "notificacoes", chave: "notif_resumo_diario", valor: "1", descricao: "Enviar resumo diário ao administrador (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
        { categoria: "notificacoes", chave: "notif_horario_envio", valor: "08:00", descricao: "Horário padrão para envio de notificações", valorPadraoClt: "08:00", unidade: "hora" },
        // CONFERÊNCIA COM CONTABILIDADE
        { categoria: "folha", chave: "folha_conferencia_contabilidade", valor: "recomendada", descricao: "Conferência com contabilidade antes de consolidar pagamento (obrigatoria, recomendada, opcional)", valorPadraoClt: "recomendada", unidade: "opcao" },
        // CONVENÇÃO COLETIVA
        { categoria: "convencao", chave: "convencao_alerta_vencimento_dias", valor: "60", descricao: "Dias antes do vencimento da convenção para alertar", valorPadraoClt: "60", unidade: "dias" },
        { categoria: "convencao", chave: "convencao_aplicar_local_sobre_matriz", valor: "1", descricao: "Aplicar convenção local quando mais vantajosa que a matriz (0=Não, 1=Sim)", valorPadraoClt: "1", unidade: "bool" },
      ];

      const toInsert = defaults.filter(d => !existingChaves.has(d.chave));
      for (const d of toInsert) {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          ...d,
          atualizadoPor: ctx.user.name ?? "Sistema",
        });
      }

      if (toInsert.length > 0) {
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "configuracoes", entityType: "criterios", entityId: input.companyId, details: `Critérios padrão CLT inicializados (${toInsert.length} novos itens)` });
      }
      return { success: true, message: toInsert.length > 0 ? "Critérios padrão inicializados" : "Critérios já atualizados", created: toInsert.length };
    }),

    // Listar funcionários com HE diferente dos critérios da empresa
    listHEDivergentes: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return { criterios: { heDiasUteis: '50', heDomingosFeriados: '100', heAdicionalNoturno: '20' }, funcionarios: [] };
      const { systemCriteria, employees } = await import("../drizzle/schema");
      const { eq, and, isNull } = await import("drizzle-orm");

      // Buscar critérios HE da empresa
      const criteriaRows = await db.select().from(systemCriteria)
        .where(and(companyFilter(systemCriteria.companyId, input), eq(systemCriteria.categoria, 'horas_extras')));
      const map = new Map(criteriaRows.map(c => [c.chave, c.valor]));
      const criterios = {
        heDiasUteis: map.get('he_dias_uteis') || '50',
        heDomingosFeriados: map.get('he_domingos_feriados') || '100',
        heAdicionalNoturno: map.get('he_adicional_noturno') || '20',
      };

      // Buscar funcionários ativos sem acordo individual que têm valores diferentes
      const allEmps = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        setor: employees.setor,
        acordoHoraExtra: employees.acordoHoraExtra,
        heNormal50: employees.heNormal50,
        he100: employees.he100,
        heNoturna: employees.heNoturna,
      }).from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          isNull(employees.deletedAt)
        ));

      const divergentes = allEmps.filter(emp => {
        // Pular quem tem acordo individual
        if (emp.acordoHoraExtra === 1) return false;
        const empHE = emp.heNormal50 || '50';
        const empHEDom = emp.he100 || '100';
        const empHENot = emp.heNoturna || '20';
        return empHE !== criterios.heDiasUteis || empHEDom !== criterios.heDomingosFeriados || empHENot !== criterios.heAdicionalNoturno;
      }).map(emp => ({
        id: emp.id,
        nomeCompleto: emp.nomeCompleto,
        cpf: emp.cpf,
        funcao: emp.funcao,
        setor: emp.setor,
        acordoHoraExtra: emp.acordoHoraExtra,
        heAtual: { diasUteis: emp.heNormal50 || '50', domingosFeriados: emp.he100 || '100', adicionalNoturno: emp.heNoturna || '20' },
      }));

      return { criterios, funcionarios: divergentes };
    }),

    // Sincronizar HE de funcionários selecionados com critérios da empresa
    syncHE: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeIds: z.array(z.number()),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode sincronizar" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { systemCriteria, employees } = await import("../drizzle/schema");
      const { eq, and, inArray } = await import("drizzle-orm");

      // Buscar critérios HE da empresa
      const criteriaRows = await db.select().from(systemCriteria)
        .where(and(companyFilter(systemCriteria.companyId, input), eq(systemCriteria.categoria, 'horas_extras')));
      const map = new Map(criteriaRows.map(c => [c.chave, c.valor]));
      const heDiasUteis = map.get('he_dias_uteis') || '50';
      const heDomingosFeriados = map.get('he_domingos_feriados') || '100';
      const heAdicionalNoturno = map.get('he_adicional_noturno') || '20';

      // Atualizar em lote
      let updated = 0;
      for (const empId of input.employeeIds) {
        await db.update(employees).set({
          heNormal50: heDiasUteis,
          he100: heDomingosFeriados,
          heNoturna: heAdicionalNoturno,
        }).where(and(eq(employees.id, empId), companyFilter(employees.companyId, input)));
        updated++;
      }

      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "sync_he", entityId: input.companyId, details: `Sincronizado HE de ${updated} funcionário(s) com critérios da empresa: ${heDiasUteis}%/${heDomingosFeriados}%/${heAdicionalNoturno}%` });
      return { success: true, updated };
    }),
  }),

  avisoPrevio: avisoPrevioFeriasRouter,
  cipa: cipaRouter,
  pj: pjContractsRouter,
  feriados: feriadosRouter,
  employeeDocuments: employeeDocumentsRouter,
  pjMedicoes: pjMedicoesRouter,
  dissidio: dissidioRouter,
  sindical: sindicalRouter,
  datajudAutoCheck: datajudAutoCheckRouter,
  valeAlimentacao: valeAlimentacaoRouter,
  // ============================================================
  // LIXEIRA (TRASH) - Listar e restaurar itens excluídos
  // ============================================================
  trash: router({
    // Listar todos os itens excluídos de todas as entidades
    listAll: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input }) => {
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
      const delEmployees = await db.select().from(employees).where(and(companyFilter(employees.companyId, input), isNotNull(employees.deletedAt)));
      delEmployees.forEach((e: any) => items.push({ id: e.id, entity: 'employee', label: e.nomeCompleto || e.cpf, deletedAt: e.deletedAt, deletedBy: e.deletedBy }));

      // Obras excluídas
      const delObras = await db.select().from(obras).where(and(companyFilter(obras.companyId, input), isNotNull(obras.deletedAt)));
      delObras.forEach((o: any) => items.push({ id: o.id, entity: 'obra', label: o.nome, deletedAt: o.deletedAt, deletedBy: o.deletedBy }));

      // Setores excluídos
      const delSectors = await db.select().from(sectors).where(and(companyFilter(sectors.companyId, input), isNotNull(sectors.deletedAt)));
      delSectors.forEach((s: any) => items.push({ id: s.id, entity: 'sector', label: s.nome, deletedAt: s.deletedAt, deletedBy: s.deletedBy }));

      // Funções excluídas
      const delFunctions = await db.select().from(jobFunctions).where(and(companyFilter(jobFunctions.companyId, input), isNotNull(jobFunctions.deletedAt)));
      delFunctions.forEach((f: any) => items.push({ id: f.id, entity: 'jobFunction', label: f.nome, deletedAt: f.deletedAt, deletedBy: f.deletedBy }));

      // Relógios de ponto excluídos
      const delDevices = await db.select().from(dixiDevices).where(and(companyFilter(dixiDevices.companyId, input), isNotNull(dixiDevices.deletedAt)));
      delDevices.forEach((d: any) => items.push({ id: d.id, entity: 'dixiDevice', label: d.nome || d.serialNumber, deletedAt: d.deletedAt, deletedBy: d.deletedBy }));

      // ASOs excluídos
      const delAsos = await db.select().from(asos).where(and(companyFilter(asos.companyId, input), isNotNull(asos.deletedAt)));
      delAsos.forEach((a: any) => items.push({ id: a.id, entity: 'aso', label: `ASO #${a.id} (Func. #${a.employeeId})`, deletedAt: a.deletedAt, deletedBy: a.deletedBy }));

      // Atestados excluídos
      const delAtestados = await db.select().from(atestados).where(and(companyFilter(atestados.companyId, input), isNotNull(atestados.deletedAt)));
      delAtestados.forEach((a: any) => items.push({ id: a.id, entity: 'atestado', label: `Atestado #${a.id} (Func. #${a.employeeId})`, deletedAt: a.deletedAt, deletedBy: a.deletedBy }));

      // Treinamentos excluídos
      const delTrainings = await db.select().from(trainings).where(and(companyFilter(trainings.companyId, input), isNotNull(trainings.deletedAt)));
      delTrainings.forEach((t: any) => items.push({ id: t.id, entity: 'training', label: `Treinamento #${t.id} — ${t.nome || ''}`, deletedAt: t.deletedAt, deletedBy: t.deletedBy }));

      // Advertências excluídas
      const delWarnings = await db.select().from(warnings).where(and(companyFilter(warnings.companyId, input), isNotNull(warnings.deletedAt)));
      delWarnings.forEach((w: any) => items.push({ id: w.id, entity: 'warning', label: `Advertência #${w.id} (Func. #${w.employeeId})`, deletedAt: w.deletedAt, deletedBy: w.deletedBy }));

      // Regras de ouro excluídas
      const delRules = await db.select().from(goldenRules).where(and(companyFilter(goldenRules.companyId, input), isNotNull(goldenRules.deletedAt)));
      delRules.forEach((r: any) => items.push({ id: r.id, entity: 'goldenRule', label: r.titulo, deletedAt: r.deletedAt, deletedBy: r.deletedBy }));

      // Modelos de documentos excluídos
      const delTemplates = await db.select().from(documentTemplates).where(and(companyFilter(documentTemplates.companyId, input), isNotNull(documentTemplates.deletedAt)));
      delTemplates.forEach((t: any) => items.push({ id: t.id, entity: 'documentTemplate', label: `Modelo: ${t.nome || t.tipo}`, deletedAt: t.deletedAt, deletedBy: t.deletedBy }));

      // Entregas de EPI excluídas
      const delEpiDeliveries = await db.select().from(epiDeliveries).where(and(companyFilter(epiDeliveries.companyId, input), isNotNull(epiDeliveries.deletedAt)));
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

  // ===================== CONTROLE DE REVISÕES =====================
  revisions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito ao Admin Master' });
      return getRevisions();
    }),
    latest: publicProcedure.query(async () => {
      return getLatestRevision();
    }),
    create: protectedProcedure.input(z.object({
      version: z.number(),
      titulo: z.string().min(1),
      descricao: z.string().min(1),
      tipo: z.enum(['feature', 'bugfix', 'melhoria', 'seguranca', 'performance']),
      modulos: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito ao Admin Master' });
      return createRevision({ ...input, criadoPor: ctx.user.name || 'Sistema' });
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito ao Admin Master' });
      await deleteRevision(input.id);
      return { success: true };
    }),
  }),
  // ===================== GRUPOS DE USUÁRIOS =====================
  userGroups: router({
    list: protectedProcedure.query(async () => {
      const groups = await listUserGroups();
      return groups.map((g: any) => ({
        ...g,
        ativo: !!g.ativo,
        somenteVisualizacao: !!g.somenteVisualizacao,
        ocultarDadosSensiveis: !!g.ocultarDadosSensiveis,
      }));
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const g = await getUserGroupById(input.id);
      if (!g) return null;
      return { ...g, ativo: !!g.ativo, somenteVisualizacao: !!g.somenteVisualizacao, ocultarDadosSensiveis: !!g.ocultarDadosSensiveis };
    }),
    create: protectedProcedure.input(z.object({
      nome: z.string().min(1),
      descricao: z.string().optional(),
      cor: z.string().optional(),
      icone: z.string().optional(),
      somenteVisualizacao: z.boolean().optional(),
      ocultarDadosSensiveis: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode criar grupos' });
      const result = await createUserGroup({
        nome: input.nome,
        descricao: input.descricao,
        cor: input.cor,
        icone: input.icone,
        somenteVisualizacao: input.somenteVisualizacao === false ? 0 : 1,
        ocultarDadosSensiveis: input.ocultarDadosSensiveis === false ? 0 : 1,
      });
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'CREATE', module: 'usuarios', entityType: 'user_group', entityId: result.id, details: `Grupo '${input.nome}' criado` });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      cor: z.string().optional(),
      icone: z.string().optional(),
      somenteVisualizacao: z.boolean().optional(),
      ocultarDadosSensiveis: z.boolean().optional(),
      ativo: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode editar grupos' });
      const updateData: any = {};
      if (input.nome !== undefined) updateData.nome = input.nome;
      if (input.descricao !== undefined) updateData.descricao = input.descricao;
      if (input.cor !== undefined) updateData.cor = input.cor;
      if (input.icone !== undefined) updateData.icone = input.icone;
      if (input.somenteVisualizacao !== undefined) updateData.somenteVisualizacao = input.somenteVisualizacao ? 1 : 0;
      if (input.ocultarDadosSensiveis !== undefined) updateData.ocultarDadosSensiveis = input.ocultarDadosSensiveis ? 1 : 0;
      if (input.ativo !== undefined) updateData.ativo = input.ativo ? 1 : 0;
      await updateUserGroup(input.id, updateData);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_group', entityId: input.id, details: `Grupo atualizado` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode excluir grupos' });
      await deleteUserGroup(input.id);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'DELETE', module: 'usuarios', entityType: 'user_group', entityId: input.id, details: `Grupo excluído` });
      return { success: true };
    }),
    // Permissões do grupo
    getPermissions: protectedProcedure.input(z.object({ groupId: z.number() })).query(async ({ input }) => {
      const perms = await getGroupPermissions(input.groupId);
      return perms.map((p: any) => ({
        rota: p.rota,
        canView: !!p.canView,
        canEdit: !!p.canEdit,
        canCreate: !!p.canCreate,
        canDelete: !!p.canDelete,
        ocultarValores: !!p.ocultarValores,
        ocultarDocumentos: !!p.ocultarDocumentos,
      }));
    }),
    setPermissions: protectedProcedure.input(z.object({
      groupId: z.number(),
      permissions: z.array(z.object({
        rota: z.string(),
        canView: z.boolean(),
        canEdit: z.boolean(),
        canCreate: z.boolean(),
        canDelete: z.boolean(),
        ocultarValores: z.boolean(),
        ocultarDocumentos: z.boolean(),
      })),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode configurar permissões de grupo' });
      await setGroupPermissions(input.groupId, input.permissions.map(p => ({
        rota: p.rota,
        canView: p.canView ? 1 : 0,
        canEdit: p.canEdit ? 1 : 0,
        canCreate: p.canCreate ? 1 : 0,
        canDelete: p.canDelete ? 1 : 0,
        ocultarValores: p.ocultarValores ? 1 : 0,
        ocultarDocumentos: p.ocultarDocumentos ? 1 : 0,
      })));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_group_permissions', entityId: input.groupId, details: `Permissões do grupo atualizadas: ${input.permissions.filter(p => p.canView).length} rotas habilitadas` });
      return { success: true };
    }),
    // Membros do grupo
    getMembers: protectedProcedure.input(z.object({ groupId: z.number() })).query(async ({ input }) => {
      return getGroupMembers(input.groupId);
    }),
    addMember: protectedProcedure.input(z.object({ groupId: z.number(), userId: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar membros de grupo' });
      await addUserToGroup(input.groupId, input.userId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'CREATE', module: 'usuarios', entityType: 'user_group_member', entityId: input.groupId, details: `Usuário ${input.userId} adicionado ao grupo` });
      return { success: true };
    }),
    removeMember: protectedProcedure.input(z.object({ groupId: z.number(), userId: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar membros de grupo' });
      await removeUserFromGroup(input.groupId, input.userId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'DELETE', module: 'usuarios', entityType: 'user_group_member', entityId: input.groupId, details: `Usuário ${input.userId} removido do grupo` });
      return { success: true };
    }),
    // Listar todos os membros de todos os grupos
    listAllMembers: protectedProcedure.query(async () => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`SELECT group_id as groupId, user_id as userId FROM user_group_members`);
      return (rows as any).rows || rows;
    }),
    // Grupos de um usuário
    getUserGroups: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      return getUserGroupMemberships(input.userId);
    }),
    setUserGroups: protectedProcedure.input(z.object({
      userId: z.number(),
      groupIds: z.array(z.number()),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar grupos de usuários' });
      await setUserGroups(input.userId, input.groupIds);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_groups', entityId: input.userId, details: `Grupos do usuário atualizados: [${input.groupIds.join(', ')}]` });
      return { success: true };
    }),
  }),
  // ===================== CONFIGURAÇÃO DE MÓDULOS =====================
  moduleConfig: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { moduleConfig } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(moduleConfig).where(companyFilter(moduleConfig.companyId, input));
      // Módulos padrão - todos habilitados por default
      const ALL_MODULES = ["rh", "sst", "juridico", "avaliacao", "terceiros", "parceiros"];
      const moduleMap: Record<string, any> = {};
      for (const row of rows) moduleMap[row.moduleKey] = row;
      return ALL_MODULES.map(key => ({
        moduleKey: key,
        enabled: moduleMap[key] ? moduleMap[key].enabled === 1 : true,
        id: moduleMap[key]?.id ?? null,
        updatedBy: moduleMap[key]?.updatedBy ?? null,
        updatedAt: moduleMap[key]?.updatedAt ?? null,
      }));
    }),
    toggle: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), moduleKey: z.string(),
      enabled: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin pode alterar módulos" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { moduleConfig } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const existing = await db.select().from(moduleConfig).where(
        and(companyFilter(moduleConfig.companyId, input), eq(moduleConfig.moduleKey, input.moduleKey))
      );
      if (existing.length > 0) {
        await db.update(moduleConfig).set({
          enabled: input.enabled ? 1 : 0,
          enabledAt: input.enabled ? new Date().toISOString().slice(0, 19).replace('T', ' ') : existing[0].enabledAt,
          disabledAt: !input.enabled ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          updatedBy: ctx.user.name ?? "Sistema",
        }).where(eq(moduleConfig.id, existing[0].id));
      } else {
        await db.insert(moduleConfig).values({
          companyId: input.companyId,
          moduleKey: input.moduleKey,
          enabled: input.enabled ? 1 : 0,
          enabledAt: input.enabled ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          disabledAt: !input.enabled ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          updatedBy: ctx.user.name ?? "Sistema",
        });
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "module_config", entityId: input.companyId, details: `Módulo ${input.moduleKey} ${input.enabled ? 'HABILITADO' : 'DESABILITADO'}` });
      return { success: true };
    }),
  }),

    // ============================================================
    // IMPORTAÇÃO DE DADOS (Manus)
    // ============================================================
    importData: router({
      getAvailableTables: protectedProcedure.query(async () => {
              return getAvailableTables();
      }),
      getTableStructure: protectedProcedure
        .input(z.object({ tableName: z.string() }))
        .query(async ({ input }) => {
                  return getTableStructure(input.tableName);
        }),
      importTable: protectedProcedure
        .input(z.object({
                  tableName: z.string(),
                  columns: z.array(z.string()),
                  rows: z.array(z.array(z.any())),
                  mode: z.enum(["insert", "upsert", "replace"]).default("insert"),
        }))
        .mutation(async ({ input }) => {
                  return importTableData({ tableName: input.tableName, columns: input.columns, rows: input.rows }, input.mode);
        }),
}),
});
export type AppRouter = typeof appRouter;
