import { eq, and, like, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  companies, InsertCompany,
  employees, InsertEmployee,
  employeeHistory, InsertEmployeeHistory,
  userProfiles, InsertUserProfile,
  permissions, InsertPermission,
  auditLogs, InsertAuditLog,
  trainingDocuments, payrollUploads, dixiDevices,
  obras, InsertObra, obraFuncionarios, obraHorasRateio, obraSns,
  sectors, InsertSector, jobFunctions, InsertJobFunction,
  systemRevisions,
  userCompanies,
  userPermissions,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================
// USERS
// ============================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin_master'; updateSet.role = 'admin_master'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date().toISOString();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date().toISOString();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(isNull(users.deletedAt)).orderBy(desc(users.createdAt));
}

// ============================================================
// COMPANIES (MULTI-TENANT)
// ============================================================

export async function createCompany(data: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(companies).values(data);
  return { id: result[0].insertId };
}

export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(companies).set(data).where(eq(companies.id, id));
}

export async function getCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).where(isNull(companies.deletedAt)).orderBy(companies.razaoSocial);
}

// Retorna empresas que o usuário pode ver (admin_master vê todas)
export async function getCompaniesForUser(userId: number, role: string) {
  const db = await getDb();
  if (!db) return [];
  // Admin Master vê todas as empresas
  if (role === 'admin_master') {
    return getCompanies();
  }
  // Demais usuários: só empresas vinculadas
  const links = await db.select({ companyId: userCompanies.companyId })
    .from(userCompanies).where(eq(userCompanies.userId, userId));
  if (links.length === 0) return [];
  const companyIds = links.map(l => l.companyId);
  return db.select().from(companies)
    .where(and(isNull(companies.deletedAt), inArray(companies.id, companyIds)))
    .orderBy(companies.razaoSocial);
}

// Listar vínculos de um usuário
export async function getUserCompanyLinks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userCompanies).where(eq(userCompanies.userId, userId));
}

// Definir empresas de um usuário (substitui todos os vínculos)
export async function setUserCompanies(userId: number, companyIds: number[]) {
  const db = await getDb();
  if (!db) return;
  // Remove vínculos antigos
  await db.delete(userCompanies).where(eq(userCompanies.userId, userId));
  // Insere novos vínculos
  if (companyIds.length > 0) {
    await db.insert(userCompanies).values(
      companyIds.map(cid => ({ userId, companyId: cid }))
    );
  }
}

// ============================================================
// PERMISSÕES GRANULARES POR MÓDULO E FUNCIONALIDADE
// ============================================================

// Listar todas as permissões de um usuário
export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
}

// Listar permissões de um usuário para um módulo específico
export async function getUserModulePermissions(userId: number, moduleId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userPermissions).where(
    and(eq(userPermissions.userId, userId), eq(userPermissions.moduleId, moduleId))
  );
}

// Definir permissões de um usuário (substitui todas)
export async function setUserPermissions(userId: number, perms: { moduleId: string; featureKey: string; canAccess: boolean }[]) {
  const db = await getDb();
  if (!db) return;
  // Remove permissões antigas
  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  // Insere novas permissões
  if (perms.length > 0) {
    await db.insert(userPermissions).values(
      perms.map(p => ({ userId, moduleId: p.moduleId, featureKey: p.featureKey, canAccess: p.canAccess ? 1 : 0 }))
    );
  }
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function deleteCompany(id: number, userId?: number, userName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(companies).set({
    deletedAt: sql`NOW()`,
    deletedBy: userName || null,
    deletedByUserId: userId || null,
  } as any).where(eq(companies.id, id));
}

export async function restoreCompany(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(companies).set({ deletedAt: null, deletedBy: null, deletedByUserId: null } as any).where(eq(companies.id, id));
}

// ============================================================
// USER PROFILES & PERMISSIONS
// ============================================================

export async function createUserProfile(data: InsertUserProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(userProfiles).values(data);
  return { id: result[0].insertId };
}

export async function getUserProfiles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
}

export async function getUserProfilesByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    profile: userProfiles,
    user: { id: users.id, name: users.name, email: users.email, openId: users.openId },
  }).from(userProfiles)
    .innerJoin(users, eq(userProfiles.userId, users.id))
    .where(eq(userProfiles.companyId, companyId));
}

export async function updateUserProfile(id: number, data: Partial<InsertUserProfile>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(userProfiles).set(data).where(eq(userProfiles.id, id));
}

export async function deleteUserProfile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(permissions).where(eq(permissions.profileId, id));
  await db.delete(userProfiles).where(eq(userProfiles.id, id));
}

export async function setPermissions(profileId: number, perms: InsertPermission[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(permissions).where(eq(permissions.profileId, profileId));
  if (perms.length > 0) {
    await db.insert(permissions).values(perms.map(p => ({ ...p, profileId })));
  }
}

export async function getPermissions(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(permissions).where(eq(permissions.profileId, profileId));
}

// ============================================================
// EMPLOYEES
// ============================================================

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Sanitizar nomeCompleto: remover tabs, quebras de linha, espaços extras
  if (data.nomeCompleto && typeof data.nomeCompleto === 'string') {
    data = { ...data, nomeCompleto: data.nomeCompleto.replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ').trim() };
  }
  // Gerar código interno automaticamente usando prefixo da empresa + auto-incremento atômico
  const companyId = data.companyId;
  
  // Buscar prefixo da empresa e incrementar nextCodigoInterno atomicamente
  await db.execute(
    sql`UPDATE companies SET nextCodigoInterno = nextCodigoInterno + 1 WHERE id = ${companyId}`
  );
  const [companyRows] = await db.execute(
    sql`SELECT prefixoCodigo, nextCodigoInterno - 1 as usedNum FROM companies WHERE id = ${companyId}`
  ) as any;
  
  const prefixo = companyRows?.[0]?.prefixoCodigo || 'EMP';
  const num = companyRows?.[0]?.usedNum || 1;
  let codigoInterno = prefixo + String(num).padStart(3, '0');
  
  // Retry with incremented number if duplicate (handles stale nextCodigoInterno)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.insert(employees).values({ ...data, codigoInterno });
      return { id: result[0].insertId, codigoInterno };
    } catch (err: any) {
      if (err?.errno === 1062 && err?.sqlMessage?.includes('idx_codigo_interno')) {
        // Increment and retry
        await db.execute(
          sql`UPDATE companies SET nextCodigoInterno = nextCodigoInterno + 1 WHERE id = ${companyId}`
        );
        const [retry] = await db.execute(
          sql`SELECT prefixoCodigo, nextCodigoInterno - 1 as usedNum FROM companies WHERE id = ${companyId}`
        ) as any;
        const retryNum = retry?.[0]?.usedNum || (num + attempt + 1);
        codigoInterno = prefixo + String(retryNum).padStart(3, '0');
        continue;
      }
      throw err;
    }
  }
  // Final attempt without retry
  const result = await db.insert(employees).values({ ...data, codigoInterno });
  return { id: result[0].insertId, codigoInterno };
}

