import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { memCache, TTL } from "./services/memCache";
import { fechamentoPontoRouter } from "./routers/fechamentoPonto";
import { syncEmployeeStatus } from "./services/statusSyncJob";
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
  checkDuplicateCpf, checkDuplicateCpfCrossCompanyGroup, checkBlacklist, getBlacklistedEmployees,
  // Obras
  createObra, getObras, getObraById, updateObra, deleteObra, restoreObra, getObrasByCompanyActive,
  getObraFuncionarios, allocateEmployeeToObra, removeEmployeeFromObra, getObraHorasRateio, checkEmployeeAllocations,
  getEquipeObra, getEfetivoDashboardMensal,
  getEmployeeSiteHistory, getEfetivoPorObra, getEfetivoHistorico, getFuncionariosSemObra, getIntegracoesNrsPorFuncionario, transferirFuncionariosEmLote,
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
  getEffectiveAllowedObraIds, userCanSeeAvisoStatus,
  listTrashEntries, getTrashEntry, markTrashEntryRestored, deleteTrashEntry, reinsertSnapshot,
} from "./db";
import { DEFAULT_PERMISSIONS, MODULE_KEYS, EMPLOYEE_STATUS_DESLIGADOS } from "../shared/modules";
import { getDb, encerrarContratosPjDoFuncionario } from "./db";
import { normalizeCidadeInput } from "../shared/normalizeCidade";
import { obraSns, employees, blacklistReactivationRequests, companies, employeeSiteHistory, employeeTerminationChecklist, asos, trainings, sstIntegracaoRegistros, employeeIntegrations, contractCounters, almoxarifadoItens, obraFuncionarios, obraClientes, clientes, terminationNotices, gestorSubstituicaoSolicitacoes, users } from "../drizzle/schema";
import { calcularRescisaoCompleta, calcularAnosServico } from "./utils/rescisaoCalc";
import { getIncluirMultaFgts } from "./utils/rescisaoMultaCfg";
import { diasFeriasNoMesDaSaida } from "./routers/avisoPrevioFerias";
import { eq, and, sql, or, ilike, isNull, inArray, desc } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "./companyHelper";
import type { ProfileType } from "../shared/modules";
import { dashboardsRouter } from "./routers/dashboards";
import { oraculoRouter } from "./routers/oraculo";
import { validateCNPJ } from "../shared/cnpj";
import { TRPCError } from "@trpc/server";
import { importExcelRouter } from "./routers/importExcel";
import { payrollParsersRouter } from "./routers/payrollParsers";
import { folhaPagamentoRouter } from "./routers/folhaPagamento";
import { encargosSociaisRouter } from "./routers/encargosSociais";
import { controleDocumentosRouter } from "./routers/controleDocumentos";
import { getAvailableTables, getTableStructure, importTableData } from "./routers/importData";
import { processosTrabRouter } from "./routers/processosTrabalhistas";
import { processosTributariosRouter } from "./routers/processosTributarios";
import { processosCivisRouter } from "./routers/processosCivis";
import { homeDataRouter } from "./routers/homeData";
import { episRouter } from "./routers/epis";
import { faceRecognitionRouter } from "./routers/faceRecognition";
import { menuConfigRouter } from "./routers/menuConfig";
import { menuLayoutRouter } from "./routers/menuLayout";
import { goldenRulesRouter } from "./routers/goldenRules";
import { visaoPanoramicaRouter } from "./routers/visaoPanoramica";
import { datajudAutoCheckRouter, startAutoCheckJob } from "./routers/datajudAutoCheck";
import { valeAlimentacaoRouter } from "./routers/valeAlimentacao";
import { notificationsRouter } from "./routers/notifications";
import { recontratacaoRouter } from "./routers/recontratacao";
import { avisoPrevioFeriasRouter } from "./routers/avisoPrevioFerias";
import { cipaRouter } from "./routers/cipa";
import { pjContractsRouter } from "./routers/pjContracts";
import { insuranceRouter } from "./routers/insurance";
import { dixiPontoRouter } from "./routers/dixiPonto";
import { heSolicitacoesRouter } from "./routers/heSolicitacoes";
import { financialRouter } from "./routers/financial";
import { bankStatementTemplatesRouter } from "./routers/bankStatementTemplates";
import { chequesRouter } from "./routers/cheques";
import { chequesRecebidosRouter } from "./routers/chequesRecebidos";
import { cartaoRouter } from "./routers/cartao";
import { pontoDescontosRouter } from "./routers/pontoDescontos";
import { feriadosRouter } from "./routers/feriados";
import { comunicadosInternosRouter } from "./routers/comunicadosInternos";
import { curriculosRouter } from "./routers/curriculos";
import { employeeDocumentsRouter } from "./routers/employeeDocuments";
import { pjMedicoesRouter } from "./routers/pjMedicoes";
import { pjConformidadeRouter } from "./routers/pjConformidade";
import { dissidioRouter } from "./routers/dissidio";
import { convencaoIARouter } from "./routers/convencaoIA";
import { sindicalRouter } from "./routers/sindical";
import { seguroVidaRouter } from "./routers/seguroVida";
import { avaliacaoRouter } from "./routers/avaliacao";
import { orcamentistaRouter } from "./routers/orcamentista";
import { iaModulosRouter } from "./routers/iaModulos";
import { sprint1Router } from "./routers/sprint1Foundation";
import { medicosClinicasRouter } from "./routers/medicosClinicas";
import { terceirosRouter } from "./routers/terceiros";
import { terceiroContratosRouter } from "./routers/terceiroContratos";
import { parceirosRouter } from "./routers/parceiros";
import { portalExternoRouter } from "./routers/portalExterno";
import { coletaRhRouter } from "./routers/coletaRh";
import { payrollEngineRouter } from "./routers/payrollEngine";
import { horasExtrasRouter } from "./routers/horasExtras";
import { fieldNotesRouter } from "./routers/fieldNotes";
import { epiAvancadoRouter } from "./routers/epiAvancado";
import { backupRouter } from "./routers/backup";
import { migrationRouter } from "./routers/migration";
import { billingRouter } from "./routers/billing";
import { saasAdminRouter } from "./routers/saasAdmin";
import { contractsRouter } from "./routers/contracts";
import { skillsRouter } from "./routers/skills";
import { orcamentoRouter } from "./routers/orcamento";
import { planejamentoRouter } from "./routers/planejamento";
import { bimRouter } from "./routers/bim";
import { medicaoRouter } from "./routers/medicao";
import { iaCronogramaRouter } from "./routers/iaCronograma";
import { aiConfigRouter } from "./routers/aiConfig";
import { medicaoConfigRouter } from "./routers/medicaoConfig";
import { comprasRouter } from "./routers/compras";
import { purchaseRouter } from "./routers/purchaseRouter";
import { warehouseRouter } from "./routers/warehouse";
import { auditoriaAlmoxarifadoRouter } from "./routers/auditoriaAlmoxarifado";
import { equipamentosRouter } from "./routers/equipamentos";
import { ferramentasTerceirosRouter } from "./routers/ferramentasTerceiros";
import { clientesRouter } from "./routers/clientes";
import { gerenciadorasRouter } from "./routers/gerenciadoras";
import { integracoesRouter } from "./routers/integracoes";
import { masControleRouter } from "./routers/masControle";
import { moAlocacaoRouter } from "./routers/moAlocacao";
import { gestaoDocumentosRouter } from "./routers/gestaodocumentos";
import { telemetriaRouter } from "./routers/telemetria";
import { signaturesRouter } from "./routers/signatures";
import { portalServicoRouter } from "./routers/portalServico";
import { integrasignRouter } from "./routers/integrasign";
import { ddsRouter } from "./routers/dds";
import { ptPermissoesRouter } from "./routers/ptPermissoes";
import { aprAnalisesRouter } from "./routers/aprAnalises";
import { databookRouter } from "./routers/databook";
import { operacionalRouter } from "./routers/operacional";
import { frotasRouter } from "./routers/frotas";
import { diarioObraRouter } from "./routers/diarioObra";
import { smoRouter } from "./routers/smo";
import { sstDocumentsRouter } from "./routers/sstDocuments";
import { integracaoSSTRouter } from "./routers/integracaoSST";
import { sstAnalyticsRouter } from "./routers/sstAnalytics";
import { acidentesRouter } from "./routers/acidentes";
import { scorecardRouter } from "./routers/scorecard";
import { avaliacaoFuncionariosRouter } from "./routers/avaliacaoFuncionarios";
import { systemDocumentTemplatesRouter } from "./routers/systemDocumentTemplates";
import { fiscalNotesRouter } from "./routers/fiscalNotes";
import { contabilidadeRouter } from "./routers/contabilidade";
import { sefazRouter } from "./routers/sefaz";
import { nfseEmitidasRouter } from "./routers/nfseEmitidas";
import { omieRouter } from "./routers/omie";
import { efdIcmsIpiRouter } from "./routers/efdIcmsIpi";
import { efdContribuicoesRouter } from "./routers/efdContribuicoes";
import { spedEcfRouter } from "./routers/spedEcf";
import { spedEcdRouter } from "./routers/spedEcd";
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

// Rev. 4041 — "Adm Cliente" (role adm_cliente): admin restrito às SUAS empresas
// vinculadas (companyIds via user_companies), sem acesso global (diferente de
// admin/admin_master). Só gerencia usuários "user" dentro do próprio escopo;
// não promove ninguém a admin/admin_master/adm_cliente e não gerencia módulos.
async function assertAdmClienteTargetScope(callerId: number, targetUserId: number): Promise<number[]> {
  const callerCompanies = (await getCompaniesForUser(callerId, "adm_cliente")).map((c: any) => Number(c.id));
  const targetLinks = await getUserCompanyLinks(targetUserId);
  const targetCompanyIds = targetLinks.map((l: any) => Number(l.companyId));
  const overlap = targetCompanyIds.some((id: number) => callerCompanies.includes(id));
  if (!overlap) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário fora do escopo das suas empresas" });
  }
  return callerCompanies;
}