export async function updateEmployee(id: number, companyId: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Campos válidos da tabela employees (auditado: todos os campos editáveis do schema)
  const validFields = new Set([
    // Dados pessoais
    "matricula", "nomeCompleto", "cpf", "rg", "orgaoEmissor", "dataNascimento",
    "sexo", "estadoCivil", "nacionalidade", "naturalidade", "nomeMae", "nomePai",
    "ctps", "serieCtps", "pis", "tituloEleitor", "certificadoReservista",
    "cnh", "categoriaCnh", "validadeCnh",
    // Endereço
    "logradouro", "numero", "complemento", "bairro", "cidade", "estado", "cep",
    // Contato
    "telefone", "celular", "email",
    "contatoEmergencia", "telefoneEmergencia", "parentescoEmergencia",
    // Profissional
    "cargo", "funcao", "setor", "codigoInterno", "codigoContabil",
    "dataAdmissao", "dataDemissao", "tipoContrato", "jornadaTrabalho",
    "salarioBase", "valorHora", "horasMensais",
    // Desligamento
    "motivoDesligamento", "categoriaDesligamento", "dataDesligamentoEfetiva",
    "desligadoPor", "desligadoUserId",
    // Bancário
    "banco", "bancoNome", "agencia", "conta", "tipoConta",
    "tipoChavePix", "chavePix", "contaPix", "bancoPix",
    // Status / Lista negra
    "status", "listaNegra", "motivoListaNegra", "dataListaNegra",
    "listaNegraPor", "listaNegraUserId",
    // Obra / Foto / Observações
    "obraAtualId", "fotoUrl", "observacoes",
    // Complemento salarial
    "recebeComplemento", "valorComplemento", "descricaoComplemento",
    // Horas extras
    "acordoHoraExtra", "heNormal50", "he100", "heNoturna",
    "heFeriado", "heInterjornada", "obsAcordoHe",
    // Experiência
    "experienciaTipo", "experienciaInicio", "experienciaFim1", "experienciaFim2",
    "experienciaStatus", "experienciaObs",
    "experienciaProrrogadoEm", "experienciaProrrogadoPor",
    "experienciaEfetivadoEm", "experienciaEfetivadoPor",
    // Conta bancária empresa
    "contaBancariaEmpresaId",
  ]);
  // Campos booleanos (tinyint no schema)
  const booleanFields = new Set(["listaNegra", "recebeComplemento", "acordoHoraExtra"]);
  // Campos inteiros
  const intFields = new Set(["obraAtualId", "contaBancariaEmpresaId", "desligadoUserId", "listaNegraUserId"]);
  // Campos string de HE (são varchar no banco, não int)
  const stringFields = new Set(["heNormal50", "he100", "heNoturna"]);
  // Sanitizar: remover campos inválidos e converter tipos
  const { id: _id, companyId: _cid, createdAt: _ca, updatedAt: _ua, ...cleanData } = data as any;
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(cleanData)) {
    if (!validFields.has(key)) continue; // ignorar campos que não existem na tabela
    if (value === "" || value === undefined) {
      sanitized[key] = null;
    } else if (booleanFields.has(key)) {
      sanitized[key] = value === true || value === "true" || value === 1 || value === "1";
    } else if (intFields.has(key)) {
      const num = parseInt(String(value));
      sanitized[key] = isNaN(num) ? null : num;
    } else if (key === "obraAtualId" && value === "none") {
      sanitized[key] = null;
    } else {
      sanitized[key] = value;
    }
  }
  // Sanitizar nomeCompleto: remover tabs, quebras de linha, espaços extras
  if (sanitized.nomeCompleto && typeof sanitized.nomeCompleto === 'string') {
    sanitized.nomeCompleto = sanitized.nomeCompleto.replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ').trim();
  }
  if (Object.keys(sanitized).length === 0) return;
  await db.update(employees).set(sanitized).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

export async function getEmployees(companyId: number, search?: string, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(employees.companyId, companyId), isNull(employees.deletedAt)];
  if (status && status !== "Todos") {
    conditions.push(eq(employees.status, status as any));
  }
  if (search) {
    const s = search.toLowerCase();
    // Mapear termos amigáveis para valores do banco
    let tipoContratoSearch: string | null = null;
    if (['pj', 'pessoa juridica', 'pessoa jurídica'].some(t => s.includes(t))) tipoContratoSearch = 'PJ';
    else if (['clt', 'carteira'].some(t => s.includes(t))) tipoContratoSearch = 'CLT';
    else if (['temporario', 'temporário'].some(t => s.includes(t))) tipoContratoSearch = 'Temporário';
    else if (['estagio', 'estágio', 'estagiario', 'estagiário'].some(t => s.includes(t))) tipoContratoSearch = 'Estágio';
    else if (['aprendiz', 'jovem aprendiz'].some(t => s.includes(t))) tipoContratoSearch = 'Aprendiz';

    const orConditions = [
      like(employees.nomeCompleto, `%${search}%`),
      like(employees.cpf, `%${search}%`),
      like(employees.rg, `%${search}%`),
      like(employees.cargo, `%${search}%`),
      like(employees.funcao, `%${search}%`),
      like(employees.codigoInterno, `%${search}%`),
      like(employees.setor, `%${search}%`),
      
    ];
    if (tipoContratoSearch) {
      orConditions.push(eq(employees.tipoContrato, tipoContratoSearch as any));
    }
    conditions.push(or(...orConditions)!);
  }
  return db.select().from(employees).where(and(...conditions)).orderBy(asc(employees.nomeCompleto));
}

export async function getEmployeeById(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId), isNull(employees.deletedAt))).limit(1);
  return result[0];
}

export async function deleteEmployee(id: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft delete: marca deletedAt em vez de remover permanentemente
  await db.update(employees).set({ deletedAt: sql`NOW()` } as any).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

// Soft delete com informações do usuário
export async function softDeleteEmployee(id: number, companyId: number, userId: number, userName: string, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({
    deletedAt: sql`NOW()`,
    deletedBy: userName,
    deletedByUserId: userId,
    deleteReason: reason || null,
  } as any).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

// Restaurar colaborador excluído
export async function restoreEmployee(id: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({
    deletedAt: null,
    deletedBy: null,
    deletedByUserId: null,
    deleteReason: null,
  } as any).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

// Listar colaboradores excluídos (lixeira)
export async function getDeletedEmployees(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [isNotNull(employees.deletedAt)];
  if (companyId) conditions.push(eq(employees.companyId, companyId));
  return db.select().from(employees).where(and(...conditions)).orderBy(desc(employees.deletedAt));
}

// Exclusão permanente (apenas para limpeza)
export async function permanentDeleteEmployee(id: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Cascade delete: remover todos os documentos e registros relacionados ao funcionário
  // 1. Documentos e SST
  await db.delete(asos).where(eq(asos.employeeId, id));
  await db.delete(trainings).where(eq(trainings.employeeId, id));
  await db.delete(trainingDocuments).where(eq(trainingDocuments.employeeId, id));
  await db.delete(atestados).where(eq(atestados.employeeId, id));
  await db.delete(warnings).where(eq(warnings.employeeId, id));
  await db.delete(accidents).where(eq(accidents.employeeId, id));
  await db.delete(epiDeliveries).where(eq(epiDeliveries.employeeId, id));
  // 2. Ponto e Folha
  await db.delete(timeRecords).where(eq(timeRecords.employeeId, id));
  await db.delete(timeInconsistencies).where(eq(timeInconsistencies.employeeId, id));
  await db.delete(payroll).where(eq(payroll.employeeId, id));
  await db.delete(monthlyPayrollSummary).where(eq(monthlyPayrollSummary.employeeId, id));
  await db.delete(folhaItens).where(eq(folhaItens.employeeId, id));
  // 3. Benefícios e Pagamentos
  await db.delete(vrBenefits).where(eq(vrBenefits.employeeId, id));
  await db.delete(advances).where(eq(advances.employeeId, id));
  await db.delete(extraPayments).where(eq(extraPayments.employeeId, id));
  // 4. Obras e Lotação
  await db.delete(obraFuncionarios).where(eq(obraFuncionarios.employeeId, id));
  await db.delete(obraHorasRateio).where(eq(obraHorasRateio.employeeId, id));
  await db.delete(manualObraAssignments).where(eq(manualObraAssignments.employeeId, id));
  // 5. Histórico e Processos
  await db.delete(employeeHistory).where(eq(employeeHistory.employeeId, id));
  // Processos trabalhistas: primeiro excluir andamentos, depois processos
  const empProcessos = await db.select({ id: processosTrabalhistas.id }).from(processosTrabalhistas).where(eq(processosTrabalhistas.employeeId, id));
  for (const p of empProcessos) {
    await db.delete(processosAndamentos).where(eq(processosAndamentos.processoId, p.id));
  }
  await db.delete(processosTrabalhistas).where(eq(processosTrabalhistas.employeeId, id));
  // 6. CIPA
  await db.delete(cipaMembersTable).where(eq(cipaMembersTable.employeeId, id));
  // 7. Alertas e Logs (não críticos, mas limpam referências)
  await db.delete(insuranceAlertsLog).where(eq(insuranceAlertsLog.employeeId, id));
  await db.delete(blacklistReactivationRequests).where(eq(blacklistReactivationRequests.employeeId, id));
  // notification_logs tem employeeId nullable, limpar referências
  await db.execute(sql`UPDATE notification_logs SET employeeId = NULL WHERE employeeId = ${id}`);
  // Finalmente, excluir o funcionário
  await db.delete(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

export async function getEmployeeStats(companyId: number) {
  const db = await getDb();
  if (!db) return { total: 0, ativos: 0, ferias: 0, afastados: 0, licenca: 0, desligados: 0, reclusos: 0 };
  const result = await db.select({
    status: employees.status,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), isNull(employees.deletedAt))).groupBy(employees.status);
  const stats = { total: 0, ativos: 0, ferias: 0, afastados: 0, licenca: 0, desligados: 0, reclusos: 0 };
  result.forEach(r => {
    const c = Number(r.count);
    stats.total += c;
    if (r.status === "Ativo") stats.ativos = c;
    else if (r.status === "Ferias") stats.ferias = c;
    else if (r.status === "Afastado") stats.afastados = c;
    else if (r.status === "Licenca") stats.licenca = c;
    else if (r.status === "Desligado") stats.desligados = c;
    else if (r.status === "Recluso") stats.reclusos = c;
  });
  return stats;
}

// ============================================================
// EMPLOYEE HISTORY
// ============================================================

export async function createEmployeeHistory(data: InsertEmployeeHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(employeeHistory).values(data);
}

export async function getEmployeeHistory(employeeId: number, companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employeeHistory)
    .where(and(eq(employeeHistory.employeeId, employeeId), eq(employeeHistory.companyId, companyId)))
    .orderBy(desc(employeeHistory.dataEvento));
}

// ============================================================
// AUDIT LOGS
// ============================================================

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values(data);
  } catch (e) {
    console.error("[Audit] Failed to log:", e);
  }
}

export async function getAuditLogs(companyId?: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(auditLogs).where(eq(auditLogs.companyId, companyId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ============================================================
// SST: ASOs
// ============================================================
import {
  asos, trainings, epis, epiDeliveries, accidents, warnings, risks,
  timeRecords, payroll, atestados, vrBenefits, advances, extraPayments,
  folhaItens, manualObraAssignments, insuranceAlertsLog, notificationLogs,
  cipaMembers as cipaMembersTable, timeInconsistencies, processosTrabalhistas, processosAndamentos,
  blacklistReactivationRequests, monthlyPayrollSummary,
  vehicles, equipment, extinguishers, hydrants,
  audits, deviations, actionPlans, chemicals, dds,
  cipaElections, cipaMembers,
} from "../drizzle/schema";

export async function createAso(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(asos).values(data);
  return { id: result[0].insertId };
}
export async function getAsos(companyId: number, employeeId?: number) {
  const db = await getDb(); if (!db) return [];
  const conds = [eq(asos.companyId, companyId)];
  if (employeeId) conds.push(eq(asos.employeeId, employeeId));
  return db.select().from(asos).where(and(...conds)).orderBy(desc(asos.dataExame));
}
export async function updateAso(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(asos).set(data).where(eq(asos.id, id));
}
export async function deleteAso(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(asos).where(eq(asos.id, id));
}

// ============================================================
// SST: TREINAMENTOS
// ============================================================
export async function createTraining(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(trainings).values(data);
  return { id: result[0].insertId };
}
export async function getTrainings(companyId: number, employeeId?: number) {
  const db = await getDb(); if (!db) return [];
  const conds = [eq(trainings.companyId, companyId)];
  if (employeeId) conds.push(eq(trainings.employeeId, employeeId));
  return db.select().from(trainings).where(and(...conds)).orderBy(desc(trainings.dataRealizacao));
}
export async function updateTraining(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(trainings).set(data).where(eq(trainings.id, id));
}
export async function deleteTraining(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(trainings).where(eq(trainings.id, id));
}

// ============================================================
// SST: EPIs
// ============================================================
export async function createEpi(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(epis).values(data);
  return { id: result[0].insertId };
}
export async function getEpis(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(epis).where(eq(epis.companyId, companyId)).orderBy(epis.nome);
}
export async function updateEpi(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(epis).set(data).where(eq(epis.id, id));
}
export async function deleteEpi(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(epis).where(eq(epis.id, id));
}
export async function createEpiDelivery(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(epiDeliveries).values(data);
  return { id: result[0].insertId };
}
export async function getEpiDeliveries(companyId: number, employeeId?: number) {
  const db = await getDb(); if (!db) return [];
  const conds = [eq(epiDeliveries.companyId, companyId)];
  if (employeeId) conds.push(eq(epiDeliveries.employeeId, employeeId));
  return db.select().from(epiDeliveries).where(and(...conds)).orderBy(desc(epiDeliveries.dataEntrega));
}

// ============================================================
// SST: ACIDENTES
// ============================================================
export async function createAccident(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(accidents).values(data);
  return { id: result[0].insertId };
}
export async function getAccidents(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(accidents).where(eq(accidents.companyId, companyId)).orderBy(desc(accidents.dataAcidente));
}
export async function updateAccident(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(accidents).set(data).where(eq(accidents.id, id));
}
export async function deleteAccident(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(accidents).where(eq(accidents.id, id));
}

// ============================================================
// SST: ADVERTÊNCIAS / OSS
// ============================================================
export async function createWarning(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(warnings).values(data);
  return { id: result[0].insertId };
}
export async function getWarnings(companyId: number, employeeId?: number) {
  const db = await getDb(); if (!db) return [];
  const conds: any[] = [eq(warnings.companyId, companyId), isNull(warnings.deletedAt)];
  if (employeeId) conds.push(eq(warnings.employeeId, employeeId));
  return db.select().from(warnings).where(and(...conds)).orderBy(desc(warnings.dataOcorrencia));
}
export async function updateWarning(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(warnings).set(data).where(eq(warnings.id, id));
}
export async function deleteWarning(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(warnings).where(eq(warnings.id, id));
}

// ============================================================
// SST: RISCOS
// ============================================================
export async function createRisk(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(risks).values(data);
  return { id: result[0].insertId };
}
export async function getRisks(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(risks).where(eq(risks.companyId, companyId)).orderBy(risks.setor);
}
export async function updateRisk(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(risks).set(data).where(eq(risks.id, id));
}
export async function deleteRisk(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(risks).where(eq(risks.id, id));
}

// ============================================================
// PONTO E FOLHA
// ============================================================
export async function createTimeRecord(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(timeRecords).values(data);
  return { id: result[0].insertId };
}
export async function getTimeRecords(companyId: number, employeeId: number, month?: string) {
  const db = await getDb(); if (!db) return [];
  const conds = [eq(timeRecords.companyId, companyId), eq(timeRecords.employeeId, employeeId)];
  if (month) conds.push(like(timeRecords.data, `${month}%`));
  return db.select().from(timeRecords).where(and(...conds)).orderBy(timeRecords.data);
}
export async function bulkCreateTimeRecords(records: any[]) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  if (records.length === 0) return;
  await db.insert(timeRecords).values(records);
}
export async function createPayroll(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(payroll).values(data);
  return { id: result[0].insertId };
}
export async function getPayrolls(companyId: number, month?: string, employeeId?: number) {
  const db = await getDb(); if (!db) return [];
  const conds = [eq(payroll.companyId, companyId)];
  if (month) conds.push(eq(payroll.mesReferencia, month));
  if (employeeId) conds.push(eq(payroll.employeeId, employeeId));
  return db.select().from(payroll).where(and(...conds)).orderBy(desc(payroll.mesReferencia));
}
export async function updatePayroll(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(payroll).set(data).where(eq(payroll.id, id));
}
export async function deletePayroll(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(payroll).where(eq(payroll.id, id));
}

// ============================================================
// GESTÃO DE ATIVOS: VEÍCULOS
// ============================================================
export async function createVehicle(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(vehicles).values(data);
  return { id: result[0].insertId };
}
export async function getVehicles(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(vehicles).where(eq(vehicles.companyId, companyId)).orderBy(vehicles.modelo);
}
export async function updateVehicle(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(vehicles).set(data).where(eq(vehicles.id, id));
}
export async function deleteVehicle(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(vehicles).where(eq(vehicles.id, id));
}

// ============================================================
// GESTÃO DE ATIVOS: EQUIPAMENTOS
// ============================================================
export async function createEquipment(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(equipment).values(data);
  return { id: result[0].insertId };
}
export async function getEquipments(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(equipment).where(eq(equipment.companyId, companyId)).orderBy(equipment.nome);
}
export async function updateEquipment(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(equipment).set(data).where(eq(equipment.id, id));
}
export async function deleteEquipment(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(equipment).where(eq(equipment.id, id));
}

// ============================================================
// GESTÃO DE ATIVOS: EXTINTORES
// ============================================================
export async function createExtinguisher(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(extinguishers).values(data);
  return { id: result[0].insertId };
}
export async function getExtinguishers(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(extinguishers).where(eq(extinguishers.companyId, companyId)).orderBy(extinguishers.numero);
}
export async function updateExtinguisher(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(extinguishers).set(data).where(eq(extinguishers.id, id));
}
export async function deleteExtinguisher(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(extinguishers).where(eq(extinguishers.id, id));
}

// ============================================================
// GESTÃO DE ATIVOS: HIDRANTES
// ============================================================
export async function createHydrant(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(hydrants).values(data);
  return { id: result[0].insertId };
}
export async function getHydrants(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(hydrants).where(eq(hydrants.companyId, companyId)).orderBy(hydrants.numero);
}
export async function updateHydrant(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(hydrants).set(data).where(eq(hydrants.id, id));
}
export async function deleteHydrant(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(hydrants).where(eq(hydrants.id, id));
}

// ============================================================
// AUDITORIA E QUALIDADE
// ============================================================
export async function createAudit(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(audits).values(data);
  return { id: result[0].insertId };
}
export async function getAudits(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.dataAuditoria));
}
export async function updateAudit(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(audits).set(data).where(eq(audits.id, id));
}
export async function deleteAudit(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(audits).where(eq(audits.id, id));
}

// DESVIOS
export async function createDeviation(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(deviations).values(data);
  return { id: result[0].insertId };
}
export async function getDeviations(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(deviations).where(eq(deviations.companyId, companyId)).orderBy(desc(deviations.createdAt));
}
export async function updateDeviation(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(deviations).set(data).where(eq(deviations.id, id));
}
export async function deleteDeviation(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(deviations).where(eq(deviations.id, id));
}

// PLANOS DE AÇÃO 5W2H
export async function createActionPlan(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(actionPlans).values(data);
  return { id: result[0].insertId };
}
export async function getActionPlans(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(actionPlans).where(eq(actionPlans.companyId, companyId)).orderBy(desc(actionPlans.createdAt));
}
export async function updateActionPlan(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(actionPlans).set(data).where(eq(actionPlans.id, id));
}
export async function deleteActionPlan(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(actionPlans).where(eq(actionPlans.id, id));
}

// PRODUTOS QUÍMICOS
export async function createChemical(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(chemicals).values(data);
  return { id: result[0].insertId };
}
export async function getChemicals(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(chemicals).where(eq(chemicals.companyId, companyId)).orderBy(chemicals.nome);
}
export async function updateChemical(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(chemicals).set(data).where(eq(chemicals.id, id));
}
export async function deleteChemical(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(chemicals).where(eq(chemicals.id, id));
}

// DDS
export async function createDds(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(dds).values(data);
  return { id: result[0].insertId };
}
export async function getDdsList(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(dds).where(eq(dds.companyId, companyId)).orderBy(desc(dds.dataRealizacao));
}
export async function deleteDds(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(dds).where(eq(dds.id, id));
}

// ============================================================
// CIPA
// ============================================================
export async function createCipaElection(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(cipaElections).values(data);
  return { id: result[0].insertId };
}
export async function getCipaElections(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(cipaElections).where(eq(cipaElections.companyId, companyId)).orderBy(desc(cipaElections.mandatoInicio));
}
export async function updateCipaElection(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(cipaElections).set(data).where(eq(cipaElections.id, id));
}
export async function deleteCipaElection(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(cipaMembers).where(eq(cipaMembers.electionId, id));
  await db.delete(cipaElections).where(eq(cipaElections.id, id));
}
export async function createCipaMember(data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(cipaMembers).values(data);
  return { id: result[0].insertId };
}
export async function getCipaMembers(electionId: number, companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({
    member: cipaMembers,
    employee: { id: employees.id, nomeCompleto: employees.nomeCompleto, cargo: employees.cargo, setor: employees.setor },
  }).from(cipaMembers)
    .innerJoin(employees, eq(cipaMembers.employeeId, employees.id))
    .where(and(eq(cipaMembers.electionId, electionId), eq(cipaMembers.companyId, companyId)));
}
export async function updateCipaMember(id: number, data: any) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(cipaMembers).set(data).where(eq(cipaMembers.id, id));
}
export async function deleteCipaMember(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(cipaMembers).where(eq(cipaMembers.id, id));
}