export const appRouter = router({
  billing: billingRouter,
  saasAdmin: saasAdminRouter,
  system: systemRouter,
  docs: controleDocumentosRouter,
  home: homeDataRouter,
  epis: episRouter,
  faceRecognition: faceRecognitionRouter,
  insurance: insuranceRouter,
  menuConfig: menuConfigRouter,
  menuLayout: menuLayoutRouter,
  goldenRules: goldenRulesRouter,
  notifications: notificationsRouter,
  recontratacao: recontratacaoRouter,
  avaliacao: avaliacaoRouter,
  orcamentista: orcamentistaRouter,
  iaModulos: iaModulosRouter,
  sprint1: sprint1Router,
  medicosClinicas: medicosClinicasRouter,
  terceiros: terceirosRouter,
  terceiroContratos: terceiroContratosRouter,
  parceiros: parceirosRouter,
  orcamento: orcamentoRouter,
  planejamento: planejamentoRouter,
  bim: bimRouter,
  medicao: medicaoRouter,
  iaCronograma: iaCronogramaRouter,
  aiConfig: aiConfigRouter,
  medicaoConfig: medicaoConfigRouter,
  compras: comprasRouter,
  purchase: purchaseRouter,
  warehouse: warehouseRouter,
  auditoriaAlmoxarifado: auditoriaAlmoxarifadoRouter, // Rev. 2450
  equipamentos: equipamentosRouter,
  ferramentasTerceiros: ferramentasTerceirosRouter,
  clientes: clientesRouter,
  gerenciadoras: gerenciadorasRouter,
  integracoes: integracoesRouter,
  masControle: masControleRouter,
  moAlocacao: moAlocacaoRouter,
  gestaoDocumentos: gestaoDocumentosRouter,
  telemetria: telemetriaRouter,
  signatures: signaturesRouter,
  portalServico: portalServicoRouter,
  integrasign: integrasignRouter,
  dds: ddsRouter,
  ptPermissoes: ptPermissoesRouter,
  aprAnalises: aprAnalisesRouter,
  databook: databookRouter,
  operacional: operacionalRouter,
  portalExterno: portalExternoRouter,
  coletaRh: coletaRhRouter,
  payrollEngine: payrollEngineRouter,
  horasExtras: horasExtrasRouter,
  fieldNotes: fieldNotesRouter,
  epiAvancado: epiAvancadoRouter,
  backup: backupRouter,
  migration: migrationRouter,
  contracts: contractsRouter,
  skills: skillsRouter,
  frotas: frotasRouter,
  diarioObra: diarioObraRouter,
  smo: smoRouter,
  sstDocuments: sstDocumentsRouter,
  integracaoSST: integracaoSSTRouter,
  sstAnalytics: sstAnalyticsRouter,
  acidentes: acidentesRouter,
  scorecard: scorecardRouter,
  avaliacaoFuncionarios: avaliacaoFuncionariosRouter,
  systemDocumentTemplates: systemDocumentTemplatesRouter,
  bankStatementTemplates: bankStatementTemplatesRouter,
  auth: router({
    me: publicProcedure.query(async opts => {
      if (!opts.ctx.user) return null;
      const { password, ...safeUser } = opts.ctx.user as any;
      // Rev. 2388 — expor flag para o frontend saber se exige senha em ações sensíveis.
      // Rev. 3904 — enrich com employeeId p/ usuários de login local (JWT não carrega o campo).
      if (!safeUser.employeeId) {
        try {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { employees } = await import("../drizzle/schema");
            const { ilike } = await import("drizzle-orm");
            const userName = (safeUser.name ?? safeUser.username ?? "").trim();
            if (userName) {
              const [emp] = await db.select({ id: employees.id })
                .from(employees)
                .where(ilike(employees.nomeCompleto, userName))
                .limit(1);
              if (emp) safeUser.employeeId = emp.id;
            }
          }
        } catch { /* silencioso — employeeId continua nulo */ }
      }
      return { ...safeUser, hasLocalPassword: !!password };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    verifyPassword: protectedProcedure.input(z.object({
      password: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const bcrypt = await import("bcryptjs");
      const { users } = await import("../drizzle/schema");
      const db = (await getDb())!;
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.password) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não possui login local" });
      const valid = bcrypt.compareSync(input.password, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });
      return { success: true };
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
      // Salva como data URL direto no banco — não requer storage externo
      const dataUrl = `data:${input.mimeType};base64,${input.base64}`;
      await updateCompany(input.companyId, { logoUrl: dataUrl } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "empresas", entityType: "company", entityId: input.companyId, details: `Logo da empresa atualizado` });
      return { url: dataUrl };
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
    // Lista usuários ativos vinculados à empresa (para seletor de conta do sistema dos gestores)
    listUsuariosSistema: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        SELECT u.id, u.name, u.email, u.role, u.status, u.avatar_url
        FROM users u
        INNER JOIN user_companies uc ON uc."userId" = u.id AND uc."companyId" = ${input.companyId}
        WHERE u.status = 'ativo' AND u."deletedAt" IS NULL
        ORDER BY u.name
      `);
      return (rows as any).rows as { id: number; name: string; email: string; role: string; status: string; avatar_url: string | null }[];
    }),

    getGestoresContrato: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const [company] = await db.select({
        gestorFinanceiroId: companies.gestorFinanceiroId,
        gestorFinanceiroNome: companies.gestorFinanceiroNome,
        gestorFinanceiroUserId: companies.gestorFinanceiroUserId,
        gestorRhId: (companies as any).gestorRhId,
        gestorRhNome: (companies as any).gestorRhNome,
        gestorRhUserId: companies.gestorRhUserId,
        gestorProjetoId: companies.gestorProjetoId,
        gestorProjetoNome: companies.gestorProjetoNome,
      }).from(companies).where(eq(companies.id, input.companyId));
      if (!company) return { gestorFinanceiroId: null, gestorFinanceiroNome: null, gestorFinanceiroUserId: null, gestorRhId: null, gestorRhNome: null, gestorRhUserId: null, gestorProjetoId: null, gestorProjetoNome: null, finUser: null, rhUser: null };

      type UserInfo = { userId: number; status: string; nome: string; email: string | null } | null;
      let finUser: UserInfo = null;
      let rhUser: UserInfo = null;

      // Busca os funcionários gestores para obter employee.userId (vínculo direto — Rev. 4481)
      const empIdsToFetch: number[] = [];
      if (company.gestorFinanceiroId) empIdsToFetch.push(company.gestorFinanceiroId);
      if ((company as any).gestorRhId) empIdsToFetch.push((company as any).gestorRhId);

      if (empIdsToFetch.length > 0) {
        const empRows = await db.select({ id: employees.id, userId: (employees as any).userId, email: employees.email })
          .from(employees).where(inArray(employees.id, empIdsToFetch));
        const empById = new Map(empRows.map(e => [e.id, e]));

        // Resolver userId: prioridade employee.userId > company.gestorXxxUserId > email match
        const resolveUid = (empId: number | null, companyUid: number | null | undefined) => {
          if (!empId) return null;
          const emp = empById.get(empId);
          return (emp as any)?.userId ?? companyUid ?? null;
        };
        const finUid = resolveUid(company.gestorFinanceiroId, company.gestorFinanceiroUserId);
        const rhUid  = resolveUid((company as any).gestorRhId, company.gestorRhUserId);

        // Fallback por e-mail quando nenhum userId está linkado
        const emails: string[] = [];
        const needEmailFin = !finUid && !!company.gestorFinanceiroId;
        const needEmailRh  = !rhUid  && !!(company as any).gestorRhId;
        if (needEmailFin) { const emp = empById.get(company.gestorFinanceiroId!); if (emp?.email) emails.push(emp.email); }
        if (needEmailRh)  { const emp = empById.get((company as any).gestorRhId);  if (emp?.email) emails.push(emp.email); }

        const allUids = [finUid, rhUid].filter(Boolean) as number[];
        const allEmails = emails.filter(Boolean);

        type URow = { id: number; name: string; email: string | null; status: string | null; deletedAt: Date | null };
        const userRows: URow[] = [];
        if (allUids.length > 0) {
          const r = await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, deletedAt: users.deletedAt })
            .from(users).where(inArray(users.id, allUids));
          userRows.push(...r);
        }
        if (allEmails.length > 0) {
          const r = await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, deletedAt: users.deletedAt })
            .from(users).where(inArray(users.email, allEmails));
          userRows.push(...r);
        }
        const userById = new Map(userRows.map(u => [u.id, u]));
        const userByEmail = new Map(userRows.map(u => [u.email?.toLowerCase() || "", u]));
        const toInfo = (u: URow | undefined): UserInfo =>
          u ? { userId: u.id, status: u.deletedAt ? "deletado" : (u.status || "ativo"), nome: u.name || "", email: u.email || null } : null;

        if (company.gestorFinanceiroId) {
          if (finUid) finUser = toInfo(userById.get(finUid));
          else if (needEmailFin) {
            const emp = empById.get(company.gestorFinanceiroId);
            finUser = toInfo(emp?.email ? userByEmail.get(emp.email.toLowerCase()) : undefined);
          }
        }
        if ((company as any).gestorRhId) {
          if (rhUid) rhUser = toInfo(userById.get(rhUid));
          else if (needEmailRh) {
            const emp = empById.get((company as any).gestorRhId);
            rhUser = toInfo(emp?.email ? userByEmail.get(emp.email.toLowerCase()) : undefined);
          }
        }
      }

      return { ...company, finUser, rhUser };
    }),
    salvarGestoresContrato: protectedProcedure.input(z.object({
      companyId: z.number(),
      gestorFinanceiroId: z.number().nullable(),
      gestorFinanceiroNome: z.string().nullable(),
      gestorRhId: z.number().nullable(),
      gestorRhNome: z.string().nullable(),
      gestorProjetoId: z.number().nullable(),
      gestorProjetoNome: z.string().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 4481 — auto-deriva userId a partir de employees.userId (vínculo direto do perfil)
      const empIds = [input.gestorFinanceiroId, input.gestorRhId].filter(Boolean) as number[];
      let finUserId: number | null = null;
      let rhUserId: number | null = null;
      if (empIds.length > 0) {
        const empRows = await db.select({ id: employees.id, userId: (employees as any).userId })
          .from(employees).where(inArray(employees.id, empIds));
        const empMap = new Map(empRows.map((e: any) => [e.id, e.userId ?? null]));
        if (input.gestorFinanceiroId) finUserId = empMap.get(input.gestorFinanceiroId) ?? null;
        if (input.gestorRhId) rhUserId = empMap.get(input.gestorRhId) ?? null;
      }
      await db.update(companies).set({
        gestorFinanceiroId: input.gestorFinanceiroId,
        gestorFinanceiroNome: input.gestorFinanceiroNome,
        gestorFinanceiroUserId: finUserId,
        gestorRhId: input.gestorRhId,
        gestorRhNome: input.gestorRhNome,
        gestorRhUserId: rhUserId,
        gestorProjetoId: input.gestorProjetoId,
        gestorProjetoNome: input.gestorProjetoNome,
      } as any).where(eq(companies.id, input.companyId));
      return { success: true };
    }),

    // Rev. 4479 — Retorna gestores ATIVOS (substituto aprovado e vigente, senão original)
    getGestoresAtivos: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const [company] = await db.select({
        gestorFinanceiroId: companies.gestorFinanceiroId,
        gestorFinanceiroNome: companies.gestorFinanceiroNome,
        gestorRhId: (companies as any).gestorRhId,
        gestorRhNome: (companies as any).gestorRhNome,
      }).from(companies).where(eq(companies.id, input.companyId));
      if (!company) return { financeiro: null, rh: null };

      // Busca substituições aprovadas e vigentes (sem periodoFim ou periodoFim >= hoje)
      const hoje = new Date().toISOString().slice(0, 10);
      const subs = await db.select().from(gestorSubstituicaoSolicitacoes)
        .where(and(
          eq(gestorSubstituicaoSolicitacoes.companyId, input.companyId),
          eq(gestorSubstituicaoSolicitacoes.status, "aprovado"),
          sql`(periodo_fim IS NULL OR periodo_fim >= ${hoje})`,
        ))
        .orderBy(desc(gestorSubstituicaoSolicitacoes.criadoEm));

      const subFin = subs.find(s => s.papel === "financeiro");
      const subRh = subs.find(s => s.papel === "rh");

      // Busca email dos gestores ativos via employees
      const idsToFetch: number[] = [];
      const finId = subFin ? subFin.substitutoId : (company.gestorFinanceiroId ?? null);
      const rhId = subRh ? subRh.substitutoId : ((company as any).gestorRhId ?? null);
      if (finId) idsToFetch.push(finId);
      if (rhId && rhId !== finId) idsToFetch.push(rhId);

      const empRows = idsToFetch.length > 0
        ? await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, email: employees.email, cpf: employees.cpf, userId: (employees as any).userId })
            .from(employees).where(inArray(employees.id, idsToFetch))
        : [];

      const empMap = new Map(empRows.map((e: any) => [e.id, e]));
      const finEmp: any = finId ? empMap.get(finId) : null;
      const rhEmp: any = rhId ? empMap.get(rhId) : null;

      return {
        financeiro: finEmp ? {
          id: finEmp.id,
          nome: finEmp.nomeCompleto || company.gestorFinanceiroNome || "",
          email: finEmp.email || null,
          cpf: finEmp.cpf || null,
          userId: finEmp.userId ?? null,
          isSubstituto: !!subFin,
        } : (company.gestorFinanceiroId ? { id: company.gestorFinanceiroId, nome: company.gestorFinanceiroNome || "", email: null, cpf: null, userId: null, isSubstituto: false } : null),
        rh: rhEmp ? {
          id: rhEmp.id,
          nome: rhEmp.nomeCompleto || (company as any).gestorRhNome || "",
          email: rhEmp.email || null,
          cpf: rhEmp.cpf || null,
          userId: rhEmp.userId ?? null,
          isSubstituto: !!subRh,
        } : ((company as any).gestorRhId ? { id: (company as any).gestorRhId, nome: (company as any).gestorRhNome || "", email: null, cpf: null, userId: null, isSubstituto: false } : null),
      };
    }),

    // Rev. 4479 — Criação de solicitação de substituição de gestor
    criarSolicitacaoSubstituicao: protectedProcedure.input(z.object({
      companyId: z.number(),
      papel: z.enum(["financeiro", "rh"]),
      gestorOriginalId: z.number(),
      substitutoId: z.number(),
      motivo: z.enum(["ferias", "afastamento", "desligamento"]),
      periodoInicio: z.string().optional(),
      periodoFim: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Busca dados do gestor original e do substituto
      const [original] = await db.select({ nomeCompleto: employees.nomeCompleto }).from(employees).where(eq(employees.id, input.gestorOriginalId)).limit(1);
      const [substituto] = await db.select({ nomeCompleto: employees.nomeCompleto, email: employees.email }).from(employees).where(eq(employees.id, input.substitutoId)).limit(1);
      const [sol] = await db.insert(gestorSubstituicaoSolicitacoes).values({
        companyId: input.companyId,
        papel: input.papel,
        gestorOriginalId: input.gestorOriginalId,
        gestorOriginalNome: original?.nomeCompleto || null,
        substitutoId: input.substitutoId,
        substitutoNome: substituto?.nomeCompleto || null,
        substitutoEmail: substituto?.email || null,
        status: "pendente",
        motivo: input.motivo,
        periodoInicio: input.periodoInicio || null,
        periodoFim: input.periodoFim || null,
        criadoPorId: ctx.user.id,
        criadoPorNome: ctx.user.name || null,
      }).returning();
      return sol;
    }),

    // Rev. 4479 — Aprovação da substituição pelo Sócio Adm
    aprovarSolicitacao: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode aprovar substituições de gestores." });
      const db = (await getDb())!;
      await db.update(gestorSubstituicaoSolicitacoes).set({
        status: "aprovado",
        aprovadoPorId: ctx.user.id,
        aprovadoPorNome: ctx.user.name || null,
        aprovadoEm: new Date().toISOString(),
      } as any).where(and(eq(gestorSubstituicaoSolicitacoes.id, input.id), eq(gestorSubstituicaoSolicitacoes.companyId, input.companyId)));
      return { success: true };
    }),

    // Rev. 4479 — Rejeição da substituição pelo Sócio Adm
    rejeitarSolicitacao: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number(), motivo: z.string().min(1) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode rejeitar substituições de gestores." });
      const db = (await getDb())!;
      await db.update(gestorSubstituicaoSolicitacoes).set({
        status: "rejeitado",
        aprovadoPorId: ctx.user.id,
        aprovadoPorNome: ctx.user.name || null,
        aprovadoEm: new Date().toISOString(),
        motivoRejeicao: input.motivo,
      } as any).where(and(eq(gestorSubstituicaoSolicitacoes.id, input.id), eq(gestorSubstituicaoSolicitacoes.companyId, input.companyId)));
      return { success: true };
    }),

    // Rev. 4479 — Encerramento (retorno do gestor original)
    encerrarSolicitacao: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = (await getDb())!;
      await db.update(gestorSubstituicaoSolicitacoes).set({ status: "encerrado" } as any)
        .where(and(eq(gestorSubstituicaoSolicitacoes.id, input.id), eq(gestorSubstituicaoSolicitacoes.companyId, input.companyId)));
      return { success: true };
    }),

    // Rev. 4479 — Lista solicitações da empresa (pendentes + recentes)
    listarSolicitacoes: protectedProcedure.input(z.object({ companyId: z.number(), status: z.string().optional() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const conds = [eq(gestorSubstituicaoSolicitacoes.companyId, input.companyId)];
      if (input.status) conds.push(eq(gestorSubstituicaoSolicitacoes.status, input.status));
      return db.select().from(gestorSubstituicaoSolicitacoes)
        .where(and(...conds))
        .orderBy(desc(gestorSubstituicaoSolicitacoes.criadoEm))
        .limit(50);
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
    create: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1), descricao: z.string().optional(), ordemServico: z.string().optional(), cbo: z.string().optional(), categoriaMO: z.enum(["direto", "indireta_obra", "escritorio_central"]).nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const result = await createJobFunction(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "cadastro", entityType: "jobFunction", entityId: result.id, details: `Função criada: ${input.nome}` });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), companyId: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ordemServico: z.string().optional(), cbo: z.string().optional(), isActive: z.boolean().optional(), categoriaMO: z.enum(["direto", "indireta_obra", "escritorio_central"]).nullable().optional(),
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
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), search: z.string().optional(), status: z.string().optional(), excludeTerminated: z.boolean().optional(), includeTerminatedInMonth: z.string().optional() })).query(async ({ input, ctx }) => {
      // Rev. 2206 — sigilo do status "Aviso Prévio" para não-RH/não-master.
      const canSeeAviso = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
      // Se o filtro pedir Aviso e o usuário não pode ver, devolve vazio.
      if (!canSeeAviso && input.status === 'Aviso') return [] as any[];
      // Rev. 3270 — blacklist (Lista_Negra) é visível SÓ p/ admin_master, inclusive via API
      // (o front já gateia, mas o endpoint precisa impor — defesa em profundidade).
      const isAdminMaster = ctx.user.role === 'admin_master';
      if (!isAdminMaster && input.status === 'Lista_Negra') return [] as any[];
      const cacheKey = `emp:list:${input.companyId}:${(input.companyIds ?? []).join(',')}:${input.search ?? ''}:${input.status ?? ''}:${input.excludeTerminated ?? ''}:${input.includeTerminatedInMonth ?? ''}:av${canSeeAviso ? 1 : 0}:bl${isAdminMaster ? 1 : 0}`;
      const rows = await memCache.getOrFetch(cacheKey, TTL.SHORT, async () => {
        let data = await getEmployees(input.companyId, input.search, input.status, input.companyIds, input.excludeTerminated, input.includeTerminatedInMonth);
        if (!canSeeAviso && Array.isArray(data)) {
          for (const e of data as any[]) if (e && e.status === 'Aviso') e.status = 'Ativo';
        }
        // Rev. 3270 — defesa em profundidade: remove a blacklist da resposta p/ não-master
        // (qualquer recorte sem filtro explícito não pode vazar Lista_Negra).
        if (!isAdminMaster && Array.isArray(data)) {
          data = (data as any[]).filter((e) => !(e && (e.status === 'Lista_Negra' || e.listaNegra === 1 || e.listaNegra === true)));
        }
        return data;
      });
      return rows;
    }),
    getById: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).query(async ({ input, ctx }) => {
      const emp: any = await getEmployeeById(input.id, input.companyId);
      // Rev. 2206 — mascarar Aviso → Ativo se usuário não tem clearance.
      if (emp && emp.status === 'Aviso') {
        const canSeeAviso = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
        if (!canSeeAviso) emp.status = 'Ativo';
      }
      return emp;
    }),
    // Rev. 4481 — Vincula/desvincula um usuário do sistema ao colaborador
    linkUser: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      userId: z.number().nullable(),
    })).mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = (await getDb())!;
      // Garante que o userId pertence à empresa (se não-nulo)
      if (input.userId !== null) {
        const [link] = await db.execute(sql`
          SELECT 1 FROM user_companies WHERE "userId" = ${input.userId} AND "companyId" = ${input.companyId}
        `) as any;
        if (!(link as any)?.rows?.length) {
          // Admins globais podem não ter vínculo — aceitar se role for admin/admin_master
          const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId));
          if (!u || (u.role !== 'admin' && u.role !== 'admin_master')) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário não pertence a esta empresa' });
          }
        }
      }
      await updateEmployee(input.employeeId, input.companyId, { userId: input.userId } as any, { name: ctx.user.name ?? 'Sistema', id: ctx.user.id });
      return { success: true };
    }),
    // Rev. 4481 — Dado um userId, retorna o colaborador vinculado (se houver)
    getLinkedEmployee: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.execute(sql`
        SELECT e.id, e."companyId", e."nomeCompleto", e.cpf, e.cargo, e.funcao, e.status, e."fotoUrl",
               c."nomeFantasia" AS empresa_nome
        FROM employees e
        LEFT JOIN companies c ON c.id = e."companyId"
        WHERE e.user_id = ${input.userId} AND e."deletedAt" IS NULL
        LIMIT 1
      `);
      const r = (rows as any).rows?.[0] ?? null;
      return r ? {
        id: r.id,
        companyId: r.companyId,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        cargo: r.cargo,
        funcao: r.funcao,
        status: r.status,
        fotoUrl: r.fotoUrl,
        empresaNome: r.empresa_nome,
      } : null;
    }),
    stats: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input, ctx }) => {
      const canSeeAviso = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
      const cacheKey = `emp:stats:${input.companyId}:${(input.companyIds ?? []).join(',')}:av${canSeeAviso ? 1 : 0}`;
      return memCache.getOrFetch(cacheKey, TTL.MEDIUM, async () => {
        const s: any = await getEmployeeStats(input.companyId, input.companyIds);
        // Rev. 2206 — sem clearance: aviso some do badge e é somado em ativos.
        if (!canSeeAviso && s && typeof s === 'object') {
          const av = Number(s.aviso || 0);
          if (av > 0) {
            s.ativos = Number(s.ativos || 0) + av;
            s.aviso = 0;
            if (s.porStatus) {
              s.porStatus.Ativo = (s.porStatus.Ativo ?? 0) + (s.porStatus.Aviso ?? 0);
              delete s.porStatus.Aviso;
            }
          }
        }
        return s;
      });
    }),
    create: protectedProcedure.input(z.any()).mutation(async ({ input, ctx }) => {
      // === UNICIDADE POR EMPRESA ===
      // CPF e RG são únicos por empresa. O mesmo CPF pode existir em empresas diferentes.
      const targetCompanyId: number = input.companyId || 0;
      if (input.cpf && !input.cpf.startsWith('000.000') && targetCompanyId) {
        // Verificar lista negra desta empresa
        const blacklisted = await checkBlacklist(input.cpf, targetCompanyId);
        if (blacklisted) {
          throw new TRPCError({ code: "FORBIDDEN", message: `🚫 FUNCIONÁRIO NA BLACKLIST!\n\n${blacklisted.nomeCompleto} (CPF: ${input.cpf}) está na Blacklist desta empresa.\nMotivo: ${blacklisted.motivoListaNegra || 'Não informado'}\nData: ${blacklisted.dataListaNegra || 'N/A'}\nRegistrado por: ${(blacklisted as any).listaNegraPor || 'N/A'}\n\nPara reativar este funcionário, é necessária a aprovação de 2 diretores da empresa.` });
        }
        // Verificar CPF duplicado somente nesta empresa
        const dup = await checkDuplicateCpf(input.cpf, targetCompanyId);
        if (dup && (dup as any[]).length > 0) {
          const dupInfo = (dup as any[])[0];
          const isDesligado = EMPLOYEE_STATUS_DESLIGADOS.includes(dupInfo.status);
          if (isDesligado && input._recontratacao) {
            // Rev. 2755 — GATE DE STAGING: a recontratação NÃO cria mais funcionário
            // direto por aqui. TODO retorno de desligado passa OBRIGATORIAMENTE pela
            // fila de liberação do sócio (recontratacao.criarSolicitacao → aprovar).
            // Fecha o bypass que permitia virar funcionário sem aprovação.
            throw new TRPCError({ code: "CONFLICT", message: `🔄 Recontratação requer liberação do sócio.\n\nO CPF ${input.cpf} pertence a ${dupInfo.nomeCompleto} (desligado). Use o fluxo de Recontratação no cadastro para enviar a solicitação à fila de liberação. Nada vira funcionário até a aprovação do Admin Master ou suplente.` });
          } else if (isDesligado) {
            throw new TRPCError({ code: "CONFLICT", message: `⚠️ CPF já cadastrado nesta empresa (Funcionário Desligado)\n\nO CPF ${input.cpf} pertence a: ${dupInfo.nomeCompleto}\nStatus: ${dupInfo.status}\nData Desligamento: ${dupInfo.dataDesligamento || 'N/A'}\n\n🔄 Este funcionário pode ser RECONTRATADO.\nUse a opção de recontratação no cadastro para prosseguir.` });
          } else {
            throw new TRPCError({ code: "CONFLICT", message: `⚠️ CPF já cadastrado nesta empresa!\n\nO CPF ${input.cpf} pertence a: ${dupInfo.nomeCompleto}\nStatus: ${dupInfo.status || 'N/A'}\n\nSe este funcionário trabalha em outra empresa do grupo, selecione a empresa correta antes de cadastrá-lo.` });
          }
        }
        // Rev. 4067 — CPF já existe em OUTRA empresa do MESMO grupo (compartilhaRecursos).
        // Como as empresas do grupo já compartilham recursos (obra_funcionarios aceita
        // alocação por empresa), duplicar o cadastro cria 2 registros divergentes da
        // mesma pessoa (ex.: um em férias, outro ativo). Bloqueia por padrão; libera
        // só se o usuário confirmar explicitamente via input._confirmarCpfOutraEmpresaGrupo.
        if (!input._confirmarCpfOutraEmpresaGrupo) {
          const dupGrupo = await checkDuplicateCpfCrossCompanyGroup(input.cpf, targetCompanyId);
          if (dupGrupo.length > 0) {
            const info = dupGrupo[0] as any;
            throw new TRPCError({ code: "CONFLICT", message: `⚠️ Este CPF já está cadastrado em ${info.empresa} (mesmo grupo empresarial)!\n\n${info.nomeCompleto} — Status: ${info.status || 'N/A'}\n\nAs empresas do grupo já compartilham recursos: aloque este funcionário na obra usando o cadastro existente, em vez de criar um novo. Se tiver certeza que são pessoas diferentes com o mesmo CPF (raro), confirme para prosseguir mesmo assim.` });
          }
        }
      }
      // Verificar RG duplicado somente nesta empresa
      if (input.rg && input.rg.trim() && targetCompanyId) {
        const db = await getDb();
        if (db) {
          const rgDup = await db.select().from(employees).where(
            and(eq(employees.rg, input.rg), eq(employees.companyId, targetCompanyId), sql`${employees.rg} IS NOT NULL AND ${employees.rg} != ''`, isNull(employees.deletedAt))
          );
          if (rgDup.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: `⚠️ RG já cadastrado nesta empresa!\n\nO RG ${input.rg} pertence a: ${rgDup[0].nomeCompleto}\nStatus: ${rgDup[0].status || 'N/A'}\n\nVerifique se não é o mesmo funcionário.` });
          }
        }
      }
      const result = await createEmployee(input);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "colaboradores", entityType: "employee", entityId: result.id, details: `Colaborador criado: ${input.nomeCompleto}` });
      try {
        const db = await getDb();
        if (db) {
          await db.execute(sql`INSERT INTO employee_change_log ("employeeId", "companyId", "userId", "userName", "action", "summary", "createdAt")
            VALUES (${result.id}, ${input.companyId || null}, ${ctx.user.id}, ${ctx.user.name ?? 'Sistema'}, 'CREATE', ${'Colaborador cadastrado: ' + (input.nomeCompleto || '')}, NOW())`);
        }
      } catch (e) { console.error('[ChangeLog] Erro create:', e); }
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
      memCache.invalidatePrefix('emp:');
      memCache.invalidatePrefix('dash:func:');
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
      
      // === CARGO DE CONFIANÇA / ART. 62 CLT: VALIDAÇÃO LEGAL (Rev. 1874) ===
      // Quando marcado isento de controle de jornada, exige inciso (I/II/III) e:
      //   • Inciso II (gestão): gratificação de função ≥ 40% (Parágrafo único do Art. 62 da CLT).
      //   • Inciso I (atividade externa): observação descrevendo a anotação na CTPS / ficha de registro.
      //   • Inciso III (teletrabalho por produção/tarefa, Lei 14.442/2022): observação recomendada.
      if (String(employeeData.cargoConfianca) === "1") {
        const incisoRaw = String(employeeData.cargoConfiancaInciso ?? empAnterior?.cargoConfiancaInciso ?? "").trim().toUpperCase();
        const inciso = ["I", "II", "III"].includes(incisoRaw) ? incisoRaw : "";
        if (!inciso) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '⚠️ Cargo de Confiança / Art. 62 CLT\n\nSelecione o INCISO de enquadramento:\n• I — Atividade externa incompatível com controle de horário\n• II — Cargo de gestão / confiança (gerente, diretor)\n• III — Teletrabalho por produção ou tarefa' });
        }
        // Inciso II: gratificação mínima 40% (Parágrafo único do Art. 62 CLT)
        if (inciso === "II") {
          const gratRaw = String(employeeData.cargoConfiancaGratificacao ?? empAnterior?.cargoConfiancaGratificacao ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
          const gratNum = parseFloat(gratRaw);
          if (!isFinite(gratNum) || gratNum < 40) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '⚠️ Cargo de Gestão (Art. 62, II CLT)\n\nA gratificação de função deve ser de NO MÍNIMO 40% sobre o salário efetivo (Parágrafo único do Art. 62 da CLT). Sem isso, o enquadramento pode ser descaracterizado em fiscalização ou ação trabalhista.' });
          }
        }
        // Inciso I: observação obrigatória (deve constar anotação CTPS + ficha de registro — Art. 62, I CLT)
        if (inciso === "I") {
          const obs = String(employeeData.cargoConfiancaObservacao ?? empAnterior?.cargoConfiancaObservacao ?? "").trim();
          if (obs.length < 10) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '⚠️ Atividade Externa (Art. 62, I CLT)\n\nDescreva na OBSERVAÇÃO a justificativa do enquadramento — a lei exige que essa condição esteja anotada na CTPS e na ficha de registro do empregado. Mín. 10 caracteres.' });
          }
        }
        employeeData.cargoConfiancaInciso = inciso;
      } else if (employeeData.cargoConfianca !== undefined && String(employeeData.cargoConfianca) === "0") {
        // Ao desmarcar, limpa inciso pra não ficar inconsistente (preserva data/grat/obs como histórico).
        employeeData.cargoConfiancaInciso = null;
      }

      await updateEmployee(input.id, input.companyId, employeeData, { name: ctx.user.name ?? 'Sistema', id: ctx.user.id });
      
      const changedFields: Record<string, { de: any; para: any }> = {};
      if (empAnterior) {
        const ignoredKeys = new Set(['id','companyId','createdAt','updatedAt','deletedAt','deletedBy','deletedByName','deleteReason','_recontratacao','fotoUrl']);
        for (const key of Object.keys(employeeData)) {
          if (ignoredKeys.has(key)) continue;
          const oldVal = (empAnterior as any)[key];
          const newVal = employeeData[key];
          const oldStr = oldVal == null ? '' : String(oldVal).trim();
          const newStr = newVal == null ? '' : String(newVal).trim();
          if (oldStr !== newStr) {
            changedFields[key] = { de: oldVal ?? null, para: newVal ?? null };
          }
        }
      }
      const changesArr = Object.entries(changedFields);
      const summaryParts = changesArr.slice(0, 10).map(([k, v]) => `${k}: "${v.de ?? ''}" → "${v.para ?? ''}"`);
      const summaryText = changesArr.length > 0 
        ? `${changesArr.length} campo(s) alterado(s): ${summaryParts.join('; ')}${changesArr.length > 10 ? ` (+${changesArr.length - 10} mais)` : ''}`
        : 'Nenhuma alteração detectada';
      
      try {
        const db = await getDb();
        if (db && changesArr.length > 0) {
          await db.execute(sql`INSERT INTO employee_change_log ("employeeId", "companyId", "userId", "userName", "action", "changes", "summary", "createdAt")
            VALUES (${input.id}, ${input.companyId || null}, ${ctx.user.id}, ${ctx.user.name ?? 'Sistema'}, 'UPDATE', ${JSON.stringify(changedFields)}::jsonb, ${summaryText}, NOW())`);
        }
      } catch (e) { console.error('[ChangeLog] Erro:', e); }
      
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador atualizado: ${employeeData.nomeCompleto || input.nomeCompleto || ""} — ${summaryText}` });
      
      // === AUTO-DESALOCAÇÃO: Remover de obra quando status muda para Desligado ou Lista_Negra ===
      const statusAnterior = empAnterior?.status || null;
      const statusNovo = employeeData.status || null;
      if (statusNovo && ['Desligado', 'Lista_Negra'].includes(statusNovo) && statusAnterior !== statusNovo) {
        try {
          const allocations = await checkEmployeeAllocations([input.id]);
          const activeAlloc = allocations.find((a: any) => a.employeeId === input.id);
          if (activeAlloc) {
            await removeEmployeeFromObra(input.id, `Auto-desalocação: status alterado para ${statusNovo}`, ctx.user.name ?? 'Sistema', ctx.user.id);
            await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "obras", entityType: "obra_funcionario", entityId: input.id, details: `Funcionário ${employeeData.nomeCompleto || empAnterior?.nomeCompleto || ''} removido automaticamente da obra ${activeAlloc.obraAtualNome} (status: ${statusNovo})` });
            console.log(`[AutoDesalocação] Funcionário #${input.id} removido da obra (status: ${statusNovo})`);
          }
        } catch (e) { console.error('[AutoDesalocação] Erro:', e); }
        try {
          await encerrarContratosPjDoFuncionario(
            input.id,
            `Status alterado para ${statusNovo} via edição de colaborador`,
            ctx.user.name ?? 'Sistema',
          );
        } catch (e) { console.error('[employees.update] Erro ao encerrar contratos PJ:', e); }
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
      memCache.invalidatePrefix('emp:');
      memCache.invalidatePrefix('dash:func:');
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number(), reason: z.string().optional() })).mutation(async ({ input, ctx }) => {
      // Buscar nome do colaborador antes de excluir
      const emp = await getEmployeeById(input.id, input.companyId);
      const empNome = emp?.nomeCompleto || `#${input.id}`;
      await softDeleteEmployee(input.id, input.companyId, ctx.user.id, ctx.user.name ?? "Sistema", input.reason);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador excluído (lixeira): ${empNome}${input.reason ? ` — Motivo: ${input.reason}` : ""}` });
      memCache.invalidatePrefix('emp:');
      memCache.invalidatePrefix('dash:func:');
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
      memCache.invalidatePrefix('emp:');
      memCache.invalidatePrefix('dash:func:');
      return { success: true };
    }),
    // Exclusão permanente
    permanentDelete: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number() })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id, input.companyId);
      const empNome = emp?.nomeCompleto || `#${input.id}`;
      await permanentDeleteEmployee(input.id, input.companyId);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "PERMANENT_DELETE", module: "colaboradores", entityType: "employee", entityId: input.id, details: `Colaborador excluído permanentemente: ${empNome}` });
      memCache.invalidatePrefix('emp:');
      memCache.invalidatePrefix('dash:func:');
      return { success: true };
    }),
    history: router({
      list: protectedProcedure.input(z.object({ employeeId: z.number(), companyId: z.number() })).query(({ input }) => getEmployeeHistory(input.employeeId, input.companyId)),
      create: protectedProcedure.input(z.any()).mutation(({ input }) => createEmployeeHistory(input)),
    }),
    changeLog: protectedProcedure.input(z.object({ employeeId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = (await db.execute(sql`SELECT id, "employeeId", "userId", "userName", "action", "changes", "summary", "createdAt" FROM employee_change_log WHERE "employeeId" = ${input.employeeId} ORDER BY "createdAt" DESC LIMIT 100`)) as any;
      return (rows.rows || rows || []).map((r: any) => ({
        id: r.id,
        userName: r.userName,
        action: r.action,
        changes: r.changes,
        summary: r.summary,
        createdAt: r.createdAt,
      }));
    }),
    checkDuplicateCpf: protectedProcedure.input(z.object({ cpf: z.string(), companyId: z.number() })).query(({ input }) => checkDuplicateCpf(input.cpf, input.companyId)),
    uploadFoto: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const { storagePut } = await import("./storage");
      const buffer = Buffer.from(input.base64, "base64");
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const ext = input.fileName.split(".").pop()?.toLowerCase() || "jpg";
      const fname = `${input.companyId}-${input.employeeId}-${suffix}.${ext}`;
      const { url } = await storagePut(`photos/${fname}`, buffer, input.mimeType || "image/jpeg");
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

    // === Rev. 1878 — TERMO DE ISENÇÃO DE CONTROLE DE JORNADA (CLT Art. 62) ===
    // Upload do termo assinado pelo colaborador (PDF/JPG/PNG, máx 10MB). O termo
    // é gerado pelo frontend (window.print → Salvar como PDF) e devolvido aqui
    // para arquivamento formal. Sem termo assinado, a isenção é apenas um flag
    // interno; com termo, há prova documental em caso de fiscalização/TST.
    uploadTermoArt62: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      fileBase64: z.string(),
      mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
      fileName: z.string().max(200),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // 1) Verifica que o colaborador existe E pertence à companyId informada
      //    ANTES de decodificar/persistir o arquivo (evita orphan objects no
      //    storage em chamadas tRPC diretas que burlam o frontend).
      const empCheck = await db.execute(sql`
        SELECT id FROM employees
        WHERE id = ${input.employeeId} AND "companyId" = ${input.companyId} AND "deletedAt" IS NULL
        LIMIT 1
      `);
      if (!(empCheck.rows && empCheck.rows.length > 0)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado nesta empresa.' });
      }
      // 2) Decodifica e valida o tamanho do binário no servidor (≤10MB). O limite
      //    de 10MB no frontend é UX; aqui é a defesa real contra abuso.
      let buffer: Buffer;
      try {
        if (!input.fileBase64 || input.fileBase64.length === 0) {
          throw new Error('payload vazio');
        }
        buffer = Buffer.from(input.fileBase64, 'base64');
      } catch (e: any) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo inválido (base64 corrompido).' });
      }
      if (buffer.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo vazio.' });
      }
      const MAX_BYTES = 10 * 1024 * 1024;
      if (buffer.length > MAX_BYTES) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Arquivo muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Limite: 10MB.` });
      }
      // 3) Sobe ao storage e persiste a URL. O UPDATE também filtra por
      //    companyId (defense-in-depth) — se 0 linhas afetadas, cleanup do
      //    objeto e erro.
      const ext = input.mimeType === 'application/pdf' ? 'pdf'
        : input.mimeType === 'image/png' ? 'png' : 'jpg';
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const fileKey = `art62-termos/${input.companyId}/${input.employeeId}/termo-art62-${suffix}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      const updRes = await db.execute(sql`
        UPDATE employees SET
          cargo_confianca_termo_url = ${url},
          cargo_confianca_termo_nome_arquivo = ${input.fileName},
          cargo_confianca_termo_assinado_em = NOW(),
          "updatedAt" = NOW()
        WHERE id = ${input.employeeId} AND "companyId" = ${input.companyId}
        RETURNING id
      `);
      if (!(updRes.rows && updRes.rows.length > 0)) {
        // Defensivo: o pre-check passou mas o UPDATE não afetou nada (race ou
        // deletedAt entre as duas queries). Loga o orphan para limpeza futura.
        console.error('[uploadTermoArt62] UPDATE 0 linhas — possível orphan:', fileKey);
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado ao gravar termo.' });
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPLOAD_TERMO_ART62', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Termo de Isenção de Controle de Jornada (Art. 62 CLT) anexado — arquivo: ${input.fileName}` });
      memCache.invalidatePrefix('emp:');
      return { success: true, url };
    }),
    removerTermoArt62: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const updRes = await db.execute(sql`
        UPDATE employees SET
          cargo_confianca_termo_url = NULL,
          cargo_confianca_termo_nome_arquivo = NULL,
          cargo_confianca_termo_assinado_em = NULL,
          "updatedAt" = NOW()
        WHERE id = ${input.employeeId} AND "companyId" = ${input.companyId}
        RETURNING id
      `);
      if (!(updRes.rows && updRes.rows.length > 0)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado nesta empresa.' });
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'REMOVE_TERMO_ART62', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Termo de Isenção de Controle de Jornada (Art. 62 CLT) removido` });
      memCache.invalidatePrefix('emp:');
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
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Outros' as any, descricao: `Contrato de experiência prorrogado para 2º período por ${ctx.user.name}. ${input.obs || ''}`, dataEvento: new Date().toISOString().split('T')[0], registradoPor: ctx.user.id ?? null } as any);
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
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Outros' as any, descricao: `Colaborador efetivado após período de experiência por ${ctx.user.name}. ${input.obs || ''}`, dataEvento: new Date().toISOString().split('T')[0], registradoPor: ctx.user.id ?? null } as any);
      return { success: true };
    }),
    desligarExperiencia: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      motivo: z.string().min(1),
      obs: z.string().optional(),
      iniciativa: z.enum(['empregador', 'empregado']).default('empregador'),
      antecipado: z.boolean().default(false),
      dataDesligamento: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      const db = (await getDb())!;
      const checklistItems = await db.select().from(employeeTerminationChecklist)
        .where(and(eq(employeeTerminationChecklist.companyId, input.companyId), eq(employeeTerminationChecklist.employeeId, input.employeeId)));
      if (checklistItems.length > 0) {
        const pendentes = checklistItems.filter(i => i.obrigatorio === 1 && i.concluido === 0);
        if (pendentes.length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Não é possível desligar: ${pendentes.length} item(ns) obrigatório(s) pendente(s) na checklist de desligamento: ${pendentes.map(p => p.label).join(', ')}` });
        }
      }
      const hoje = new Date().toISOString().split('T')[0];
      const dataDesl = input.dataDesligamento || hoje;
      const iniciativa = input.iniciativa;
      const antecipado = input.antecipado;
      const categoriaDesl = iniciativa === 'empregado' ? 'Pedido de demissão' : 'Término de contrato';

      await updateEmployee(input.employeeId, input.companyId, {
        experienciaStatus: 'desligado_experiencia',
        status: 'Desligado',
        dataDemissao: dataDesl,
        dataDesligamentoEfetiva: dataDesl,
        categoriaDesligamento: categoriaDesl,
        motivoDesligamento: input.motivo,
        desligadoPor: ctx.user.name ?? 'Sistema',
        desligadoUserId: ctx.user.id,
        experienciaObs: input.obs || null,
      } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Colaborador DESLIGADO durante período de experiência. Iniciativa: ${iniciativa}. ${antecipado ? 'ANTECIPADO. ' : ''}Motivo: ${input.motivo}` });
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Desligamento' as any, descricao: `Desligado durante período de experiência por ${ctx.user.name}. Iniciativa: ${iniciativa}. ${antecipado ? 'Antecipado. ' : ''}Motivo: ${input.motivo}`, dataEvento: dataDesl, registradoPor: ctx.user.id ?? null } as any);

      // --- Gerar aviso prévio / termination notice ---
      try {
        const salarioBase = parseFloat(String((emp as any).salarioBase || '0'));
        const dataAdmissao = String((emp as any).dataAdmissao || dataDesl).split('T')[0];

        // Calcular fim do contrato de experiência (mesma régua da Análise de Experiência)
        const expTipo: string = (emp as any).experienciaTipo || '30_30';
        const inicioRaw = (emp as any).experienciaInicio || dataAdmissao;
        const inicioExp = String(inicioRaw).split('T')[0];
        const dias1Exp = expTipo === '30_30' ? 30 : 45;
        const dias2Exp = expTipo === '30_30' ? 60 : 90;
        const dtInicioExp = new Date(inicioExp + 'T12:00:00');
        const dtFim1Exp = new Date(dtInicioExp); dtFim1Exp.setDate(dtFim1Exp.getDate() + dias1Exp - 1);
        const dtFim2Exp = new Date(dtInicioExp); dtFim2Exp.setDate(dtFim2Exp.getDate() + dias2Exp - 1);
        const isProrrogado = ((emp as any).experienciaStatus || '') === 'prorrogado';
        const dtFimExp = isProrrogado ? dtFim2Exp : dtFim1Exp;
        const fimExp = dtFimExp.toISOString().split('T')[0];

        // Dias restantes do contrato para Art. 479/480
        const dtDesl = new Date(dataDesl + 'T12:00:00');
        const diasRestantesExp = Math.max(0, Math.round((dtFimExp.getTime() - dtDesl.getTime()) / (1000 * 60 * 60 * 24)));

        // Dias trabalhados no mês de saída
        const diasFeriasMes = await diasFeriasNoMesDaSaida(db, input.employeeId, dataDesl);
        const diasTrabalhadosMes = Math.max(1, dtDesl.getDate() - diasFeriasMes);

        // Calcular rescisão base (sem aviso prévio — tipo empregado_indenizado garante diasAviso=0)
        const previsaoBase = calcularRescisaoCompleta({
          salarioBase,
          dataAdmissao,
          dataDesligamento: dataDesl,
          dataFimAviso: dataDesl,
          tipo: 'empregado_indenizado',
          vrDiario: 0,
          diasTrabalhadosMes,
          periodosVencidosOverride: 0,
          diasVencidosOverride: 0,
          incluirMultaFgts: false,
        });

        const salarioDia = salarioBase / 30;

        // Multa FGTS 40% — só empregador ANTECIPADO (rescisão sem justa causa antes do prazo)
        // Término no prazo = vencimento natural do contrato → sem multa (art. 18 Lei 8.036/90)
        const incluirMultaFgts = await getIncluirMultaFgts(db, input.companyId);
        const multaFGTS = (iniciativa === 'empregador' && antecipado && incluirMultaFgts)
          ? parseFloat(String(previsaoBase.fgtsEstimado || '0')) * 0.4
          : 0;

        // Art. 479 — empregador antecipa: paga metade dos dias restantes ao empregado
        const multa479 = (iniciativa === 'empregador' && antecipado && diasRestantesExp > 0)
          ? (salarioDia * diasRestantesExp) / 2
          : 0;

        // Art. 480 — empregado antecipa: desconta metade dos dias restantes (empresa cobra)
        const multa480 = (iniciativa === 'empregado' && antecipado && diasRestantesExp > 0)
          ? (salarioDia * diasRestantesExp) / 2
          : 0;

        const totalBase = parseFloat(String(previsaoBase.total || '0'));
        const totalFinal = totalBase + multaFGTS + multa479 - multa480;
        const anosServico = calcularAnosServico(dataAdmissao, dataDesl);

        const previsaoFinal = {
          ...previsaoBase,
          multaFGTS: multaFGTS.toFixed(2),
          multa479: multa479.toFixed(2),
          multa480: multa480.toFixed(2),
          diasRestantesExp,
          fimContrato: fimExp,
          isExperiencia: true,
          iniciativa,
          antecipado,
          total: totalFinal.toFixed(2),
        };

        const tipoNotice = iniciativa === 'empregador' ? 'empregador_indenizado' : 'empregado_indenizado';

        await db.insert(terminationNotices).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: tipoNotice,
          dataInicio: dataDesl,
          dataFim: dataDesl,
          diasAviso: 0,
          anosServico,
          reducaoJornada: 'nenhuma',
          salarioBase: salarioBase.toFixed(2),
          previsaoRescisao: JSON.stringify(previsaoFinal),
          valorEstimadoTotal: totalFinal.toFixed(2),
          status: 'em_andamento',
          observacoes: [input.motivo, input.obs].filter(Boolean).join(' | ') || null,
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id ?? null,
        } as any);
      } catch (e) { console.error('[DesligarExperiencia] Erro ao criar termination notice:', e); }

      // Auto-desalocação de obra
      try {
        const allocations = await checkEmployeeAllocations([input.employeeId]);
        const activeAlloc = allocations.find((a: any) => a.employeeId === input.employeeId);
        if (activeAlloc) {
          await removeEmployeeFromObra(input.employeeId, 'Auto-desalocação: desligamento durante período de experiência', ctx.user.name ?? 'Sistema', ctx.user.id);
          console.log(`[AutoDesalocação] Funcionário #${input.employeeId} removido da obra (desligamento experiência)`);
        }
      } catch (e) { console.error('[AutoDesalocação] Erro:', e); }
      try {
        await encerrarContratosPjDoFuncionario(
          input.employeeId,
          'Desligamento durante período de experiência',
          ctx.user.name ?? 'Sistema',
        );
      } catch (e) { console.error('[ExperienciaDesligamento] Erro ao encerrar contratos PJ:', e); }
      return { success: true };
    }),

    // === PRÉ-MARCAÇÃO "NÃO RENOVAR" (Rev. 3022) ===
    // RH demarca ANTECIPADAMENTE que o contrato de experiência NÃO será
    // renovado (prorrogado/efetivado) — haverá aviso de não renovação. É só
    // um FLAG DE INTENÇÃO, reversível: NÃO altera experienciaStatus nem
    // executa o desligamento (a ação real continua pelo botão "Desligar").
    // ZERO ALTER/DROP/DELETE (R-001/R-007/R-010) — só UPDATE do flag.
    marcarNaoRenovarExperiencia: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      naoRenovar: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      // ACL explícita: o user logado precisa ter acesso à empresa alvo (evita IDOR
      // por injeção de companyId). Mesmo padrão dos endpoints hardened (Rev. 2137).
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowed.map((c: any) => (typeof c === 'number' ? c : c?.id)).filter((v: any) => typeof v === 'number') as number[];
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa.' });
      }
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      const hoje = new Date().toISOString().split('T')[0];
      await updateEmployee(input.employeeId, input.companyId, {
        experienciaNaoRenovar: input.naoRenovar ? 1 : 0,
        experienciaNaoRenovarEm: input.naoRenovar ? hoje : null,
        experienciaNaoRenovarPor: input.naoRenovar ? (ctx.user.name ?? 'Sistema') : null,
      } as any);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: input.naoRenovar ? 'Contrato de experiência PRÉ-MARCADO como "não renovar" (aviso de não renovação).' : 'Pré-marcação "não renovar" do contrato de experiência REMOVIDA.' });
      await createEmployeeHistory({ employeeId: input.employeeId, companyId: input.companyId, tipo: 'Outros' as any, descricao: input.naoRenovar ? `Contrato de experiência pré-marcado como "não renovar" por ${ctx.user.name}.` : `Pré-marcação "não renovar" removida por ${ctx.user.name}.`, dataEvento: hoje, registradoPor: ctx.user.id ?? null } as any);
      return { success: true };
    }),

    // === ANÁLISE DE EXPERIÊNCIA (Rev. 2622) ===
    // Cruza TODAS as ocorrências do colaborador DENTRO da janela do contrato de
    // experiência (início → hoje) — assiduidade/faltas, atrasos, advertências,
    // atestados, acidentes e histórico — e devolve um veredito SUGERIDO (score)
    // pra subsidiar RH/Diretoria na decisão de efetivar/prorrogar/desligar.
    // SOMENTE LEITURA (SELECT) — ZERO ALTER/DROP/DELETE (R-001/R-007/R-010).
    analiseExperiencia: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
    })).query(async ({ input }) => {
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      const e: any = emp;
      const db = (await getDb())!;
      const { warnings, timeRecords, atestados, accidents, employeeHistory } = await import("../drizzle/schema");

      // --- Janela do contrato de experiência (mesma régua do home.getData) ---
      const tipo: string = e.experienciaTipo || '30_30';
      const inicioRaw = e.experienciaInicio || e.dataAdmissao;
      const inicio = inicioRaw ? String(inicioRaw).split('T')[0] : null;
      if (!inicio) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Colaborador sem data de início de experiência/admissão.' });
      const dias1 = tipo === '30_30' ? 30 : 45;
      const dias2 = tipo === '30_30' ? 60 : 90;
      const dtInicio = new Date(inicio + 'T12:00:00');
      const dtFim1 = new Date(dtInicio); dtFim1.setDate(dtFim1.getDate() + dias1 - 1);
      const dtFim2 = new Date(dtInicio); dtFim2.setDate(dtFim2.getDate() + dias2 - 1);
      const fim1 = dtFim1.toISOString().split('T')[0];
      const fim2 = dtFim2.toISOString().split('T')[0];
      const status: string = e.experienciaStatus || 'em_experiencia';
      const isProrrogado = status === 'prorrogado';
      const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
      const hojeStr = hoje.toISOString().split('T')[0];
      const fimRelevante = isProrrogado ? dtFim2 : dtFim1;
      const diasRestantes = Math.ceil((fimRelevante.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      const diasDecorridos = Math.max(0, Math.ceil((hoje.getTime() - dtInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      // Filtra um registro pela janela [inicio, hoje]
      const naJanela = (d: any) => { const s = d ? String(d).split('T')[0] : null; return !!s && s >= inicio && s <= hojeStr; };

      // --- Coleta (todos os registros do colaborador, filtrados em memória) ---
      const [advRows, pontoRows, atestRows, acidRows, histRows] = await Promise.all([
        db.select().from(warnings).where(and(eq(warnings.employeeId, input.employeeId), eq(warnings.companyId, input.companyId), isNull(warnings.deletedAt))),
        db.select().from(timeRecords).where(eq(timeRecords.employeeId, input.employeeId)),
        db.select().from(atestados).where(and(eq(atestados.employeeId, input.employeeId), isNull(atestados.deletedAt))),
        db.select().from(accidents).where(and(eq(accidents.employeeId, input.employeeId), isNull(accidents.deletedAt))),
        db.select().from(employeeHistory).where(eq(employeeHistory.employeeId, input.employeeId)),
      ]);

      // --- Advertências na janela ---
      const adv = advRows.filter((a: any) => naJanela(a.dataOcorrencia))
        .sort((a: any, b: any) => String(b.dataOcorrencia).localeCompare(String(a.dataOcorrencia)));
      const advVerbais = adv.filter((a: any) => a.tipoAdvertencia === 'Verbal').length;
      const advEscritas = adv.filter((a: any) => a.tipoAdvertencia === 'Escrita').length;
      const advSuspensoes = adv.filter((a: any) => a.tipoAdvertencia === 'Suspensao').length;
      const advLista = adv.map((a: any) => ({ data: a.dataOcorrencia, tipo: a.tipoAdvertencia, motivo: a.motivo }));

      // --- Ponto na janela: faltas, atrasos, assiduidade ---
      const ponto = pontoRows.filter((p: any) => naJanela(p.data));
      let diasTrabalhados = 0, faltas = 0;
      ponto.forEach((p: any) => { (Number(p.faltas || 0) > 0) ? faltas++ : diasTrabalhados++; });
      const totalDias = diasTrabalhados + faltas;
      const assiduidadePerc = totalDias > 0 ? Math.round((diasTrabalhados / totalDias) * 1000) / 10 : 100;
      const atrasosDet = ponto
        .filter((p: any) => p.atrasos && p.atrasos !== '0:00' && p.atrasos !== '00:00')
        .map((p: any) => ({ data: p.data, entrada1: p.entrada1, atraso: p.atrasos }))
        .sort((a: any, b: any) => String(b.data).localeCompare(String(a.data)));
      // Soma de minutos de atraso (HH:MM)
      const minutosAtraso = atrasosDet.reduce((acc: number, a: any) => {
        const parts = String(a.atraso).split(':'); const h = Number(parts[0] || 0); const m = Number(parts[1] || 0);
        return acc + (Number.isFinite(h) ? h * 60 : 0) + (Number.isFinite(m) ? m : 0);
      }, 0);
      const faltasDet = ponto.filter((p: any) => Number(p.faltas || 0) > 0).map((p: any) => ({ data: p.data }))
        .sort((a: any, b: any) => String(b.data).localeCompare(String(a.data)));

      // --- Cobertura do cartão de ponto na janela (transparência: Rev. 2628) ---
      // O cálculo de faltas/assiduidade SÓ enxerga o que existe em time_records.
      // Se o mês ainda não foi fechado/importado, NÃO há linhas → faltas=0 e
      // assiduidade cai no default 100%, o que NÃO significa presença real.
      // Aqui expomos os dados brutos + quais meses do período estão sem cartão,
      // pra o RH validar exatamente o que o ERP enxergou.
      const mesesNaJanela: string[] = [];
      {
        const cur = new Date(inicio + 'T12:00:00'); cur.setDate(1);
        const end = new Date(hojeStr + 'T12:00:00'); end.setDate(1);
        let guard = 0;
        while (cur <= end && guard < 240) {
          mesesNaJanela.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
          cur.setMonth(cur.getMonth() + 1);
          guard++;
        }
      }
      const pontoDetalhe = ponto
        .slice()
        .sort((a: any, b: any) => String(a.data).localeCompare(String(b.data)))
        .map((p: any) => ({
          data: p.data,
          entrada1: p.entrada1 || null,
          saida1: p.saida1 || null,
          entrada2: p.entrada2 || null,
          saida2: p.saida2 || null,
          horasTrabalhadas: p.horasTrabalhadas || null,
          horasExtras: p.horasExtras || null,
          faltas: p.faltas || null,
          atrasos: p.atrasos || null,
          justificativa: p.justificativa || null,
          tipoDia: p.tipoDia || null,
          fonte: p.fonte || null,
        }));
      const mesesComRegistro = Array.from(new Set(ponto.map((p: any) => String(p.data).slice(0, 7)))).sort() as string[];
      const mesesSemRegistro = mesesNaJanela.filter((m) => !mesesComRegistro.includes(m));
      const cartao = {
        totalRegistros: ponto.length,
        semCartao: ponto.length === 0,
        diasTrabalhados,
        diasComFalta: faltas,
        primeiroRegistro: pontoDetalhe[0]?.data ?? null,
        ultimoRegistro: pontoDetalhe.length ? pontoDetalhe[pontoDetalhe.length - 1].data : null,
        mesesNaJanela,
        mesesComRegistro,
        mesesSemRegistro,
        detalhe: pontoDetalhe,
      };

      // --- Atestados na janela ---
      const atest = atestRows.filter((a: any) => naJanela(a.dataEmissao))
        .sort((a: any, b: any) => String(b.dataEmissao).localeCompare(String(a.dataEmissao)));
      const atestDiasAfast = atest.reduce((acc: number, a: any) => acc + Number(a.diasAfastamento || 0), 0);
      const atestLista = atest.map((a: any) => ({ data: a.dataEmissao, dias: Number(a.diasAfastamento || 0), cid: a.cid || null, tipo: a.tipo || null, documentoUrl: a.documentoUrl || null }));

      // --- Acidentes na janela ---
      const acid = acidRows.filter((a: any) => naJanela(a.dataAcidente))
        .sort((a: any, b: any) => String(b.dataAcidente).localeCompare(String(a.dataAcidente)));
      const acidLista = acid.map((a: any) => ({ data: a.dataAcidente, gravidade: a.gravidade, tipo: a.tipoAcidente, dias: Number(a.diasAfastamento || 0) }));

      // --- Histórico/ocorrências na janela ---
      const hist = histRows.filter((h: any) => naJanela(h.dataEvento))
        .sort((a: any, b: any) => String(b.dataEvento).localeCompare(String(a.dataEvento)))
        .map((h: any) => ({ data: h.dataEvento, tipo: h.tipo, descricao: h.descricao || '' }));

      // --- Veredito (score sugerido) ---
      // Base 100. Penaliza disciplina/assiduidade. Atestados/acidentes são
      // informativos (NÃO penalizam — ausência legalmente protegida), só flag.
      const motivos: { texto: string; tipo: 'negativo' | 'positivo' | 'alerta' }[] = [];
      let score = 100;
      if (advSuspensoes > 0) { score -= advSuspensoes * 25; motivos.push({ texto: `${advSuspensoes} suspensão(ões) disciplinar(es) no período`, tipo: 'negativo' }); }
      if (advEscritas > 0) { score -= advEscritas * 15; motivos.push({ texto: `${advEscritas} advertência(s) por escrito no período`, tipo: 'negativo' }); }
      if (advVerbais > 0) { score -= advVerbais * 8; motivos.push({ texto: `${advVerbais} advertência(s) verbal(is) no período`, tipo: 'negativo' }); }
      if (faltas > 0) { score -= faltas * 6; motivos.push({ texto: `${faltas} falta(s) registrada(s) no período`, tipo: 'negativo' }); }
      if (atrasosDet.length > 0) { score -= atrasosDet.length * 2; motivos.push({ texto: `${atrasosDet.length} atraso(s) (${Math.floor(minutosAtraso / 60)}h${String(minutosAtraso % 60).padStart(2, '0')} acumulados)`, tipo: 'negativo' }); }
      if (atestDiasAfast >= 5) motivos.push({ texto: `${atest.length} atestado(s) somando ${atestDiasAfast} dia(s) de afastamento (não penaliza o score)`, tipo: 'alerta' });
      else if (atest.length > 0) motivos.push({ texto: `${atest.length} atestado(s) no período (não penaliza o score)`, tipo: 'alerta' });
      if (acid.length > 0) motivos.push({ texto: `${acid.length} acidente(s) de trabalho registrado(s) (não penaliza o score)`, tipo: 'alerta' });
      // Transparência sobre o cartão de ponto: faltas/assiduidade só valem o que
      // está importado. Sem cartão (ou com meses faltando) NÃO afirmamos presença.
      if (cartao.semCartao) {
        motivos.push({ texto: 'Sem cartão de ponto importado no período — faltas e assiduidade NÃO puderam ser verificadas (não significa ausência de faltas).', tipo: 'alerta' });
      } else if (mesesSemRegistro.length > 0) {
        motivos.push({ texto: `Cartão de ponto ausente em ${mesesSemRegistro.length} mês(es) do período (${mesesSemRegistro.join(', ')}) — assiduidade pode estar subestimada.`, tipo: 'alerta' });
      }
      if (cartao.totalRegistros > 0 && advLista.length === 0 && faltas === 0 && atrasosDet.length === 0) motivos.push({ texto: 'Sem advertências, faltas ou atrasos no período de experiência', tipo: 'positivo' });
      else if (cartao.totalRegistros > 0 && assiduidadePerc >= 95 && advLista.length === 0) motivos.push({ texto: `Assiduidade excelente (${assiduidadePerc}%) e sem advertências`, tipo: 'positivo' });
      else if (cartao.semCartao && advLista.length === 0) motivos.push({ texto: 'Sem advertências registradas no período.', tipo: 'positivo' });
      score = Math.max(0, Math.min(100, Math.round(score)));

      let nivel: 'efetivar' | 'atencao' | 'prorrogar' | 'desligar';
      let label: string;
      if (score >= 85) { nivel = 'efetivar'; label = 'Recomendado Efetivar'; }
      else if (score >= 70) { nivel = 'atencao'; label = 'Efetivar com Ressalvas'; }
      else if (score >= 50) { nivel = 'prorrogar'; label = 'Avaliar Prorrogação'; }
      else { nivel = 'desligar'; label = 'Não Recomendado — Avaliar Desligamento'; }

      return {
        employee: { id: e.id, nome: e.nomeCompleto, funcao: e.funcao || null, fotoUrl: e.fotoUrl || null },
        periodo: { tipo, inicio, fim1, fim2, status, diasRestantes, diasDecorridos, hoje: hojeStr },
        assiduidade: { diasTrabalhados, faltas, percentual: assiduidadePerc, faltasDetalhe: faltasDet, verificada: cartao.totalRegistros > 0 },
        cartao,
        atrasos: { total: atrasosDet.length, minutos: minutosAtraso, detalhe: atrasosDet },
        advertencias: { verbais: advVerbais, escritas: advEscritas, suspensoes: advSuspensoes, total: adv.length, lista: advLista },
        atestados: { total: atest.length, diasAfastamento: atestDiasAfast, lista: atestLista },
        acidentes: { total: acid.length, lista: acidLista },
        ocorrencias: hist,
        veredito: { score, nivel, label, motivos },
      };
    }),

    // Rev. 2125 — Aloca número sequencial NNN/AAAA do Contrato de Experiência
    // de forma ATÔMICA. Idempotente: se o employee já tem `numeroContratoExperiencia`
    // + `numeroContratoExperienciaAno`, retorna o existente (não consome counter).
    // UPSERT racy-safe via `INSERT ... ON CONFLICT DO UPDATE SET ultimo_seq+=1 RETURNING ultimo_seq`
    // — mesmo padrão de `gerarProximoNumeroScAtomico` em server/routers/compras.ts.
    allocateContratoExperienciaNumero: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      const jaNumero = (emp as any).numeroContratoExperiencia;
      const jaAno = (emp as any).numeroContratoExperienciaAno;
      if (jaNumero && jaAno) {
        return { numero: jaNumero as number, ano: jaAno as number, alreadyAllocated: true };
      }
      const ano = new Date().getFullYear();
      const tipo = 'contrato_experiencia';
      // UPSERT atômico — incrementa ou cria com 1.
      const upserted = await db.execute(sql`
        INSERT INTO contract_counters (company_id, ano, tipo, ultimo_seq)
        VALUES (${input.companyId}, ${ano}, ${tipo}, 1)
        ON CONFLICT (company_id, ano, tipo)
        DO UPDATE SET ultimo_seq = contract_counters.ultimo_seq + 1, atualizado_em = NOW()
        RETURNING ultimo_seq
      `);
      const rows: any[] = (upserted as any)?.rows ?? (upserted as any) ?? [];
      const novoSeq: number = Number(rows[0]?.ultimo_seq ?? rows[0]?.ultimoSeq);
      if (!Number.isFinite(novoSeq) || novoSeq <= 0) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao alocar número do contrato' });
      }
      await db.update(employees).set({
        numeroContratoExperiencia: novoSeq,
        numeroContratoExperienciaAno: ano,
      } as any).where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId)));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'CREATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Número do Contrato de Experiência alocado: ${String(novoSeq).padStart(3, '0')}/${ano}` });
      return { numero: novoSeq, ano, alreadyAllocated: false };
    }),

    // Rev. 2137 — Aloca número sequencial NNN/AAAA do Termo de Responsabilidade
    // de forma ATÔMICA. **NÃO idempotente** (diferente do contrato de experiência):
    // cada chamada consome um número novo, porque o mesmo colaborador pode ter
    // vários termos ativos (entregas de equipamentos/veículos distintos).
    // Counter compartilhado em `contract_counters` com tipo='termo_responsabilidade'.
    allocateTermoResponsabilidadeNumero: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 2137 — ACL explícita: bloqueia consumo de número fora do escopo
      // de empresas do user logado (evita gasto de counter cross-tenant).
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowed.map((c: any) => (typeof c === 'number' ? c : c?.id)).filter((v: any) => typeof v === 'number') as number[];
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa.' });
      }
      const emp = await getEmployeeById(input.employeeId, input.companyId);
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      const ano = new Date().getFullYear();
      const tipo = 'termo_responsabilidade';
      const upserted = await db.execute(sql`
        INSERT INTO contract_counters (company_id, ano, tipo, ultimo_seq)
        VALUES (${input.companyId}, ${ano}, ${tipo}, 1)
        ON CONFLICT (company_id, ano, tipo)
        DO UPDATE SET ultimo_seq = contract_counters.ultimo_seq + 1, atualizado_em = NOW()
        RETURNING ultimo_seq
      `);
      const rows: any[] = (upserted as any)?.rows ?? (upserted as any) ?? [];
      const novoSeq: number = Number(rows[0]?.ultimo_seq ?? rows[0]?.ultimoSeq);
      if (!Number.isFinite(novoSeq) || novoSeq <= 0) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao alocar número do Termo de Responsabilidade' });
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'CREATE', module: 'colaboradores', entityType: 'employee', entityId: input.employeeId, details: `Número do Termo de Responsabilidade alocado: ${String(novoSeq).padStart(3, '0')}/${ano}` });
      return { numero: novoSeq, ano };
    }),

    getTerminationChecklist: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const ids = input.companyIds?.length ? input.companyIds : [input.companyId];
        return db.select().from(employeeTerminationChecklist)
          .where(and(
            sql`${employeeTerminationChecklist.companyId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`,
            eq(employeeTerminationChecklist.employeeId, input.employeeId)
          ))
          .orderBy(employeeTerminationChecklist.id);
      }),

    initTerminationChecklist: protectedProcedure
      .input(z.object({ companyId: z.number(), employeeId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const existing = await db.select({ id: employeeTerminationChecklist.id })
          .from(employeeTerminationChecklist)
          .where(and(eq(employeeTerminationChecklist.companyId, input.companyId), eq(employeeTerminationChecklist.employeeId, input.employeeId)))
          .limit(1);
        if (existing.length > 0) return { success: true, alreadyExists: true };

        const defaultItems = [
          { item: "exame_demissional", label: "Exame Demissional", obrigatorio: 1 },
          { item: "devolucao_epis", label: "Devolução de EPIs", obrigatorio: 1 },
          { item: "devolucao_ferramentas", label: "Devolução de Ferramentas / Patrimônio", obrigatorio: 0 },
          { item: "acerto_ponto", label: "Acerto de Ponto / Banco de Horas", obrigatorio: 1 },
          { item: "trct", label: "Termo de Rescisão (TRCT)", obrigatorio: 1 },
          { item: "entrega_chaves_cracha", label: "Entrega de Chaves / Crachá", obrigatorio: 0 },
          { item: "quitacao_debitos", label: "Quitação de Débitos / Cobranças Pendentes", obrigatorio: 0 },
          { item: "documentacao_seguro", label: "Documentação do Seguro", obrigatorio: 0 },
        ];

        for (const it of defaultItems) {
          await db.insert(employeeTerminationChecklist).values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            item: it.item,
            label: it.label,
            obrigatorio: it.obrigatorio,
            concluido: 0,
          });
        }

        await updateEmployee(input.employeeId, input.companyId, { status: 'Aviso' } as any, { name: ctx.user.name ?? 'Sistema', id: ctx.user.id });

        return { success: true, alreadyExists: false };
      }),

    toggleTerminationChecklistItem: protectedProcedure
      .input(z.object({ id: z.number(), concluido: z.boolean(), observacoes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(employeeTerminationChecklist).set({
          concluido: input.concluido ? 1 : 0,
          concluidoEm: input.concluido ? new Date().toISOString() : null,
          concluidoPor: input.concluido ? (ctx.user.name ?? 'Sistema') : null,
          concluidoPorUserId: input.concluido ? ctx.user.id : null,
          observacoes: input.observacoes ?? null,
        } as any).where(eq(employeeTerminationChecklist.id, input.id));
        return { success: true };
      }),

    checkTerminationReady: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const ids = input.companyIds?.length ? input.companyIds : [input.companyId];
        const items = await db.select().from(employeeTerminationChecklist)
          .where(and(
            sql`${employeeTerminationChecklist.companyId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`,
            eq(employeeTerminationChecklist.employeeId, input.employeeId)
          ));
        if (items.length === 0) return { hasChecklist: false, ready: true, pending: [], total: 0, done: 0 };
        const obrigatoriosPendentes = items.filter(i => i.obrigatorio === 1 && i.concluido === 0);
        return {
          hasChecklist: true,
          ready: obrigatoriosPendentes.length === 0,
          pending: obrigatoriosPendentes.map(i => i.label),
          total: items.length,
          done: items.filter(i => i.concluido === 1).length,
        };
      }),

    normalizarCidades: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem executar esta ação." });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
        const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
        let corrigidos = 0;
        let ignorados = 0;
        for (const cid of ids) {
          const rows = await db.execute(
            sql`SELECT id, cidade FROM employees WHERE "companyId" = ${cid} AND cidade IS NOT NULL AND TRIM(cidade) != '' AND "deletedAt" IS NULL`
          ) as any;
          const list: { id: number; cidade: string }[] = rows?.rows ?? rows ?? [];
          for (const row of list) {
            const normalizada = normalizeCidadeInput(row.cidade);
            if (normalizada && normalizada !== row.cidade) {
              await db.execute(sql`UPDATE employees SET cidade = ${normalizada}, "updatedAt" = NOW() WHERE id = ${row.id}`);
              corrigidos++;
            } else {
              ignorados++;
            }
          }
        }
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "colaboradores", entityType: "employee", entityId: 0, details: `Normalização de cidades executada: ${corrigidos} corrigidos, ${ignorados} já corretos.` });
        return { corrigidos, ignorados, total: corrigidos + ignorados };
      }),
    syncStatus: protectedProcedure.mutation(async () => {
      const result = await syncEmployeeStatus();
      return result;
    }),
    statusLog: protectedProcedure.input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number().optional(),
      limit: z.number().optional(),
    })).query(async ({ input }) => {
      const db = (await import("./db")).getDb();
      const dbInst = await db;
      if (!dbInst) return [];
      const { employeeStatusLog } = await import("../drizzle/schema");
      const { desc, eq, and, inArray } = await import("drizzle-orm");
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const conditions: any[] = [inArray(employeeStatusLog.companyId, ids)];
      if (input.employeeId) conditions.push(eq(employeeStatusLog.employeeId, input.employeeId));
      return dbInst.select().from(employeeStatusLog)
        .where(and(...conditions))
        .orderBy(desc(employeeStatusLog.createdAt))
        .limit(input.limit || 200);
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
  // ORÁCULO — Assistente IA Analítico (admin_master only)
  // ============================================================
  oraculo: oraculoRouter,

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

  // Rev. 2195: Encargos Sociais sobre Folha (upload DCTFWeb + FGTS)
  encargosSociais: encargosSociaisRouter,

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
  financial: financialRouter,
  cheques: chequesRouter,
  chequesRecebidos: chequesRecebidosRouter,
  cartao: cartaoRouter,
  fiscalNotes: fiscalNotesRouter,
  sefaz: sefazRouter,
  nfseEmitidas: nfseEmitidasRouter,
  contabilidade: contabilidadeRouter,
  omie: omieRouter,
  efdIcmsIpi:       efdIcmsIpiRouter,
  efdContribuicoes: efdContribuicoesRouter,
  spedEcf:          spedEcfRouter,
  spedEcd:          spedEcdRouter,

  // ============================================================
  // DESCONTOS CLT (Motor de Cálculo)
  // ============================================================
  pontoDescontos: pontoDescontosRouter,

  // ============================================================
  // PROCESSOS TRABALHISTAS
  // ============================================================
  processos: processosTrabRouter,

  // ============================================================
  // PROCESSOS TRIBUTÁRIOS
  // ============================================================
  processosTributarios: processosTributariosRouter,

  // ============================================================
  // PROCESSOS CÍVEIS
  // ============================================================
  processosCivis: processosCivisRouter,

  // ============================================================
  // OBRAS
  // ============================================================
  obras: router({
    list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input }) => {
      if (input.companyIds && input.companyIds.length > 0) {
        const results = await Promise.all(input.companyIds.map(id => getObras(id)));
        const allRows = results.flat();
        // Consolidate by name when multiple companies (CONSTRUTORAS mode)
        if (input.companyIds.length > 1) {
          const seen = new Map<string, any>();
          for (const r of allRows) {
            const key = (r.nome || '').trim().toUpperCase();
            if (seen.has(key)) {
              const existing = seen.get(key)!;
              if (!existing.obraIds) existing.obraIds = [existing.id];
              existing.obraIds.push(r.id);
            } else {
              seen.set(key, { ...r, obraIds: [r.id] });
            }
          }
          return Array.from(seen.values());
        }
        return allRows;
      }
      return getObras(input.companyId);
    }),
    listActive: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'admin_master';
      if (isAdmin) return getObrasByCompanyActive(input.companyId, input.companyIds);
      const allObras = await getObrasByCompanyActive(input.companyId, input.companyIds);
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id);
      if (allowed === null) return allObras;
      const allowedSet = new Set(allowed);
      return (allObras as any[]).filter((o: any) => allowedSet.has(Number(o.id)));
    }),
    // Rev. 2565 — picker "Obra de Destino" da realocação de mão de obra
    // (/obras/efetivo): TODA obra ativa da empresa fica visível, sem filtro de
    // allowed_obra_ids, para que qualquer engenheiro de campo possa realocar
    // equipe para qualquer obra. Só LISTA (a alocação em lote `transferirEmLote`
    // já não restringe destino por obra). Mantém escopo por empresa + status
    // ativo via getObrasByCompanyActive (isActive=1, deletedAt NULL, Em_Andamento).
    listActiveAll: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input }) => {
      return getObrasByCompanyActive(input.companyId, input.companyIds);
    }),
    listClienteVinculos: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.$client.query(`
        SELECT oc.obra_id AS "obraId", oc.cliente_id AS "clienteId"
        FROM obra_clientes oc
        JOIN obras ON obras.id = oc.obra_id
        WHERE obras."companyId" = $1
      `, [input.companyId]);
      return rows.rows as { obraId: number; clienteId: number }[];
    }),
    listForAlmoxarifado: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), forTransfer: z.boolean().optional() })).query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'admin_master';
      if (isAdmin) return getObrasByCompanyActive(input.companyId, input.companyIds);

      const db = await getDb();

      const userCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedCompanyIds = userCompanies.map((c: any) => c.id);
      if (allowedCompanyIds.length > 0 && !allowedCompanyIds.includes(input.companyId)) {
        return [];
      }

      // forTransfer=true: destino de transferência → mostrar TODAS as obras ativas da empresa.
      // O operador de almoxarifado precisa poder enviar material a qualquer canteiro,
      // mesmo que seu acesso de visualização seja restrito a obras específicas.
      if (input.forTransfer) {
        return getObrasByCompanyActive(input.companyId);
      }

      const userResult = await db.execute(sql`SELECT allowed_obra_ids FROM users WHERE id = ${ctx.user.id}`);
      const userRows: any[] = userResult?.rows ?? userResult ?? [];
      const rawObras = userRows[0]?.allowed_obra_ids;
      let parsedObras: number[] = [];
      try { if (rawObras) parsedObras = JSON.parse(rawObras); } catch {}
      if (parsedObras.length > 0) {
        const obraIds = parsedObras.filter(id => typeof id === 'number' && id > 0);
        if (obraIds.length > 0) {
          const obrasResult = await db.execute(sql`
            SELECT DISTINCT o.id, o.nome, o.codigo, o."companyId"
            FROM obras o
            WHERE o.id IN (${sql.raw(obraIds.join(","))}) AND o."companyId" = ${input.companyId} AND o."deletedAt" IS NULL AND o."isActive" = 1 AND o.status = 'Em_Andamento'
            ORDER BY o.nome
          `);
          const rows = (obrasResult?.rows ?? obrasResult ?? []) as any[];
          if (rows.length > 0) return rows;
        }
      }

      const userEmail = ctx.user.email ?? '';
      if (userEmail) {
        const empResult = await db.execute(sql`SELECT id FROM employees WHERE "companyId" = ${input.companyId} AND email = ${userEmail} AND "deletedAt" IS NULL LIMIT 1`);
        const empRows = empResult?.rows ?? empResult ?? [];
        if (empRows.length > 0) {
          const employeeId = (empRows[0] as any).id;
          const obrasResult = await db.execute(sql`
            SELECT DISTINCT o.id, o.nome, o.codigo, o."companyId"
            FROM obras o
            INNER JOIN obra_funcionarios of2 ON of2."obraId" = o.id AND of2."employeeId" = ${employeeId} AND of2."isActive" = 1
            WHERE o."companyId" = ${input.companyId} AND o."deletedAt" IS NULL AND o."isActive" = 1 AND o.status = 'Em_Andamento'
            ORDER BY o.nome
          `);
          const rows = (obrasResult?.rows ?? obrasResult ?? []) as any[];
          if (rows.length > 0) return rows;
        }
      }

      return getObrasByCompanyActive(input.companyId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => getObraById(input.id)),
    create: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1),
      codigo: z.string().optional(),
      numOrcamento: z.string().optional(),
      snRelogioPonto: z.string().optional(),
      cliente: z.string().optional(),
      responsavel: z.string().optional(),
      responsavelId: z.number().nullable().optional(),
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
      insalubridadeGrau: z.string().optional(),
      periculosidade: z.number().optional(),
      adicionalNoturnoAtivo: z.number().optional(),
      condicoesVigenciaInicio: z.string().nullable().optional(),
      gerenciadoraNome: z.string().nullable().optional(),
      gerenciadoraLogoUrl: z.string().nullable().optional(),
      clienteLogoUrl: z.string().nullable().optional(),
      tipoContrato: z.enum(["global", "mdo", "adm", "projeto"]).optional(),
      percentualGerenciamentoMaterial: z.string().nullable().optional(),
      percentualAdm: z.string().nullable().optional(),
      numeroContrato: z.string().nullable().optional(),
      jornadaTrabalho: z.string().nullable().optional(),
      tstId: z.number().nullable().optional(),
      encarregadoId: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
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
      // Registrar na timeline do colaborador responsável
      if (input.responsavelId && result?.id) {
        try {
          const db = await getDb();
          await db.insert(employeeSiteHistory).values({
            companyId: input.companyId,
            employeeId: input.responsavelId,
            obraId: result.id,
            tipo: "gestor_obra",
            dataInicio: input.dataInicio || new Date().toISOString().split('T')[0],
            observacoes: `Definido como responsável da obra "${input.nome || input.numOrcamento}"`,
            registradoPor: ctx.user.name ?? "Sistema",
            registradoPorUserId: ctx.user.id,
          } as any);
        } catch (e) { /* não bloquear a criação da obra */ }
      }
      return result;
    }),
    // Rev. 2391 — Checa se a obra tem itens em estoque no almoxarifado (qtd > 0).
    // Usado pelo frontend ANTES de mudar o status pra Concluida/Cancelada/Paralisada,
    // e também como guard server-side dentro do `update`.
    // AUTHZ: valida que o user tem acesso à obra (anti-IDOR — sem isso, qualquer
    // user autenticado conseguia listar itens/qtds de qualquer obra de qualquer
    // empresa via deep-link manual).
    checarEstoquePendente: protectedProcedure
      .input(z.object({ obraId: z.number() }))
      .query(async ({ input, ctx }) => {
        const obraInfo = await getObraById(input.obraId);
        if (!obraInfo) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada." });
        const allowedObras = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
        if (allowedObras !== null && !allowedObras.includes(input.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
        }
        const db = await getDb();
        if (!db) return { temPendente: false, total: 0, itens: [] as Array<{ id: number; nome: string; quantidade: number; unidade: string }> };
        const rows = await db.select({
          id: almoxarifadoItens.id,
          nome: almoxarifadoItens.nome,
          quantidadeAtual: almoxarifadoItens.quantidadeAtual,
          unidade: almoxarifadoItens.unidade,
        }).from(almoxarifadoItens)
          .where(and(
            eq(almoxarifadoItens.companyId, (obraInfo as any).companyId),
            eq(almoxarifadoItens.obraId, input.obraId),
            eq(almoxarifadoItens.ativo, true),
            sql`COALESCE(${almoxarifadoItens.quantidadeAtual}, 0) > 0`,
          ));
        const itens = rows.map((r: any) => ({
          id: r.id,
          nome: r.nome,
          quantidade: Number(r.quantidadeAtual ?? 0),
          unidade: r.unidade,
        }));
        return { temPendente: itens.length > 0, total: itens.length, itens };
      }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      codigo: z.string().optional(),
      numOrcamento: z.string().optional(),
      snRelogioPonto: z.string().optional(),
      cliente: z.string().optional(),
      responsavel: z.string().optional(),
      responsavelId: z.number().nullable().optional(),
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
      insalubridadeGrau: z.string().optional(),
      periculosidade: z.number().optional(),
      adicionalNoturnoAtivo: z.number().optional(),
      condicoesVigenciaInicio: z.string().nullable().optional(),
      gerenciadoraNome: z.string().nullable().optional(),
      gerenciadoraLogoUrl: z.string().nullable().optional(),
      clienteLogoUrl: z.string().nullable().optional(),
      tipoContrato: z.enum(["global", "mdo", "adm", "projeto"]).optional(),
      percentualGerenciamentoMaterial: z.string().nullable().optional(),
      percentualAdm: z.string().nullable().optional(),
      numeroContrato: z.string().nullable().optional(),
      jornadaTrabalho: z.string().nullable().optional(),
      tstId: z.number().nullable().optional(),
      encarregadoId: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, responsavelId, ...data } = input;
      // Rev. 2391 — Guard server-side: não permitir TRANSITAR obra pra status encerrador
      // (Concluida/Cancelada/Paralisada) enquanto houver estoque no Almoxarifado dela.
      // Só dispara na MUDANÇA de status — editar cadastro de obra já encerrada com
      // estoque legado segue permitido (paridade com regra do user: "não pode SER
      // finalizada"). AUTHZ + companyId scope no SELECT (defesa em profundidade).
      const STATUS_ENCERRADORES = ["Concluida", "Cancelada", "Paralisada"];
      if (data.status && STATUS_ENCERRADORES.includes(data.status)) {
        const obraAtual = await getObraById(id);
        const statusAtual = (obraAtual as any)?.status;
        const isTransicaoParaEncerrador = !!statusAtual && statusAtual !== data.status;
        if (isTransicaoParaEncerrador) {
          const allowedObras = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
          if (allowedObras !== null && !allowedObras.includes(id)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
          }
          const db = await getDb();
          if (db) {
            const pend: any[] = await db.select({
              id: almoxarifadoItens.id,
              nome: almoxarifadoItens.nome,
              quantidadeAtual: almoxarifadoItens.quantidadeAtual,
              unidade: almoxarifadoItens.unidade,
            }).from(almoxarifadoItens)
              .where(and(
                eq(almoxarifadoItens.companyId, (obraAtual as any).companyId),
                eq(almoxarifadoItens.obraId, id),
                eq(almoxarifadoItens.ativo, true),
                sql`COALESCE(${almoxarifadoItens.quantidadeAtual}, 0) > 0`,
              ));
            if (pend.length > 0) {
              const exemplos = pend.slice(0, 3).map(p => `${p.nome} (${Number(p.quantidadeAtual)} ${p.unidade})`).join(", ");
              const resto = pend.length > 3 ? ` e mais ${pend.length - 3}` : "";
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Não é possível alterar o status para "${data.status}": esta obra ainda tem ${pend.length} item(ns) com estoque no Almoxarifado (${exemplos}${resto}). Transfira o estoque para outro depósito antes de encerrar.`,
              });
            }
          }
        }
      }
      if (data.status && data.status !== "Em_Andamento") {
        await releaseObraSns(id);
        try {
          const db = await getDb();
          await db.execute(sql`UPDATE obra_funcionarios SET "isActive" = 0 WHERE "obraId" = ${id} AND "isActive" = 1`);
        } catch (e) { /* não bloquear o update */ }
      }
      const result = await updateObra(id, { ...data, responsavelId } as any);
      // Registrar na timeline do colaborador responsável se mudou
      if (responsavelId) {
        try {
          const db = await getDb();
          const obraInfo = await getObraById(id);
          // Verificar se já existe entrada de gestor_obra para não duplicar
          const existing = await db.select({ id: employeeSiteHistory.id }).from(employeeSiteHistory)
            .where(and(eq(employeeSiteHistory.employeeId, responsavelId), eq(employeeSiteHistory.obraId, id), eq(employeeSiteHistory.tipo, 'gestor_obra')));
          if (existing.length === 0) {
            await db.insert(employeeSiteHistory).values({
              companyId: obraInfo?.companyId ?? 0,
              employeeId: responsavelId,
              obraId: id,
              tipo: "gestor_obra",
              dataInicio: new Date().toISOString().split('T')[0],
              observacoes: `Definido como responsável da obra "${obraInfo?.nome ?? ''}"`,
              registradoPor: ctx.user.name ?? "Sistema",
              registradoPorUserId: ctx.user.id,
            } as any);
          }
        } catch (e) { /* não bloquear o update da obra */ }
      }
      return result;
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await deleteObra(input.id, ctx.user.id, ctx.user.name ?? "Sistema");
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "DELETE", module: "obras", entityType: "obra", entityId: input.id, details: `Obra excluída (lixeira)` });
      return { success: true };
    }),
    // Mescla dois registros de obra duplicados: migra todos os registros de ponto, inconsistências
    // e registros não identificados da obra-fonte para a obra-destino, depois exclui a fonte.
    // Preserva 100% dos ajustes manuais já feitos — só o obraId muda.
    mesclar: protectedProcedure
      .input(z.object({ sourceId: z.number(), targetId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.sourceId === input.targetId) throw new Error("Obra de origem e destino são a mesma.");
        const db = (await getDb())!;
        // Migra registros de ponto (preserva todos os ajustes manuais, justificativas, etc.)
        await db.execute(sql`UPDATE time_records SET "obraId" = ${input.targetId} WHERE "obraId" = ${input.sourceId}`);
        // Migra inconsistências de ponto
        await db.execute(sql`UPDATE time_inconsistencies SET "obraId" = ${input.targetId} WHERE "obraId" = ${input.sourceId}`);
        // Migra registros DIXI não identificados
        await db.execute(sql`UPDATE unmatched_dixi_records SET "obraId" = ${input.targetId} WHERE "obraId" = ${input.sourceId}`);
        // Migra consolidações de ponto
        await db.execute(sql`UPDATE ponto_consolidacao SET "obraId" = ${input.targetId} WHERE "obraId" = ${input.sourceId}`);
        // Migra alocações de funcionários (evita duplicatas: só atualiza quem não já está na obra destino)
        await db.execute(sql`
          UPDATE employee_allocations SET "obraId" = ${input.targetId}
          WHERE "obraId" = ${input.sourceId}
            AND "employeeId" NOT IN (
              SELECT "employeeId" FROM employee_allocations WHERE "obraId" = ${input.targetId}
            )
        `);
        // Exclui alocações duplicadas que porventura restaram na fonte
        await db.execute(sql`DELETE FROM employee_allocations WHERE "obraId" = ${input.sourceId}`);
        // Soft-delete na obra-fonte
        await deleteObra(input.sourceId, ctx.user.id, ctx.user.name ?? "Sistema");
        await createAuditLog({
          userId: ctx.user.id, userName: ctx.user.name ?? "Sistema",
          action: "UPDATE", module: "obras", entityType: "obra", entityId: input.sourceId,
          details: `Obra mesclada com obra ID ${input.targetId} — todos os registros de ponto, inconsistências e alocações migrados`,
        });
        return { success: true };
      }),
    // Rev. 3451 — Lista clientes vinculados à obra (tabela obra_clientes)
    listClientes: protectedProcedure
      .input(z.object({ obraId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const rows = await db
          .select({
            id: obraClientes.id,
            clienteId: obraClientes.clienteId,
            razaoSocial: clientes.razaoSocial,
            nomeFantasia: clientes.nomeFantasia,
          })
          .from(obraClientes)
          .innerJoin(clientes, eq(clientes.id, obraClientes.clienteId))
          .where(eq(obraClientes.obraId, input.obraId))
          .orderBy(clientes.razaoSocial);
        return rows;
      }),
    // Rev. 3451 — Vincula um cliente adicional à obra (ON CONFLICT DO NOTHING = idempotente)
    // Rev. 3454-hotfix: try/catch expõe o erro PG real (antes só mostrava "Failed query: insert...")
    addCliente: protectedProcedure
      .input(z.object({ obraId: z.number(), clienteId: z.number(), companyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        try {
          await db
            .insert(obraClientes)
            .values({ obraId: input.obraId, clienteId: input.clienteId, companyId: input.companyId })
            .onConflictDoNothing();
        } catch (e: any) {
          const detail = (e?.cause as any)?.message ?? (e?.cause as any)?.detail ?? e?.detail ?? "";
          const msg = detail ? `Erro ao vincular cliente — ${detail}` : (e?.message ?? String(e));
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
        return { success: true };
      }),
    // Rev. 3451 — Remove vínculo de cliente da obra
    removeCliente: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.delete(obraClientes).where(eq(obraClientes.id, input.id));
        return { success: true };
      }),
    // Lista colaboradores com cargos de liderança para o campo "Engenheiro Responsável"
    listLiderancas: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      const LIDERANCA_KEYWORDS = ["engenheiro", "encarregado", "mestre", "coordenador", "supervisor", "gerente", "diretor", "técnico", "tecnico", "arquiteto", "gestor", "lider", "líder"];
      const rows = await db
        .select({ id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao, cargo: employees.cargo, fotoUrl: employees.fotoUrl })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq((employees as any).status, 'Ativo'),
          isNull((employees as any).deletedAt),
          or(...LIDERANCA_KEYWORDS.flatMap(kw => [
            ilike(employees.funcao, `%${kw}%`),
            ilike(employees.cargo, `%${kw}%`),
          ]))
        ))
        .orderBy(employees.nomeCompleto);
      return rows;
    }),
    // Funcionários alocados
    funcionarios: protectedProcedure.input(z.object({ obraId: z.number(), obraIds: z.array(z.number()).optional() })).query(({ input }) => getObraFuncionarios(input.obraId, input.obraIds)),
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
    })).mutation(async ({ input, ctx }) => {
      // Rev. 2480 — authz por escopo de obras permitidas (admin master = null = sem restrição)
      const allowedObras = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowedObras !== null && !allowedObras.includes(input.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para alocar funcionários nesta obra." });
      }
      // === VALIDAÇÃO: bloquear funcionários desligados/lista negra ===
      const db = await getDb();
      if (db) {
        const [emp] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
          .from(employees).where(eq(employees.id, input.employeeId));
        if (emp && ['Desligado', 'Lista_Negra', 'Inativo'].includes(emp.status || '')) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${emp.nomeCompleto} está desligado(a) e não pode ser alocado(a) a obras.` });
        }
      }
      return allocateEmployeeToObra({ ...input, registradoPor: ctx.user.name ?? 'Sistema', registradoPorUserId: ctx.user.id });
    }),
    removeEmployee: protectedProcedure.input(z.object({ employeeId: z.number(), motivo: z.string().optional() })).mutation(async ({ input, ctx }) => {
      // Rev. 2480 — authz: descobrir obra atual e validar escopo permitido
      const allowedObras = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowedObras !== null) {
        const db = await getDb();
        if (db) {
          const [aloc] = await db.select({ obraId: obraFuncionarios.obraId })
            .from(obraFuncionarios)
            .where(and(eq(obraFuncionarios.employeeId, input.employeeId), eq(obraFuncionarios.isActive, 1)));
          if (aloc && !allowedObras.includes(aloc.obraId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para remover funcionários desta obra." });
          }
        }
      }
      return removeEmployeeFromObra(input.employeeId, input.motivo, ctx.user.name ?? 'Sistema', ctx.user.id);
    }),
    // Histórico de alocações de um funcionário
    employeeHistory: protectedProcedure.input(z.object({ employeeId: z.number() })).query(({ input }) => getEmployeeSiteHistory(input.employeeId)),
    // Atualizar condições de trabalho individuais (override por alocação)
    updateObraFuncionarioCondicoes: protectedProcedure.input(z.object({
      id: z.number(),
      insalubridadeOverride: z.enum(['herda', 'none', 'minimo', 'medio', 'maximo']),
      periculosidadeOverride: z.enum(['herda', 'sim', 'nao']),
      adicionalEscolhido: z.enum(['auto', 'insalubridade', 'periculosidade']),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const { obraFuncionarios: of_ } = await import("../drizzle/schema");
      await db.update(of_).set({
        insalubridadeOverride: input.insalubridadeOverride,
        periculosidadeOverride: input.periculosidadeOverride,
        adicionalEscolhido: input.adicionalEscolhido,
      }).where(eq(of_.id, input.id));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "obras", entityType: "obra_funcionario", entityId: input.id, details: `Condições override: ins=${input.insalubridadeOverride} per=${input.periculosidadeOverride} adic=${input.adicionalEscolhido}` });
      return { success: true };
    }),
    // Calcular adicionais de trabalho para um funcionário em um mês
    calcularAdicionaisEmployee: protectedProcedure.input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      mesReferencia: z.string(), // YYYY-MM
    })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const { obraFuncionarios: of_, obras: ob, employees: emp_, systemCriteria: sc } = await import("../drizzle/schema");
      // 1. Alocação ativa (ou alocação no mês de referência)
      const allocs = await db.select({
        id: of_.id, obraId: of_.obraId, companyId: of_.companyId,
        insalubridadeOverride: of_.insalubridadeOverride,
        periculosidadeOverride: of_.periculosidadeOverride,
        adicionalEscolhido: of_.adicionalEscolhido,
      }).from(of_).where(and(eq(of_.employeeId, input.employeeId), eq(of_.isActive, 1)));
      if (allocs.length === 0) return null;
      const alloc = allocs[0];
      // 2. Dados da obra
      const obraRows = await db.select({
        insalubridadeGrau: ob.insalubridadeGrau, periculosidade: ob.periculosidade,
        adicionalNoturnoAtivo: ob.adicionalNoturnoAtivo,
      }).from(ob).where(eq(ob.id, alloc.obraId));
      if (obraRows.length === 0) return null;
      const obra = obraRows[0];
      // 3. Dados do funcionário (salário)
      const empRows = await db.select({ salario: emp_.salario }).from(emp_).where(eq(emp_.id, input.employeeId));
      const salarioBase = empRows.length > 0 ? parseFloat(empRows[0].salario ?? "0") || 0 : 0;
      // 4. Salário mínimo (system_criteria)
      const scRows = await db.select({ valor: sc.valor }).from(sc).where(and(
        eq(sc.companyId, input.companyId),
        eq(sc.chave, "salario_minimo"),
      ));
      const salarioMinimo = scRows.length > 0 ? parseFloat(scRows[0].valor) || 1518 : 1518;
      // 5. Resolver overrides
      const insaGrauEfetivo = (alloc.insalubridadeOverride === 'herda' || !alloc.insalubridadeOverride)
        ? (obra.insalubridadeGrau ?? 'none')
        : alloc.insalubridadeOverride === 'none' ? 'none' : alloc.insalubridadeOverride;
      const periAtivo = (alloc.periculosidadeOverride === 'herda' || !alloc.periculosidadeOverride)
        ? (obra.periculosidade === 1)
        : alloc.periculosidadeOverride === 'sim';
      const notAtivo = obra.adicionalNoturnoAtivo === 1;
      // 6. Calcular valores (CLT Art. 192/193/73)
      const grauPct: Record<string, number> = { minimo: 0.10, medio: 0.20, maximo: 0.40, none: 0 };
      const insalubridadeValor = insaGrauEfetivo !== 'none' ? salarioMinimo * (grauPct[insaGrauEfetivo] ?? 0) : 0;
      const periculosidadeValor = periAtivo ? salarioBase * 0.30 : 0;
      // Noturno: estimativa — 20% sobre valor de 1 hora noturna (simplificado, sem horas reais nesse cálculo)
      const salarioHora = salarioBase / 220;
      const adicionalNoturnoEstimado = notAtivo ? salarioHora * 1.20 : 0; // valor/hora adicional
      // 7. Determinar adicional automático (mais vantajoso; não acumulam entre si — CLT Art. 193 §2)
      let adicionalSugerido: 'insalubridade' | 'periculosidade' | 'nenhum' = 'nenhum';
      if (insalubridadeValor > 0 && periculosidadeValor > 0)
        adicionalSugerido = insalubridadeValor >= periculosidadeValor ? 'insalubridade' : 'periculosidade';
      else if (insalubridadeValor > 0) adicionalSugerido = 'insalubridade';
      else if (periculosidadeValor > 0) adicionalSugerido = 'periculosidade';
      const escolha = alloc.adicionalEscolhido ?? 'auto';
      const adicionalFinal = escolha === 'auto' ? adicionalSugerido
        : escolha === 'insalubridade' ? (insalubridadeValor > 0 ? 'insalubridade' : 'nenhum')
        : escolha === 'periculosidade' ? (periculosidadeValor > 0 ? 'periculosidade' : 'nenhum')
        : 'nenhum';
      const valorPrincipal = adicionalFinal === 'insalubridade' ? insalubridadeValor
        : adicionalFinal === 'periculosidade' ? periculosidadeValor : 0;
      // Alerta: funcionário escolheu manualmente o menos vantajoso
      const escolhaContraClt = (escolha === 'insalubridade' && periculosidadeValor > insalubridadeValor && periculosidadeValor > 0)
        || (escolha === 'periculosidade' && insalubridadeValor > periculosidadeValor && insalubridadeValor > 0);
      return {
        insaGrauEfetivo, periAtivo, notAtivo,
        insalubridadeValor, periculosidadeValor, adicionalNoturnoEstimado,
        adicionalSugerido, adicionalFinal, valorPrincipal, salarioMinimo, salarioBase,
        escolha, escolhaContraClt,
        obraFuncionariosId: alloc.id,
        insalubridadeOverride: alloc.insalubridadeOverride ?? 'herda',
        periculosidadeOverride: alloc.periculosidadeOverride ?? 'herda',
        adicionalEscolhido: alloc.adicionalEscolhido ?? 'auto',
      };
    }),
    // Efetivo atual por obra
    efetivoPorObra: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getEfetivoPorObra(input.companyId, input.companyIds)),
    // Efetivo histórico (evolução mensal)
    efetivoHistorico: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), meses: z.number().optional() })).query(({ input }) => getEfetivoHistorico(input.companyId, input.meses, input.companyIds)),
    // Funcionários sem obra
    semObra: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getFuncionariosSemObra(input.companyId, input.companyIds)),
    // Rev. 2938 — Integrações + NRs por funcionário em escopo de empresa (abas "Todos"/"Sem Obra"). Read-only.
    // ACL espelha terceiros._assertCompanyAccess (canônico): admin/admin_master bypass; vínculos REAIS de
    // user_companies (sem o fallback LIMIT 1 do getCompaniesForUser); SEM vínculo → acesso global (grupo/módulo).
    // Nunca confia no companyId/companyIds do cliente sem checar (evita IDOR cross-tenant).
    integracoesNrs: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') {
        const links = await getUserCompanyLinks(ctx.user.id);
        const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === 'number') as number[];
        if (allowedIds.length > 0) {
          const allowedSet = new Set<number>(allowedIds);
          const requested = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
          for (const cid of requested) {
            if (!allowedSet.has(cid)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta empresa.' });
          }
        }
      }
      return getIntegracoesNrsPorFuncionario(input.companyId, input.companyIds);
    }),
    equipeObra: protectedProcedure.input(z.object({ obraId: z.number(), companyId: z.number(), obraIds: z.array(z.number()).optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getEquipeObra(input.obraId, input.companyId, input.obraIds, input.companyIds)),
    // Rev. 1558 — Documentos SST (ASO + Treinamentos) por lote de funcionários,
    // usado na aba Efetivo do Planejamento. Devolve, por employeeId:
    // { aso: { id, tipo, dataExame, dataValidade, resultado, status, temPdf },
    //   treinamentos: [{ id, nome, norma, dataValidade, statusTreinamento, temPdf }],
    //   integracao: { id, dataRealizacao, dataValidade, status, temPdf } | null }
    // Rev. 1590 — Adicionado campo `integracao` (último registro aprovado da
    // Integração de Segurança SST) com flag `vence_em_breve` quando faltam
    // ≤30 dias para o vencimento — usado pelo módulo Planejamento (engenheiro)
    // para alerta antecipado de reciclagem.
    docsSstFuncionarios: protectedProcedure.input(z.object({
      companyId: z.number(),
      employeeIds: z.array(z.number()),
    })).query(async ({ input }) => {
      const result: Record<number, { aso: any | null; treinamentos: any[]; integracao: any | null }> = {};
      if (input.employeeIds.length === 0) return result;
      const db = (await getDb())!;
      const today = new Date().toISOString().slice(0, 10);
      // Rev. 1590 — limite p/ "vence_em_breve": 30 dias
      const limite30 = new Date();
      limite30.setDate(limite30.getDate() + 30);
      const limite30Str = limite30.toISOString().slice(0, 10);

      const asoRows = await db.select({
        id: asos.id, employeeId: asos.employeeId, tipo: asos.tipo,
        dataExame: asos.dataExame, dataValidade: asos.dataValidade,
        resultado: asos.resultado, documentoUrl: asos.documentoUrl,
      }).from(asos).where(and(
        eq(asos.companyId, input.companyId),
        inArray(asos.employeeId, input.employeeIds),
        isNull(asos.deletedAt),
      )).orderBy(sql`${asos.dataExame} DESC`);

      const trainRows = await db.select({
        id: trainings.id, employeeId: trainings.employeeId,
        nome: trainings.nome, norma: trainings.norma,
        dataRealizacao: trainings.dataRealizacao,
        dataValidade: trainings.dataValidade,
        statusTreinamento: trainings.statusTreinamento,
        certificadoUrl: trainings.certificadoUrl,
      }).from(trainings).where(and(
        eq(trainings.companyId, input.companyId),
        inArray(trainings.employeeId, input.employeeIds),
        isNull(trainings.deletedAt),
      )).orderBy(sql`${trainings.dataRealizacao} DESC`);

      // Rev. 1590 — Integração de Segurança SST.
      // Rev. 1714 — fonte CORRIGIDA: o módulo "Integração SST" grava em
      // `employee_integrations` (router integracoes.ts), não em
      // `sst_integracao_registros`. A consulta antiga filtrava por
      // status='aprovado' numa tabela paralela que ficava vazia, e a aba
      // Efetivo do Planejamento sempre mostrava "Sem integração registrada"
      // mesmo quando o módulo SST exibia o registro. Agora pegamos o último
      // registro por funcionário (DESC dataRealizacao) e classificamos pelo
      // dataVencimento — mesma regra usada pelo módulo (vigente / vence_em_breve
      // ≤30d / vencido).
      const integRows = await db.select({
        id: employeeIntegrations.id,
        employeeId: employeeIntegrations.employeeId,
        dataRealizacao: employeeIntegrations.dataRealizacao,
        dataVencimento: employeeIntegrations.dataVencimento,
        evidencia: employeeIntegrations.evidencia,
      }).from(employeeIntegrations).where(and(
        eq(employeeIntegrations.companyId, input.companyId),
        inArray(employeeIntegrations.employeeId, input.employeeIds),
      )).orderBy(sql`${employeeIntegrations.dataRealizacao} DESC`);

      for (const eid of input.employeeIds) result[eid] = { aso: null, treinamentos: [], integracao: null };
      for (const a of asoRows) {
        const slot = result[a.employeeId]; if (!slot || slot.aso) continue;
        slot.aso = {
          id: a.id, tipo: a.tipo, dataExame: a.dataExame, dataValidade: a.dataValidade,
          resultado: a.resultado, temPdf: !!a.documentoUrl,
          status: (a.dataValidade && a.dataValidade < today) ? "vencido" : "vigente",
        };
      }
      for (const t of trainRows) {
        const slot = result[t.employeeId]; if (!slot) continue;
        slot.treinamentos.push({
          id: t.id, nome: t.nome, norma: t.norma,
          dataRealizacao: t.dataRealizacao, dataValidade: t.dataValidade,
          statusTreinamento: t.statusTreinamento, temPdf: !!t.certificadoUrl,
        });
      }
      for (const i of integRows) {
        const slot = result[i.employeeId]; if (!slot || slot.integracao) continue;
        const dv = i.dataVencimento ? String(i.dataVencimento).slice(0, 10) : null;
        const status = !dv ? "vigente"
          : dv < today ? "vencido"
          : dv <= limite30Str ? "vence_em_breve"
          : "vigente";
        slot.integracao = {
          id: i.id,
          dataRealizacao: i.dataRealizacao ? String(i.dataRealizacao).slice(0, 10) : null,
          dataValidade: dv,
          status,
          temPdf: !!i.evidencia,
        };
      }
      return result;
    }),
    efetivoDashMensal: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesRef: z.string() })).query(({ input }) => getEfetivoDashboardMensal(input.companyId, input.mesRef, input.companyIds)),
    // Transferência em lote
    transferirEmLote: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraDestinoId: z.number(),
      employeeIds: z.array(z.number()),
      dataInicio: z.string(),
      motivo: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Rev. 1358 — bloquear funcionários desligados/Lista_Negra/Inativo também no caminho de lote
      const db = await getDb();
      if (db && input.employeeIds.length > 0) {
        const rows = await db.select({ id: employees.id, status: employees.status, nomeCompleto: employees.nomeCompleto })
          .from(employees).where(inArray(employees.id, input.employeeIds));
        const bloqueados = rows.filter(r => ['Desligado', 'Lista_Negra', 'Inativo'].includes(r.status || ''));
        if (bloqueados.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${bloqueados.length} funcionário(s) não podem ser alocado(s) (desligado/lista negra/inativo): ${bloqueados.slice(0, 3).map(b => b.nomeCompleto).join(", ")}${bloqueados.length > 3 ? "..." : ""}`,
          });
        }
      }
      return transferirFuncionariosEmLote({ ...input, registradoPor: ctx.user.name ?? 'Sistema', registradoPorUserId: ctx.user.id });
    }),
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
      forceShare: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const check = await checkSnAvailability(input.companyId, input.sn, input.obraId);
      if (!check.available && !input.forceShare) {
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
    inconsistencias: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getInconsistenciasPendentes(input.companyId, input.companyIds)),
    inconsistenciasCount: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => countInconsistenciasPendentes(input.companyId, input.companyIds)),
    resolverEsporadico: protectedProcedure.input(z.object({ id: z.number(), observacoes: z.string().optional() })).mutation(({ input, ctx }) => resolverInconsistenciaEsporadico(input.id, ctx.user.id, ctx.user.name ?? 'Sistema', input.observacoes)),
    resolverTransferir: protectedProcedure.input(z.object({ id: z.number(), observacoes: z.string().optional() })).mutation(({ input, ctx }) => resolverInconsistenciaTransferir(input.id, ctx.user.id, ctx.user.name ?? 'Sistema', input.observacoes)),
    ondeTrabalhou: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(), mesAno: z.string() })).query(({ input }) => getOndeTrabalhouNoMes(input.companyId, input.employeeId, input.mesAno)),
  }),

  // ============================================================
  // LOGIN COM SENHA & GERENCIAMENTO DE USUÁRIOS
  // ============================================================
  userManagement: router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      // Rev. 4041 — gate: só admin/admin_master/adm_cliente podem listar usuários
      // (endpoint não tinha NENHUM check — qualquer usuário logado via API direta
      // conseguia listar nome/email/role/empresas de TODOS os usuários do sistema).
      const role = ctx.user.role;
      if (role !== "admin" && role !== "admin_master" && role !== "adm_cliente") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para listar usuários" });
      }
      const allUsers = await getAllUsers();
      const usersWithCompanies = await Promise.all(allUsers.map(async (u: any) => {
        const links = await getUserCompanyLinks(u.id);
        let parsedObras: number[] = [];
        try { if (u.allowedObraIds) parsedObras = JSON.parse(u.allowedObraIds); } catch {}
        return { ...u, password: undefined, companyIds: links.map((l: any) => l.companyId), allowedObraIds: parsedObras };
      }));
      // Adm Cliente enxerga só usuários vinculados às SUAS empresas (isolamento cross-tenant).
      if (role === "adm_cliente") {
        const callerCompanyIds = new Set((await getCompaniesForUser(ctx.user.id, role)).map((c: any) => Number(c.id)));
        return usersWithCompanies.filter((u: any) => (u.companyIds || []).some((cid: number) => callerCompanyIds.has(Number(cid))));
      }
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
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master' && ctx.user.role !== 'adm_cliente') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar acesso a empresas' });
      }
      if (ctx.user.role === 'adm_cliente') {
        const callerCompanies = await assertAdmClienteTargetScope(ctx.user.id, input.userId);
        // Adm Cliente não pode conceder acesso a empresas fora do seu próprio escopo.
        if (input.companyIds.some(id => !callerCompanies.includes(Number(id)))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você só pode conceder acesso às suas próprias empresas' });
        }
      }
      await setUserCompanies(input.userId, input.companyIds);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_companies', entityId: input.userId, details: `Empresas do usuário atualizadas: [${input.companyIds.join(', ')}]` });
      return { success: true };
    }),
    setUserObras: protectedProcedure.input(z.object({
      userId: z.number(),
      obraIds: z.array(z.number()),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master' && ctx.user.role !== 'adm_cliente') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar acesso a obras' });
      }
      if (ctx.user.role === 'adm_cliente') {
        await assertAdmClienteTargetScope(ctx.user.id, input.userId);
      }
      const db = await getDb();
      await db.execute(sql`UPDATE users SET allowed_obra_ids = ${JSON.stringify(input.obraIds)} WHERE id = ${input.userId}`);
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_obras', entityId: input.userId, details: `Obras do usuário atualizadas: [${input.obraIds.join(', ')}]` });
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
    // Definir acesso detalhado por módulo (novo sistema — armazena JSON rico em users.modulesAccess)
    // Aceita o formato novo {level, pages, sensitiveHidden} por módulo (z.any() para flexibilidade)
    setUserModuleAccess: protectedProcedure.input(z.object({
      userId: z.number(),
      moduleAccess: z.record(z.string(), z.any()),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode gerenciar permissões' });
      }
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      // Remove entradas nulas (módulos desativados)
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input.moduleAccess)) {
        if (v != null) clean[k] = v;
      }
      await db.update(users).set({ modulesAccess: JSON.stringify(clean) }).where(eq(users.id, input.userId));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_modules', entityId: input.userId, details: `Módulos do usuário atualizados: ${Object.keys(clean).join(', ')}` });
      return { success: true };
    }),
    // Obter permissões do usuário logado (para sidebar/frontend)
    getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
      // Admin Master tem acesso total (allowedObraIds = null => sem restrição)
      if (ctx.user.role === 'admin_master') {
        return { isAdminMaster: true, isAdmin: false, isAdmCliente: false, permissions: [], groupPermissions: null, moduleAccess: {} as Record<string, string>, allowedObraIds: null as number[] | null };
      }
      const perms = await getUserPermissions(ctx.user.id);
      // Obras liberadas (helper centralizado): null => sem restrição (role=admin); array => obras permitidas (vazio = nenhuma).
      const { getEffectiveAllowedObraIds } = await import("./db");
      const allowedObraIds = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      // Buscar permissões de grupo do usuário
      const groupPerms = await getUserEffectiveGroupPermissions(ctx.user.id);
      // moduleAccess: prioridade = grupo (novo sistema) > individual > legado
      let moduleAccess: Record<string, unknown> = {};
      try {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (db) {
          const { users, userGroups, userGroupMembers } = await import("../drizzle/schema");
          const { eq, inArray } = await import("drizzle-orm");
          // 1. Verificar se algum grupo do usuário tem moduleAccess
          if (groupPerms.groups.length > 0) {
            const groupIds = groupPerms.groups.map((g: any) => g.id as number);
            const groupRows = await db.select({ id: userGroups.id, moduleAccess: (userGroups as any).moduleAccess }).from(userGroups).where(inArray(userGroups.id, groupIds));
            for (const gr of groupRows) {
              if (gr.moduleAccess) {
                try {
                  const parsed = JSON.parse(gr.moduleAccess as string);
                  // Merge: grupo define moduleAccess
                  Object.assign(moduleAccess, parsed);
                } catch {}
              }
            }
          }
          // Rastrear se o moduleAccess veio de algum grupo (novo sistema)
          const groupHasNewSystem = Object.keys(moduleAccess).length > 0;
          // 2. Fallback: moduleAccess individual do usuário
          if (Object.keys(moduleAccess).length === 0) {
            const [u] = await db.select({ modulesAccess: users.modulesAccess }).from(users).where(eq(users.id, ctx.user.id));
            if (u?.modulesAccess) moduleAccess = JSON.parse(u.modulesAccess);
          }
          // Expor o flag para o frontend
          (moduleAccess as any).__groupHasNewSystem = groupHasNewSystem && groupPerms.groups.length > 0;
        }
      } catch {}
      return {
        isAdminMaster: false,
        isAdmin: ctx.user.role === 'admin',
        isAdmCliente: ctx.user.role === 'adm_cliente',
        moduleAccess,
        allowedObraIds,
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
      role: z.enum(["user", "admin", "admin_master", "adm_cliente"]).default("user"),
      password: z.string().optional(),
      companyIds: z.array(z.number()).optional(),
    })).mutation(async ({ input, ctx }) => {
      // Rev. 4041 — CRÍTICO: endpoint não tinha NENHUM check de role — qualquer
      // usuário autenticado (mesmo role "user") conseguia criar uma conta
      // admin_master via chamada direta da API (escalonamento de privilégio).
      const callerRole = ctx.user.role;
      if (callerRole !== "admin" && callerRole !== "admin_master" && callerRole !== "adm_cliente") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para criar usuários" });
      }
      if (input.role === "admin_master" && callerRole !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode criar outro Admin Master" });
      }
      if (input.role === "adm_cliente" && callerRole !== "admin_master" && callerRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode criar um Adm Cliente" });
      }
      let companyIds = input.companyIds;
      if (callerRole === "adm_cliente") {
        // Adm Cliente só cria usuários comuns, restritos às SUAS próprias empresas.
        if (input.role !== "user") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Adm Cliente só pode criar usuários com perfil Usuário" });
        }
        const callerCompanies = (await getCompaniesForUser(ctx.user.id, callerRole)).map((c: any) => Number(c.id));
        if (companyIds && companyIds.length > 0) {
          if (companyIds.some(id => !callerCompanies.includes(Number(id)))) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode vincular usuários às suas próprias empresas" });
          }
        } else {
          companyIds = callerCompanies;
        }
      }
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
      }).returning();
      const newUserId = Number(result[0].id);
      // Se companyIds foram passados, vincular o usuário às empresas
      if (companyIds && companyIds.length > 0) {
        await setUserCompanies(newUserId, companyIds);
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'CREATE', module: 'usuarios', entityType: 'user', entityId: newUserId, details: `Usuário criado: ${input.username} (perfil: ${input.role})` });
      return { id: newUserId, username: input.username, defaultPassword: defaultPwd };
    }),
    loginLocal: publicProcedure.input(z.object({
      username: z.string(), password: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const bcrypt = await import("bcryptjs");
      const { getDb, withDbRetry } = await import("./db");
      let db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq, or, sql } = await import("drizzle-orm");
      const loginInput = input.username.trim();
      // Rev. 1661 — Busca case-insensitive E accent-insensitive (Myriélle = myrielle)
      // Normaliza acentos no input em JS e no banco via translate() (evita exigir extensão unaccent)
      const ACENTOS_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇñÑ';
      const ACENTOS_TO   = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUCnN';
      const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const loginNorm = stripAccents(loginInput).toLowerCase();
      // Buscar por username OU email (case-insensitive + accent-insensitive)
      // Rev. 2774 — retry transiente: o 1º request após o Neon hibernar estourava
      // "timeout exceeded when trying to connect" e derrubava o login. `withDbRetry`
      // reseta o pool e re-tenta; refaz `getDb()` a cada tentativa (o reset zera o _db).
      const results = await withDbRetry(async () => {
        db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        return db.select().from(users).where(
          or(
            sql`LOWER(translate(COALESCE(${users.username},''), ${ACENTOS_FROM}, ${ACENTOS_TO})) = ${loginNorm}`,
            sql`LOWER(translate(COALESCE(${users.email},''),    ${ACENTOS_FROM}, ${ACENTOS_TO})) = ${loginNorm}`
          )
        );
      });
      // Filtrar usuários deletados e sem senha
      const activeResults = results.filter(u => !u.deletedAt);
      const candidatos = activeResults.filter(u => !!u.password);
      if (candidatos.length === 0) {
        console.error(`[Login] Falha: '${loginInput}' - encontrados: ${results.length}, ativos: ${activeResults.length}, com senha: 0`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      }
      // Rev. 1661 — Mitigação de colisão por normalização de acentos:
      // 1) Prioriza match EXATO (case+acento idêntico) em username ou email
      // 2) Senão, prioriza loginMethod='local'
      // 3) Senão, valida a senha contra TODOS os candidatos — autentica APENAS quem bater
      //    (impede login no usuário errado quando há colisão myrielle/myriélle)
      const exato = candidatos.find(u => u.username === loginInput || u.email === loginInput);
      const ordenados = exato
        ? [exato, ...candidatos.filter(u => u.id !== exato.id)]
        : [...candidatos.filter(u => u.loginMethod === 'local'), ...candidatos.filter(u => u.loginMethod !== 'local')];
      let user: typeof candidatos[number] | undefined;
      for (const cand of ordenados) {
        if (bcrypt.compareSync(input.password, cand.password!)) { user = cand; break; }
      }
      if (!user) {
        console.error(`[Login] Senha inválida para: '${loginInput}' (candidatos: ${candidatos.length}, ids: ${candidatos.map(c => c.id).join(',')})`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      }
      if (candidatos.length > 1) {
        console.warn(`[Login] Colisão de identificador normalizado: '${loginInput}' bateu em ${candidatos.length} contas — autenticado userId=${user.id} via senha exata`);
      }
      // Rev. 3159 — usuário DESLIGADO não acessa o sistema (senha correta, mas acesso revogado).
      if ((user as any).status === 'desligado') {
        console.warn(`[Login] Acesso bloqueado (status=desligado): userId=${user.id} '${loginInput}'`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Acesso desativado. Procure o administrador do sistema." });
      }
      // Rev. 4043 — SaaS: empresa-cliente suspensa (companies.isActive=0) bloqueia
      // login de `adm_cliente`/`user` dela — NÃO se aplica a admin/admin_master
      // (equipe interna FC, acesso global independente de assinatura).
      if (user.role === 'adm_cliente' || user.role === 'user') {
        try {
          const userCompaniesList = await getCompaniesForUser(user.id, user.role);
          if (userCompaniesList.length > 0 && userCompaniesList.every((c: any) => c.isActive === 0)) {
            console.warn(`[Login] Acesso bloqueado (empresa suspensa): userId=${user.id} '${loginInput}'`);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Assinatura suspensa. Entre em contato com o suporte para regularizar o pagamento." });
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.error(`[Login] Falha ao checar suspensão de empresa (userId=${user.id}):`, e);
        }
      }
      // Usar o SDK para gerar o token no formato correto (openId, appId, name)
      const { sdk } = await import("./_core/sdk");
      const token = await sdk.createSessionToken(user.openId, { expiresInMs: 7 * 24 * 60 * 60 * 1000, name: user.name || user.username || user.openId });
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
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master" && ctx.user.role !== "adm_cliente") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode resetar senhas" });
      if (ctx.user.role === "adm_cliente") {
        const { getDb: getDbScope } = await import("./db");
        const dbScope = await getDbScope();
        if (!dbScope) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { users: usersScope } = await import("../drizzle/schema");
        const { eq: eqScope } = await import("drizzle-orm");
        const [alvo] = await dbScope.select().from(usersScope).where(eqScope(usersScope.id, input.userId));
        if (!alvo || alvo.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Adm Cliente só pode resetar senha de usuários comuns" });
        await assertAdmClienteTargetScope(ctx.user.id, input.userId);
      }
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
      role: z.enum(["user", "admin", "admin_master", "adm_cliente"]),
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
      role: z.enum(["admin", "user", "admin_master", "adm_cliente"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master" && ctx.user.role !== "adm_cliente") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode editar usuários" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (ctx.user.role === "adm_cliente") {
        const [alvo] = await db.select().from(users).where(eq(users.id, input.userId));
        if (!alvo || alvo.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Adm Cliente só pode editar usuários comuns" });
        await assertAdmClienteTargetScope(ctx.user.id, input.userId);
        if (input.role && input.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Adm Cliente não pode alterar perfis" });
      }
      const updateData: any = {};
      if (input.name) updateData.name = input.name;
      if (input.email) updateData.email = input.email;
      if (input.username) updateData.username = input.username;
      if (input.role) {
        // Admin Master pode definir qualquer perfil; Admin pode definir user, admin ou adm_cliente (não admin_master)
        if (ctx.user.role === "admin_master") {
          updateData.role = input.role;
        } else if (ctx.user.role === "admin") {
          if (input.role === "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode promover para Admin Master" });
          updateData.role = input.role;
        } else if (ctx.user.role === "adm_cliente") {
          updateData.role = input.role; // já validado acima que só pode ser "user"
        } else {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para alterar perfil" });
        }
      }
      if (input.newPassword) {
        if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master" && ctx.user.role !== "adm_cliente") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode alterar senhas" });
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
    // Rev. 3159 — liga/desliga o ACESSO de um usuário ao sistema (não exclui — para isso há deleteUser/lixeira).
    setUserStatus: protectedProcedure.input(z.object({
      userId: z.number(),
      status: z.enum(["ativo", "desligado"]),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master" && ctx.user.role !== "adm_cliente") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin pode alterar o acesso de usuários" });
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode desativar o próprio acesso" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [alvo] = await db.select().from(users).where(eq(users.id, input.userId));
      if (!alvo) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      // Admin (não-master) não pode desativar um Admin Master.
      if (ctx.user.role === "admin" && alvo.role === "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode alterar o acesso de outro Admin Master" });
      if (ctx.user.role === "adm_cliente") {
        if (alvo.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Adm Cliente só pode alterar o acesso de usuários comuns" });
        await assertAdmClienteTargetScope(ctx.user.id, input.userId);
      }
      await db.update(users).set({ status: input.status } as any).where(eq(users.id, input.userId));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "usuarios", entityType: "user", entityId: input.userId, details: `Acesso do usuário ${alvo.name || alvo.username || input.userId} alterado para: ${input.status}` });
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

    // Rev. 3841 — Configurações SMTP editáveis via UI (admin_master only)
    getSmtpConfig: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin master pode ver configurações SMTP" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = await db.$client.query(`SELECT host, port, email, updated_at, updated_by FROM smtp_config ORDER BY id DESC LIMIT 1`);
      if (rows.rows.length === 0) {
        // Retorna os valores atuais das variáveis de ambiente (sem a senha)
        const { ENV } = await import("./_core/env");
        return { host: ENV.smtpHost || "mail.fcengenhariacivil.com.br", port: ENV.smtpPort || 465, email: ENV.smtpEmail || "", hasPassword: !!ENV.smtpPassword, updatedAt: null, updatedBy: null };
      }
      const r = rows.rows[0];
      return { host: r.host as string, port: r.port as number, email: r.email as string, hasPassword: !!(r.password || ""), updatedAt: r.updated_at as string | null, updatedBy: r.updated_by as string | null };
    }),

    saveSmtpConfig: protectedProcedure.input(z.object({
      host: z.string().min(1, "Host obrigatório"),
      port: z.number().int().min(1).max(65535),
      email: z.string().email("E-mail inválido"),
      password: z.string().optional(), // vazio = não altera a senha atual
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin master pode alterar configurações SMTP" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      // Busca senha atual se não for informada nova senha
      let finalPassword = input.password ?? "";
      if (!finalPassword) {
        const existing = await db.$client.query(`SELECT password FROM smtp_config ORDER BY id DESC LIMIT 1`);
        if (existing.rows.length > 0) {
          finalPassword = (existing.rows[0].password as string) || "";
        }
      }
      // Upsert: sempre mantém apenas 1 linha (delete + insert ou update)
      const existing = await db.$client.query(`SELECT id FROM smtp_config ORDER BY id DESC LIMIT 1`);
      if (existing.rows.length > 0) {
        await db.$client.query(
          `UPDATE smtp_config SET host=$1, port=$2, email=$3, password=$4, updated_at=now(), updated_by=$5 WHERE id=$6`,
          [input.host, input.port, input.email, finalPassword, ctx.user.name || ctx.user.username || "Sistema", existing.rows[0].id]
        );
      } else {
        await db.$client.query(
          `INSERT INTO smtp_config (host, port, email, password, updated_at, updated_by) VALUES ($1,$2,$3,$4,now(),$5)`,
          [input.host, input.port, input.email, finalPassword, ctx.user.name || ctx.user.username || "Sistema"]
        );
      }
      // Invalida o transporter do SMTP para que seja recriado com as novas credenciais
      const smtpSvc = await import("./services/smtpService");
      smtpSvc.invalidateSmtpTransporter();
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "smtp_config", entityId: 0, details: `SMTP atualizado: host=${input.host}, port=${input.port}, email=${input.email}` });
      return { success: true };
    }),

    testSmtpConfig: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin master pode testar SMTP" });
      const { verificarConexaoSMTP } = await import("./services/smtpService");
      return await verificarConexaoSMTP();
    }),

    // Rev. 3845 — Template padrão FC para planilhas XLSX
    getXlsxTemplateConfig: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const rows = await db.$client.query(
          `SELECT titulo_empresa, revisao, cor_cabecalho, aprovado_por, vigente_desde, notas, updated_at, updated_by
             FROM xlsx_template_config
            WHERE company_id = $1
            ORDER BY id DESC LIMIT 1`,
          [input.companyId]
        );
        if (rows.rows.length === 0) {
          return { tituloEmpresa: "FC ENGENHARIA E CONSTRUÇÃO LTDA", revisao: "Rev. 01", corCabecalho: "7030A0", aprovadoPor: "Sistema", vigentDesde: null, notas: null, updatedAt: null, updatedBy: null };
        }
        const r = rows.rows[0] as any;
        return { tituloEmpresa: r.titulo_empresa as string, revisao: r.revisao as string, corCabecalho: r.cor_cabecalho as string, aprovadoPor: r.aprovado_por as string | null, vigentDesde: r.vigente_desde as string | null, notas: r.notas as string | null, updatedAt: r.updated_at as string | null, updatedBy: r.updated_by as string | null };
      }),

    saveXlsxTemplateConfig: protectedProcedure
      .input(z.object({
        companyId:     z.number(),
        tituloEmpresa: z.string().min(1),
        revisao:       z.string().min(1),
        corCabecalho:  z.string().regex(/^[0-9A-Fa-f]{6}$/, "Cor deve ser hex 6 dígitos"),
        aprovadoPor:   z.string().optional(),
        vigentDesde:   z.string().optional(),
        notas:         z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const existing = await db.$client.query(`SELECT id FROM xlsx_template_config WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [input.companyId]);
        const by = ctx.user.name || ctx.user.username || "Sistema";
        if (existing.rows.length > 0) {
          await db.$client.query(
            `UPDATE xlsx_template_config SET titulo_empresa=$1, revisao=$2, cor_cabecalho=$3, aprovado_por=$4, vigente_desde=$5, notas=$6, updated_at=now(), updated_by=$7 WHERE id=$8`,
            [input.tituloEmpresa, input.revisao, input.corCabecalho, input.aprovadoPor ?? null, input.vigentDesde ?? null, input.notas ?? null, by, existing.rows[0].id]
          );
        } else {
          await db.$client.query(
            `INSERT INTO xlsx_template_config (company_id, titulo_empresa, revisao, cor_cabecalho, aprovado_por, vigente_desde, notas, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8)`,
            [input.companyId, input.tituloEmpresa, input.revisao, input.corCabecalho, input.aprovadoPor ?? null, input.vigentDesde ?? null, input.notas ?? null, by]
          );
        }
        // Invalida cache do serviço
        const svc = await import("./services/excelFcTemplate");
        svc.invalidateFcXlsxConfigCache();
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "xlsx_template_config", entityId: input.companyId, details: `Template XLSX atualizado: revisao=${input.revisao}, cor=${input.corCabecalho}` });
        return { success: true };
      }),

    downloadXlsxTemplateExemplo: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) throw new TRPCError({ code: "FORBIDDEN" });
        const svc = await import("./services/excelFcTemplate");
        const config = await svc.loadFcXlsxConfig(input.companyId);
        const buf = await svc.gerarExemploTemplate(config);
        return { base64: buf.toString("base64"), filename: "exemplo_template_fc.xlsx" };
      }),

    getDocxTemplateConfig: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const rows = await db.$client.query(
          `SELECT cor_principal, email_contador, nome_contador, notas, updated_at, updated_by
             FROM docx_template_config
            WHERE company_id = $1
            ORDER BY id DESC LIMIT 1`,
          [input.companyId]
        );
        if (rows.rows.length === 0) {
          return { corPrincipal: "1B2A4A", emailContador: "contabil@pronustributario.com.br", nomeContador: "Pronus Tributário", notas: null, updatedAt: null, updatedBy: null };
        }
        const r = rows.rows[0] as any;
        return { corPrincipal: r.cor_principal as string, emailContador: r.email_contador as string, nomeContador: r.nome_contador as string, notas: r.notas as string | null, updatedAt: r.updated_at as string | null, updatedBy: r.updated_by as string | null };
      }),

    saveDocxTemplateConfig: protectedProcedure
      .input(z.object({
        companyId:     z.number(),
        corPrincipal:  z.string().regex(/^[0-9A-Fa-f]{6}$/, "Cor deve ser hex 6 dígitos"),
        emailContador: z.string().email("E-mail inválido"),
        nomeContador:  z.string().min(1),
        notas:         z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const existing = await db.$client.query(`SELECT id FROM docx_template_config WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [input.companyId]);
        const by = ctx.user.name || ctx.user.username || "Sistema";
        if (existing.rows.length > 0) {
          await db.$client.query(
            `UPDATE docx_template_config SET cor_principal=$1, email_contador=$2, nome_contador=$3, notas=$4, updated_at=now(), updated_by=$5 WHERE id=$6`,
            [input.corPrincipal, input.emailContador, input.nomeContador, input.notas ?? null, by, existing.rows[0].id]
          );
        } else {
          await db.$client.query(
            `INSERT INTO docx_template_config (company_id, cor_principal, email_contador, nome_contador, notas, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,now(),$6)`,
            [input.companyId, input.corPrincipal, input.emailContador, input.nomeContador, input.notas ?? null, by]
          );
        }
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "docx_template_config", entityId: input.companyId, details: `Template Word atualizado: cor=${input.corPrincipal}, contador=${input.emailContador}` });
        return { success: true };
      }),

    downloadDocxTemplateExemplo: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const rows = await db.$client.query(
          `SELECT cor_principal, email_contador, nome_contador FROM docx_template_config WHERE company_id=$1 ORDER BY id DESC LIMIT 1`,
          [input.companyId]
        );
        const r = rows.rows[0] as any;
        const docxConfig = {
          corPrincipal:  r?.cor_principal  ?? "1B2A4A",
          emailContador: r?.email_contador ?? "contabil@pronustributario.com.br",
          nomeContador:  r?.nome_contador  ?? "Pronus Tributário",
        };
        const empQ = await db.$client.query(`SELECT "razaoSocial", "nomeFantasia" FROM companies WHERE id=$1`, [input.companyId]);
        const empresa = empQ.rows[0]?.razaoSocial || empQ.rows[0]?.nomeFantasia || "FC Engenharia";
        const { buildChecklistDocxExemplo } = await import("./routers/downloadPacoteContador");
        const buf = await buildChecklistDocxExemplo(empresa, docxConfig);
        return { base64: buf.toString("base64"), filename: "exemplo_template_word.docx" };
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
          // Rev. 3977 — sincroniza he_banco_horas com companies.heDestinoPadrao (fonte única
          // percebida pelo usuário: mudar em Configurações reflete no toggle da página Banco de Horas).
          if (c.chave === "he_banco_horas") {
            const destino = c.valor === "1" ? "banco_horas" : "pagamento";
            const targetCompanyId = existing[0].companyId ?? input.companyId;
            await db.execute(sql`
              UPDATE companies SET "heDestinoPadrao" = ${destino} WHERE id = ${targetCompanyId}
            `);
          }
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
        { categoria: "ponto", chave: "ponto_tolerancia_atraso", valor: "5", descricao: "Tolerância de atraso na entrada (minutos)", valorPadraoClt: "5", unidade: "min" },
        { categoria: "ponto", chave: "ponto_tolerancia_saida", valor: "5", descricao: "Tolerância de saída antecipada (minutos)", valorPadraoClt: "5", unidade: "min" },
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
        { categoria: "rescisao", chave: "rescisao_aplicar_multa_fgts", valor: "1", descricao: "Aplicar a multa de 40% do FGTS na rescisão (demissão sem justa causa). Desligue para empresas que não pagam a multa.", valorPadraoClt: "1", unidade: "bool" },
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
        { categoria: "recontratacao", chave: "recontratacao_prazo_resolucao_dias", valor: "30", descricao: "Prazo máximo (em dias) para o sócio liberar/recusar uma solicitação de recontratação antes de marcá-la como VENCIDA", valorPadraoClt: "30", unidade: "dias" },
        { categoria: "recontratacao", chave: "recontratacao_carencia_dias", valor: "90", descricao: "Carência (em dias) após o desligamento — vira apenas ALERTA, não bloqueia (a liberação do sócio é a autoridade final)", valorPadraoClt: "90", unidade: "dias" },
        { categoria: "recontratacao", chave: "recontratacao_permitir_experiencia_funcao_diferente", valor: "1", descricao: "Permitir contrato de experiência quando a recontratação for para FUNÇÃO DIFERENTE na mesma empresa (0=Não, 1=Sim). Mesma função nunca permite experiência (TST: fraude)", valorPadraoClt: "1", unidade: "bool" },
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
        // Rev. 4373 — Forma de pagamento padrão dos contratos PJ
        { categoria: "terceiros", chave: "terceiros_pj_forma_pagamento", valor: "PIX", descricao: "Forma de pagamento padrão para contratos PJ (PIX, TED, Boleto, Depósito, Cheque)", valorPadraoClt: "PIX", unidade: "tipo" },
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
  comunicadosInternos: comunicadosInternosRouter,
  curriculos: curriculosRouter,
  employeeDocuments: employeeDocumentsRouter,
  pjMedicoes: pjMedicoesRouter,
  pjConformidade: pjConformidadeRouter,
  dissidio: dissidioRouter,
  convencaoIA: convencaoIARouter,
  sindical: sindicalRouter,
  seguroVida: seguroVidaRouter,
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

      // Lixeira central (snapshots de hard deletes)
      const trashRows = await listTrashEntries(input.companyId);
      trashRows.forEach((t: any) => items.push({
        id: t.id,
        trashEntryId: t.id,
        entity: t.entityType,
        label: t.label,
        deletedAt: t.deletedAt,
        deletedBy: t.deletedBy,
        fromCentralBin: true,
        parentEntity: t.parentEntity,
        parentId: t.parentId,
      }));

      // Ordenar por data de exclusão (mais recente primeiro)
      items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
      return items;
    }),

    // Restaurar item da lixeira
    restore: protectedProcedure.input(z.object({ id: z.number(), entity: z.string(), companyId: z.number(), fromCentralBin: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { sql: sqlFn } = await import("drizzle-orm");

      // Caso 1: entrada vinda da lixeira central (recycle_bin) — re-INSERT do snapshot
      if (input.fromCentralBin) {
        const entry = await getTrashEntry(input.id);
        if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entrada da lixeira não encontrada" });
        const snap = typeof entry.snapshot === "string" ? JSON.parse(entry.snapshot) : entry.snapshot;
        const tableMap: Record<string, string> = {
          heSolicitacao: "he_solicitacoes",
          heSolicitacaoFuncionario: "he_solicitacao_funcionarios",
          heSolicitacaoAtividade: "he_solicitacao_atividades",
          rdoRelatorio: "diario_obra_relatorios",
          rdoMaoObra: "diario_obra_mao_obra",
          rdoEquipamento: "diario_obra_equipamentos",
          rdoAtividade: "diario_obra_atividades",
          rdoMaterial: "diario_obra_materiais",
          rdoFoto: "diario_obra_fotos",
          rdoOcorrencia: "diario_obra_ocorrencias",
          rdoComentario: "diario_obra_comentarios",
          comprasSolicitacao: "compras_solicitacoes",
          comprasSolicitacaoItem: "compras_solicitacoes_itens",
          comprasCotacao: "compras_cotacoes",
          almoxarifadoItem: "almoxarifado_itens",
          almoxarifadoMovimentacao: "almoxarifado_movimentacoes",
        };
        const tname = tableMap[entry.entityType];
        if (!tname) throw new TRPCError({ code: "BAD_REQUEST", message: `Tipo de entidade '${entry.entityType}' não suportado para restauração` });

        // Restaura também filhos se o snapshot for um pacote { __main, __children }
        if (snap && typeof snap === "object" && snap.__main && Array.isArray(snap.__children)) {
          await reinsertSnapshot(tname, snap.__main);
          for (const child of snap.__children) {
            const childTable = tableMap[child.entityType];
            if (childTable) await reinsertSnapshot(childTable, child.row);
          }
        } else {
          await reinsertSnapshot(tname, snap);
        }
        await markTrashEntryRestored(input.id);
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "RESTORE", module: "lixeira", entityType: entry.entityType, entityId: entry.entityId, details: `Item restaurado da lixeira central: ${entry.label}` });
        return { success: true };
      }

      // Caso 2: soft-delete clássico (deletedAt = NULL)
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
      await db.execute(sqlFn.raw(`UPDATE "${tableName}" SET "deletedAt" = NULL, "deletedBy" = NULL, "deletedByUserId" = NULL WHERE id = ${input.id}`));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "RESTORE", module: "lixeira", entityType: input.entity, entityId: input.id, details: `Item restaurado da lixeira: ${input.entity} #${input.id}` });
      return { success: true };
    }),

    // Exclusão permanente
    permanentDelete: protectedProcedure.input(z.object({ id: z.number(), entity: z.string(), companyId: z.number(), fromCentralBin: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { sql: sqlFn } = await import("drizzle-orm");

      if (input.fromCentralBin) {
        await deleteTrashEntry(input.id);
        await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "PERMANENT_DELETE", module: "lixeira", entityType: input.entity, entityId: input.id, details: `Snapshot da lixeira central excluído permanentemente: ${input.entity} #${input.id}` });
        return { success: true };
      }

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
      await db.execute(sqlFn.raw(`DELETE FROM "${tableName}" WHERE id = ${input.id}`));
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
        acessoTodasObras: !!g.acessoTodasObras,
        verStatusAviso: !!g.verStatusAviso,
        moduleAccess: g.moduleAccess ? (() => { try { return JSON.parse(g.moduleAccess); } catch { return {}; } })() : {},
      }));
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const g = await getUserGroupById(input.id);
      if (!g) return null;
      return {
        ...g,
        ativo: !!g.ativo,
        somenteVisualizacao: !!g.somenteVisualizacao,
        ocultarDadosSensiveis: !!g.ocultarDadosSensiveis,
        acessoTodasObras: !!g.acessoTodasObras,
        verStatusAviso: !!g.verStatusAviso,
        moduleAccess: g.moduleAccess ? (() => { try { return JSON.parse(g.moduleAccess); } catch { return {}; } })() : {},
      };
    }),
    create: protectedProcedure.input(z.object({
      nome: z.string().min(1),
      descricao: z.string().optional(),
      cor: z.string().optional(),
      icone: z.string().optional(),
      somenteVisualizacao: z.boolean().optional(),
      ocultarDadosSensiveis: z.boolean().optional(),
      acessoTodasObras: z.boolean().optional(),
      verStatusAviso: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode criar grupos' });
      const result = await createUserGroup({
        nome: input.nome,
        descricao: input.descricao,
        cor: input.cor,
        icone: input.icone,
        somenteVisualizacao: input.somenteVisualizacao === false ? 0 : 1,
        ocultarDadosSensiveis: input.ocultarDadosSensiveis === false ? 0 : 1,
        acessoTodasObras: input.acessoTodasObras ? 1 : 0,
        verStatusAviso: input.verStatusAviso ? 1 : 0,
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
      acessoTodasObras: z.boolean().optional(),
      verStatusAviso: z.boolean().optional(),
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
      if (input.acessoTodasObras !== undefined) updateData.acessoTodasObras = input.acessoTodasObras ? 1 : 0;
      if (input.verStatusAviso !== undefined) updateData.verStatusAviso = input.verStatusAviso ? 1 : 0;
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
    deleteMany: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode excluir grupos' });
      for (const id of input.ids) {
        await deleteUserGroup(id);
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'DELETE', module: 'usuarios', entityType: 'user_group', entityId: 0, details: `${input.ids.length} grupos excluídos em lote: [${input.ids.join(', ')}]` });
      return { deleted: input.ids.length };
    }),
    deleteDuplicates: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode excluir grupos' });
      const groups = await listUserGroups();
      const seen = new Map<string, number>();
      const toDelete: number[] = [];
      for (const g of groups) {
        const key = (g.nome || '').trim().toLowerCase();
        if (seen.has(key)) {
          toDelete.push(g.id);
        } else {
          seen.set(key, g.id);
        }
      }
      for (const id of toDelete) {
        await deleteUserGroup(id);
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'DELETE', module: 'usuarios', entityType: 'user_group', entityId: 0, details: `${toDelete.length} grupos duplicados removidos` });
      return { deleted: toDelete.length };
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
    // Salva moduleAccess (novo sistema) no grupo
    setGroupModuleAccess: protectedProcedure.input(z.object({
      groupId: z.number(),
      moduleAccess: z.record(z.string(), z.any()),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas admin pode configurar permissões de grupo' });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { userGroups } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input.moduleAccess)) { if (v != null) clean[k] = v; }
      await db.update(userGroups).set({ moduleAccess: JSON.stringify(clean) } as any).where(eq(userGroups.id, input.groupId));
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? 'Sistema', action: 'UPDATE', module: 'usuarios', entityType: 'user_group', entityId: input.groupId, details: `Módulos do grupo atualizados: ${Object.keys(clean).join(', ')}` });
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
      const db = await getDb();
      if (!db) return [];
      const exec = await db.execute(sql`SELECT "groupId", "userId" FROM user_group_members`) as any;
      return (exec?.rows ?? exec ?? []) as any[];
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
      const ALL_MODULES = ["rh", "sst", "juridico", "avaliacao", "terceiros", "parceiros", "orcamento", "planejamento", "medicao", "medicao-terceiros", "cadastro", "compras", "almoxarifado", "financeiro", "gestao-documentos", "operacional", "frotas", "comunicados-internos", "curriculos", "oraculo", "portal-cliente"];
      const moduleMap: Record<string, any> = {};
      for (const row of rows) moduleMap[row.moduleKey] = row;
      return ALL_MODULES.map(key => ({
        moduleKey: key,
        enabled: moduleMap[key] ? moduleMap[key].enabled === 1 : true,
        id: moduleMap[key]?.id ?? null,
        updatedBy: moduleMap[key]?.updatedBy ?? null,
        updatedAt: moduleMap[key]?.updatedAt ?? null,
        disabledPages: (() => { try { return JSON.parse(moduleMap[key]?.disabledPages || "[]"); } catch { return []; } })() as string[],
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
    togglePage: protectedProcedure.input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      moduleKey: z.string(),
      pagePath: z.string(),
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
      let pages: string[] = [];
      if (existing.length > 0) {
        try { pages = JSON.parse(existing[0].disabledPages || "[]"); } catch { pages = []; }
        if (input.enabled) {
          pages = pages.filter((p: string) => p !== input.pagePath);
        } else {
          if (!pages.includes(input.pagePath)) pages.push(input.pagePath);
        }
        await db.update(moduleConfig).set({
          disabledPages: JSON.stringify(pages),
          updatedBy: ctx.user.name ?? "Sistema",
          updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        }).where(eq(moduleConfig.id, existing[0].id));
      } else {
        pages = input.enabled ? [] : [input.pagePath];
        await db.insert(moduleConfig).values({
          companyId: input.companyId,
          moduleKey: input.moduleKey,
          enabled: 1,
          enabledAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          updatedBy: ctx.user.name ?? "Sistema",
          disabledPages: JSON.stringify(pages),
        });
      }
      await createAuditLog({ userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "configuracoes", entityType: "module_config", entityId: input.companyId, details: `Sub-item ${input.pagePath} do módulo ${input.moduleKey} ${input.enabled ? 'HABILITADO' : 'DESABILITADO'}` });
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