// ============================================================
// DASHBOARD STATS
// ============================================================
export async function getSSTStats(companyId: number) {
  const db = await getDb();
  if (!db) return { asosVencidos: 0, treinamentosVencer: 0, acidentesMes: 0, advertenciasMes: 0 };
  const today = new Date().toISOString().split("T")[0];
  const firstDayMonth = today.substring(0, 7) + "-01";

  // Filtrar apenas documentos de funcionários não excluídos (deletedAt IS NULL)
  const [asosVencidos] = await db.select({ count: sql<number>`count(*)` }).from(asos)
    .innerJoin(employees, eq(asos.employeeId, employees.id))
    .where(and(eq(asos.companyId, companyId), isNull(employees.deletedAt), sql`${asos.dataValidade} < ${today}`));
  const [treinamentosVencer] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .innerJoin(employees, eq(trainings.employeeId, employees.id))
    .where(and(eq(trainings.companyId, companyId), isNull(employees.deletedAt), sql`${trainings.dataValidade} < ${today}`));
  const [acidentesMes] = await db.select({ count: sql<number>`count(*)` }).from(accidents)
    .innerJoin(employees, eq(accidents.employeeId, employees.id))
    .where(and(eq(accidents.companyId, companyId), isNull(employees.deletedAt), sql`${accidents.dataAcidente} >= ${firstDayMonth}`));
  const [advertenciasMes] = await db.select({ count: sql<number>`count(*)` }).from(warnings)
    .innerJoin(employees, eq(warnings.employeeId, employees.id))
    .where(and(eq(warnings.companyId, companyId), isNull(employees.deletedAt), isNull(warnings.deletedAt), sql`${warnings.dataOcorrencia} >= ${firstDayMonth}`));

  return {
    asosVencidos: Number(asosVencidos?.count ?? 0),
    treinamentosVencer: Number(treinamentosVencer?.count ?? 0),
    acidentesMes: Number(acidentesMes?.count ?? 0),
    advertenciasMes: Number(advertenciasMes?.count ?? 0),
  };
}


// ============================================================
// DOCUMENTOS DE TREINAMENTO
// ============================================================

export async function createTrainingDocument(data: any) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(trainingDocuments).values(data);
  return result;
}

export async function getTrainingDocuments(trainingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trainingDocuments).where(eq(trainingDocuments.trainingId, trainingId));
}

export async function getEmployeeTrainingDocuments(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trainingDocuments).where(eq(trainingDocuments.employeeId, employeeId));
}

export async function deleteTrainingDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(trainingDocuments).where(eq(trainingDocuments.id, id));
}

// ============================================================
// UPLOADS DE FOLHA (Cartão de Ponto, Folha, Vale)
// ============================================================

export async function createPayrollUpload(data: any) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(payrollUploads).values(data);
  return result;
}

export async function getPayrollUploads(companyId: number, month?: string, category?: string) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(payrollUploads).where(eq(payrollUploads.companyId, companyId));
  if (month) {
    query = db.select().from(payrollUploads).where(and(eq(payrollUploads.companyId, companyId), eq(payrollUploads.month, month)));
  }
  const results = await query;
  if (category) {
    return results.filter((r: any) => r.category === category);
  }
  return results;
}

export async function updatePayrollUploadStatus(id: number, status: string, recordsProcessed?: number, errorMessage?: string) {
  const db = await getDb();
  if (!db) return;
  const updateData: any = { status };
  if (recordsProcessed !== undefined) updateData.recordsProcessed = recordsProcessed;
  if (errorMessage !== undefined) updateData.errorMessage = errorMessage;
  await db.update(payrollUploads).set(updateData).where(eq(payrollUploads.id, id));
}

export async function deletePayrollUpload(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(payrollUploads).where(eq(payrollUploads.id, id));
}

// ============================================================
// DISPOSITIVOS DIXI (Cartão de Ponto vinculado à Obra)
// ============================================================

export async function createDixiDevice(data: any) {
  const db = await getDb();
  if (!db) return;
  return db.insert(dixiDevices).values(data);
}

export async function getDixiDevices(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dixiDevices).where(and(eq(dixiDevices.companyId, companyId), isNull(dixiDevices.deletedAt)));
}

export async function updateDixiDevice(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(dixiDevices).set(data).where(eq(dixiDevices.id, id));
}

export async function deleteDixiDevice(id: number, userId?: number, userName?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(dixiDevices).set({
    deletedAt: sql`NOW()`,
    deletedBy: userName || null,
    deletedByUserId: userId || null,
  } as any).where(eq(dixiDevices.id, id));
}

export async function restoreDixiDevice(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dixiDevices).set({ deletedAt: null, deletedBy: null, deletedByUserId: null } as any).where(eq(dixiDevices.id, id));
}

// ============================================================
// LISTA NEGRA - Busca por CPF
// ============================================================

export async function checkDuplicateCpf(cpf: string, excludeEmployeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) return [];
  const conditions = [or(eq(employees.cpf, cpf), eq(employees.cpf, cleanCpf))];
  if (excludeEmployeeId) {
    const { ne } = await import("drizzle-orm");
    conditions.push(ne(employees.id, excludeEmployeeId) as any);
  }
  // Retorna dados completos para auto-preenchimento
  const results = await db.select().from(employees).where(and(...conditions));
  if (results.length > 0) {
    const companyIds = Array.from(new Set(results.map(r => r.companyId)));
    const companyList = await db.select({ id: companies.id, nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial }).from(companies).where(sql`${companies.id} IN (${sql.raw(companyIds.join(","))})`);
    const companyMap = Object.fromEntries(companyList.map(c => [c.id, c.nomeFantasia || c.razaoSocial]));
    return results.map(r => ({ ...r, empresa: companyMap[r.companyId] || "Desconhecida" }));
  }
  return [];
}

export async function checkBlacklist(cpf: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(employees).where(and(eq(employees.cpf, cpf), eq(employees.listaNegra, 1)));
  return result.length > 0 ? result[0] : null;
}

export async function getBlacklistedEmployees(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(employees).where(and(eq(employees.companyId, companyId), eq(employees.listaNegra, 1)));
  }
  return db.select().from(employees).where(eq(employees.listaNegra, 1));
}

// ============================================================
// BUSCA POR TREINAMENTO
// ============================================================

export async function searchEmployeesByTraining(companyId: number, trainingName: string) {
  const db = await getDb();
  if (!db) return [];
  const { trainings } = await import("../drizzle/schema");
  const trainingResults = await db.select().from(trainings).where(
    and(eq(trainings.companyId, companyId), like(trainings.nome, `%${trainingName}%`))
  );
  return trainingResults;
}

// ============================================================
// OBRAS
// ============================================================

export async function createObra(data: InsertObra) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(obras).values(data);
  return { id: result.insertId };
}

export async function getObras(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(obras).where(and(eq(obras.companyId, companyId), isNull(obras.deletedAt))).orderBy(desc(obras.createdAt));
}

export async function getObraById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.select().from(obras).where(eq(obras.id, id));
  return result || null;
}

export async function updateObra(id: number, data: Partial<InsertObra>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(obras).set(data).where(eq(obras.id, id));
}

export async function deleteObra(id: number, userId?: number, userName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(obras).set({
    deletedAt: sql`NOW()`,
    deletedBy: userName || null,
    deletedByUserId: userId || null,
  } as any).where(eq(obras.id, id));
}

export async function restoreObra(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(obras).set({ deletedAt: null, deletedBy: null, deletedByUserId: null } as any).where(eq(obras.id, id));
}

export async function getObrasByCompanyActive(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(obras).where(and(eq(obras.companyId, companyId), eq(obras.isActive, 1), isNull(obras.deletedAt))).orderBy(obras.nome);
}

// Funcionários alocados na obra
export async function getObraFuncionarios(obraId: number) {
  const db = await getDb();
  if (!db) return [];
  const allocs = await db.select().from(obraFuncionarios).where(and(eq(obraFuncionarios.obraId, obraId), eq(obraFuncionarios.isActive, 1)));
  if (allocs.length === 0) return [];
  const empIds = allocs.map(a => a.employeeId);
  const emps = await db.select().from(employees).where(sql`${employees.id} IN (${sql.raw(empIds.join(","))})`);
  const empMap = Object.fromEntries(emps.map(e => [e.id, e]));
  return allocs.map(a => ({ ...a, employee: empMap[a.employeeId] || null }));
}

export async function allocateEmployeeToObra(data: { obraId: number; employeeId: number; companyId: number; funcaoNaObra?: string; dataInicio?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Desativar alocação anterior do funcionário
  await db.update(obraFuncionarios).set({ isActive: 0 } as any).where(and(eq(obraFuncionarios.employeeId, data.employeeId), eq(obraFuncionarios.isActive, 1)));
  // Criar nova alocação
  const insertData: any = {
    obraId: data.obraId,
    employeeId: data.employeeId,
    companyId: data.companyId,
    funcaoNaObra: data.funcaoNaObra || null,
    dataInicio: data.dataInicio || null,
    isActive: true,
  };
  const [result] = await db.insert(obraFuncionarios).values(insertData);
  // Atualizar obraAtualId do funcionário
  await db.update(employees).set({ obraAtualId: data.obraId } as any).where(eq(employees.id, data.employeeId));
  return { id: result.insertId };
}

export async function removeEmployeeFromObra(employeeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(obraFuncionarios).set({ isActive: 0, dataFim: sql`CURDATE()` } as any).where(and(eq(obraFuncionarios.employeeId, employeeId), eq(obraFuncionarios.isActive, 1)));
  await db.update(employees).set({ obraAtualId: null } as any).where(eq(employees.id, employeeId));
}

// Rateio de horas
export async function getObraHorasRateio(companyId: number, mesAno: string, obraId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(obraHorasRateio.companyId, companyId), eq(obraHorasRateio.mesAno, mesAno)];
  if (obraId) conditions.push(eq(obraHorasRateio.obraId, obraId));
  return db.select().from(obraHorasRateio).where(and(...conditions));
}


// ============================================================
// SETORES
// ============================================================

export async function listSectors(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sectors).where(and(eq(sectors.companyId, companyId), isNull(sectors.deletedAt))).orderBy(sectors.nome);
}

export async function createSector(data: { companyId: number; nome: string; descricao?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(sectors).where(and(eq(sectors.companyId, data.companyId), eq(sectors.nome, data.nome)));
  if (existing.length > 0) throw new Error(`Já existe um setor com o nome "${data.nome}" nesta empresa.`);
  const result = await db.insert(sectors).values({
    companyId: data.companyId,
    nome: data.nome,
    descricao: data.descricao || null,
  });
  return { id: result[0].insertId };
}

export async function updateSector(id: number, companyId: number, data: { nome?: string; descricao?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = {};
  if (data.nome !== undefined) updateData.nome = data.nome;
  if (data.descricao !== undefined) updateData.descricao = data.descricao;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  await db.update(sectors).set(updateData).where(and(eq(sectors.id, id), eq(sectors.companyId, companyId)));
}

export async function deleteSector(id: number, companyId: number, userId?: number, userName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sectors).set({
    deletedAt: sql`NOW()`,
    deletedBy: userName || null,
    deletedByUserId: userId || null,
  } as any).where(and(eq(sectors.id, id), eq(sectors.companyId, companyId)));
}

export async function restoreSector(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sectors).set({ deletedAt: null, deletedBy: null, deletedByUserId: null } as any).where(eq(sectors.id, id));
}

// ============================================================
// FUNÇÕES (JOB FUNCTIONS)
// ============================================================

export async function listJobFunctions(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobFunctions).where(and(eq(jobFunctions.companyId, companyId), isNull(jobFunctions.deletedAt))).orderBy(jobFunctions.nome);
}

export async function createJobFunction(data: { companyId: number; nome: string; descricao?: string; ordemServico?: string; cbo?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(jobFunctions).where(and(eq(jobFunctions.companyId, data.companyId), eq(jobFunctions.nome, data.nome)));
  if (existing.length > 0) throw new Error(`Já existe uma função com o nome "${data.nome}" nesta empresa.`);
  const result = await db.insert(jobFunctions).values({
    companyId: data.companyId,
    nome: data.nome,
    descricao: data.descricao || null,
    ordemServico: data.ordemServico || null,
    cbo: data.cbo || null,
  });
  return { id: result[0].insertId };
}

export async function updateJobFunction(id: number, companyId: number, data: { nome?: string; descricao?: string; ordemServico?: string; cbo?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = {};
  if (data.nome !== undefined) updateData.nome = data.nome;
  if (data.descricao !== undefined) updateData.descricao = data.descricao;
  if (data.ordemServico !== undefined) updateData.ordemServico = data.ordemServico;
  if (data.cbo !== undefined) updateData.cbo = data.cbo;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  await db.update(jobFunctions).set(updateData).where(and(eq(jobFunctions.id, id), eq(jobFunctions.companyId, companyId)));
}

export async function deleteJobFunction(id: number, companyId: number, userId?: number, userName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(jobFunctions).set({
    deletedAt: sql`NOW()`,
    deletedBy: userName || null,
    deletedByUserId: userId || null,
  } as any).where(and(eq(jobFunctions.id, id), eq(jobFunctions.companyId, companyId)));
}

export async function restoreJobFunction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(jobFunctions).set({ deletedAt: null, deletedBy: null, deletedByUserId: null } as any).where(eq(jobFunctions.id, id));
}


// ============================================================
// OBRA SNs (Relógios de Ponto por Obra)
// ============================================================

export async function getObraSns(obraId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(obraSns).where(eq(obraSns.obraId, obraId)).orderBy(desc(obraSns.createdAt));
}

export async function getObraSnsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    obraSn: obraSns,
    obraNome: obras.nome,
    obraStatus: obras.status,
  }).from(obraSns)
    .leftJoin(obras, eq(obraSns.obraId, obras.id))
    .where(eq(obraSns.companyId, companyId))
    .orderBy(desc(obraSns.createdAt));
}

export async function getActiveSnsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    obraSn: obraSns,
    obraNome: obras.nome,
  }).from(obraSns)
    .leftJoin(obras, eq(obraSns.obraId, obras.id))
    .where(and(eq(obraSns.companyId, companyId), eq(obraSns.status, "ativo")));
}

// Validação: verifica se um SN já está ativo em outra obra
export async function checkSnAvailability(companyId: number, sn: string, excludeObraId?: number): Promise<{ available: boolean; usedByObra?: string; usedByObraId?: number }> {
  const db = await getDb();
  if (!db) return { available: true };
  const conditions = [
    eq(obraSns.companyId, companyId),
    eq(obraSns.sn, sn),
    eq(obraSns.status, "ativo"),
  ];
  const existing = await db.select({
    obraId: obraSns.obraId,
    obraNome: obras.nome,
  }).from(obraSns)
    .leftJoin(obras, eq(obraSns.obraId, obras.id))
    .where(and(...conditions));
  
  const conflict = excludeObraId
    ? existing.find(e => e.obraId !== excludeObraId)
    : existing[0];
  
  if (conflict) {
    return { available: false, usedByObra: conflict.obraNome || "Obra desconhecida", usedByObraId: conflict.obraId ?? undefined };
  }
  return { available: true };
}

export async function addSnToObra(data: { companyId: number; obraId?: number; sn: string; apelido?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(obraSns).values({
    companyId: data.companyId,
    obraId: data.obraId,
    sn: data.sn,
    apelido: data.apelido || null,
    status: "ativo",
    dataVinculo: new Date().toISOString().split("T")[0],
  });
  return { id: result.insertId };
}

export async function updateSnObra(id: number, data: { sn?: string; obraId?: number; status?: string; apelido?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { updatedAt: new Date().toISOString() };
  if (data.sn !== undefined) updateData.sn = data.sn;
  if (data.obraId !== undefined) updateData.obraId = data.obraId;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "inativo") updateData.dataLiberacao = new Date().toISOString().split("T")[0];
    else updateData.dataLiberacao = null;
  }
  if (data.apelido !== undefined) updateData.apelido = data.apelido || null;
  await db.update(obraSns).set(updateData).where(eq(obraSns.id, id));
  return { success: true };
}

export async function removeSnFromObra(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // DELETE real do banco
  await db.delete(obraSns).where(eq(obraSns.id, id));
}

// Liberar todos os SNs de uma obra (quando status muda para Concluída/Paralisada/Cancelada)
export async function releaseObraSns(obraId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(obraSns).set({
    status: "inativo",
    dataLiberacao: new Date().toISOString().split("T")[0],
  }).where(and(eq(obraSns.obraId, obraId), eq(obraSns.status, "ativo")));
}

// Listar SNs inativos (disponíveis para realocação)
export async function getAvailableSns(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(obraSns)
    .where(and(eq(obraSns.companyId, companyId), eq(obraSns.status, "inativo")));
}

// Buscar obra pelo SN ativo (para integração DIXI)
export async function findObraBySn(companyId: number, sn: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select({
    obraId: obraSns.obraId,
    obraNome: obras.nome,
  }).from(obraSns)
    .leftJoin(obras, eq(obraSns.obraId, obras.id))
    .where(and(
      eq(obraSns.companyId, companyId),
      eq(obraSns.sn, sn),
      eq(obraSns.status, "ativo"),
    ))
    .limit(1);
  return results[0] || null;
}


// ============================================================
// CONTROLE DE REVISÕES DO SISTEMA
// ============================================================

export async function getRevisions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemRevisions).orderBy(desc(systemRevisions.version));
}

export async function getLatestRevision() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemRevisions).orderBy(desc(systemRevisions.version)).limit(1);
  return rows[0] || null;
}

export async function createRevision(data: {
  version: number;
  titulo: string;
  descricao: string;
  tipo: 'feature' | 'bugfix' | 'melhoria' | 'seguranca' | 'performance';
  modulos?: string;
  criadoPor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(systemRevisions).values(data);
  return { id: Number(result[0].insertId) };
}

export async function deleteRevision(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(systemRevisions).where(eq(systemRevisions.id, id));
}
