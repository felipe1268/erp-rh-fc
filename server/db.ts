import { eq, and, like, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users,
  companies,
  employees,
  employeeHistory,
  userProfiles,
  permissions,
  auditLogs,
  trainingDocuments, payrollUploads, dixiDevices,
  obras, obraFuncionarios, obraHorasRateio, obraSns, employeeSiteHistory, obraPontoInconsistencies,
  terminationNotices, vacationPeriods,
  sectors, jobFunctions,
  systemRevisions,
  userCompanies,
  userPermissions,
  userGroups, userGroupPermissions, userGroupMembers,
} from "../drizzle/schema";

// Type aliases (schema doesn't export Insert types)
type InsertUser = typeof users.$inferInsert;
type InsertCompany = typeof companies.$inferInsert;
type InsertEmployee = typeof employees.$inferInsert;
type InsertEmployeeHistory = typeof employeeHistory.$inferInsert;
type InsertUserProfile = typeof userProfiles.$inferInsert;
type InsertPermission = typeof permissions.$inferInsert;
type InsertAuditLog = typeof auditLogs.$inferInsert;
type InsertObra = typeof obras.$inferInsert;
type InsertSector = typeof sectors.$inferInsert;
type InsertJobFunction = typeof jobFunctions.$inferInsert;
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

// Retorna IDs das empresas que compartilham recursos ("Construtoras")
export async function getConstrutoras() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies)
    .where(and(isNull(companies.deletedAt), eq(companies.compartilhaRecursos, 1)))
    .orderBy(companies.razaoSocial);
}

// Retorna apenas os IDs das construtoras
export async function getConstrutorasIds(): Promise<number[]> {
  const list = await getConstrutoras();
  return list.map(c => c.id);
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

// Números proibidos padrão (fallback se não houver configuração na empresa)
const NUMEROS_PROIBIDOS_DEFAULT = new Set([13, 17, 22, 24, 69, 171, 666]);

// Parseia string de números proibidos ("13,17,22") para Set
function parseNumerosProibidos(str?: string | null): Set<number> {
  if (!str || !str.trim()) return NUMEROS_PROIBIDOS_DEFAULT;
  const nums = str.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
  return nums.length > 0 ? new Set(nums) : NUMEROS_PROIBIDOS_DEFAULT;
}

// Avança o número para o próximo válido (que não esteja na lista de proibidos)
function proximoNumeroValido(num: number, proibidos?: Set<number>): number {
  const set = proibidos || NUMEROS_PROIBIDOS_DEFAULT;
  while (set.has(num)) {
    num++;
  }
  return num;
}

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
    sql`SELECT prefixoCodigo, nextCodigoInterno - 1 as usedNum, numerosProibidos FROM companies WHERE id = ${companyId}`
  ) as any;
  
  const prefixo = companyRows?.[0]?.prefixoCodigo || 'EMP';
  const numerosProibidosStr = companyRows?.[0]?.numerosProibidos;
  const proibidos = parseNumerosProibidos(numerosProibidosStr);
  let num = companyRows?.[0]?.usedNum || 1;
  
  // Pular números proibidos (dinâmico, configurado por empresa)
  num = proximoNumeroValido(num, proibidos);
  
  // Se o número foi avançado por causa de proibidos, atualizar o contador da empresa
  const originalNum = companyRows?.[0]?.usedNum || 1;
  if (num !== originalNum) {
    await db.execute(
      sql`UPDATE companies SET nextCodigoInterno = ${num + 1} WHERE id = ${companyId}`
    );
  }
  
  let codigoInterno = prefixo + String(num).padStart(3, '0');
  
  // Retry with incremented number if duplicate (handles stale nextCodigoInterno)
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const result = await db.insert(employees).values({ ...data, codigoInterno });
      return { id: result[0].insertId, codigoInterno };
    } catch (err: any) {
      if (err?.errno === 1062 && err?.sqlMessage?.includes('idx_codigo_interno')) {
        // Increment and retry, pulando números proibidos
        await db.execute(
          sql`UPDATE companies SET nextCodigoInterno = nextCodigoInterno + 1 WHERE id = ${companyId}`
        );
        const [retry] = await db.execute(
          sql`SELECT prefixoCodigo, nextCodigoInterno - 1 as usedNum FROM companies WHERE id = ${companyId}`
        ) as any;
        let retryNum = retry?.[0]?.usedNum || (num + attempt + 1);
        retryNum = proximoNumeroValido(retryNum, proibidos);
        // Atualizar contador se pulou proibidos
        if (retryNum !== (retry?.[0]?.usedNum || 0)) {
          await db.execute(
            sql`UPDATE companies SET nextCodigoInterno = ${retryNum + 1} WHERE id = ${companyId}`
          );
        }
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
    // Benefícios
    "vtRecebe", "vtTipo", "vtValorDiario", "vtOperadora", "vtNumeroCartao", "vtLinhas", "vtDescontoFolha",
    "vaRecebe", "vaValor", "vaOperadora", "vaNumeroCartao",
    "auxFarmacia", "auxFarmaciaValor", "planoSaude", "planoSaudeOperadora", "planoSaudeValor",
    "benefObs",
    // Pensão Alimentícia
    "pensaoAlimenticia", "pensaoValor", "pensaoTipo", "pensaoPercentual",
    "pensaoBeneficiario", "pensaoBanco", "pensaoAgencia", "pensaoConta", "pensaoObservacoes",
    // Licença Maternidade/Paternidade
    "licencaMaternidade", "licencaTipo", "licencaDataInicio", "licencaDataFim", "licencaObservacoes",
    // Campos rateáveis
    "seguroVida", "contribuicaoSindical", "fgtsPercentual", "inssPercentual",
    "dissidioData", "dissidioPercentual", "convencaoColetiva", "convencaoVigencia",
    "ddsParticipacao",
  ]);
  // Campos booleanos (tinyint no schema)
  const booleanFields = new Set(["listaNegra", "recebeComplemento", "acordoHoraExtra", "pensaoAlimenticia", "licencaMaternidade", "ddsParticipacao"]);
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
  // Validar código interno: não permitir números proibidos (dinâmico)
  if (sanitized.codigoInterno) {
    // Buscar números proibidos da empresa
    const [companyConfig] = await db.execute(
      sql`SELECT numerosProibidos FROM companies WHERE id = ${companyId}`
    ) as any;
    const proibidosEmpresa = parseNumerosProibidos(companyConfig?.[0]?.numerosProibidos);
    const numPart = parseInt(String(sanitized.codigoInterno).replace(/\D/g, ''));
    if (!isNaN(numPart) && proibidosEmpresa.has(numPart)) {
      const listaProibidos = Array.from(proibidosEmpresa).sort((a, b) => a - b).join(', ');
      throw new Error(`Número interno ${numPart} não é permitido. Números proibidos: ${listaProibidos}`);
    }
  }
  if (Object.keys(sanitized).length === 0) return;
  await db.update(employees).set(sanitized).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

export async function getEmployees(companyId: number, search?: string, status?: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const conditions = [inArray(employees.companyId, ids), isNull(employees.deletedAt)];
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
  // Get all employee rows
  const rows = await db.select().from(employees).where(and(...conditions)).orderBy(asc(employees.nomeCompleto));
  
  // Enrich with obra name if any employees have obraAtualId
  const obraIds = Array.from(new Set(rows.filter(r => r.obraAtualId).map(r => r.obraAtualId!)));
  let obraMap: Record<number, string> = {};
  if (obraIds.length > 0) {
    const obraList = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(sql`${obras.id} IN (${sql.join(obraIds.map(id => sql`${id}`), sql`,`)})`);
    obraList.forEach(o => { obraMap[o.id] = o.nome; });
  }
  return rows.map(r => ({ ...r, obraAtualNome: r.obraAtualId ? (obraMap[r.obraAtualId] || null) : null }));
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

export async function getObrasByCompanyActive(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  return db.select().from(obras).where(and(inArray(obras.companyId, ids), eq(obras.isActive, 1), isNull(obras.deletedAt))).orderBy(obras.nome);
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

/** Check which employees from a list already have active obra allocations */
export async function checkEmployeeAllocations(employeeIds: number[]) {
  const db = await getDb();
  if (!db || employeeIds.length === 0) return [];
  const allocs = await db.select({
    employeeId: obraFuncionarios.employeeId,
    obraId: obraFuncionarios.obraId,
    dataInicio: obraFuncionarios.dataInicio,
  }).from(obraFuncionarios).where(and(
    sql`${obraFuncionarios.employeeId} IN (${sql.raw(employeeIds.join(','))})`,
    eq(obraFuncionarios.isActive, 1)
  ));
  if (allocs.length === 0) return [];
  // Get obra names
  const obraIds = Array.from(new Set(allocs.map(a => a.obraId)));
  const obrasList = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(sql`${obras.id} IN (${sql.raw(obraIds.join(','))})`);
  const obraMap = Object.fromEntries(obrasList.map(o => [o.id, o.nome]));
  // Get employee names
  const empsList = await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto }).from(employees).where(sql`${employees.id} IN (${sql.raw(employeeIds.join(','))})`);
  const empMap = Object.fromEntries(empsList.map(e => [e.id, e.nomeCompleto]));
  return allocs.map(a => ({
    employeeId: a.employeeId,
    employeeName: empMap[a.employeeId] || `#${a.employeeId}`,
    obraAtualId: a.obraId,
    obraAtualNome: obraMap[a.obraId] || `Obra #${a.obraId}`,
    dataInicio: a.dataInicio,
  }));
}

export async function allocateEmployeeToObra(data: { obraId: number; employeeId: number; companyId: number; funcaoNaObra?: string; dataInicio?: string; motivo?: string; registradoPor?: string; registradoPorUserId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const hoje = data.dataInicio || new Date().toISOString().split('T')[0];
  // Buscar alocação ativa anterior
  const [alocAnterior] = await db.select().from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, data.employeeId), eq(obraFuncionarios.isActive, 1)));
  const obraOrigemId = alocAnterior?.obraId || null;
  const isTransferencia = !!alocAnterior;
  // Encerrar alocação anterior
  if (alocAnterior) {
    await db.update(obraFuncionarios).set({ isActive: 0, dataFim: hoje } as any).where(eq(obraFuncionarios.id, alocAnterior.id));
    // Registrar saída no histórico
    await db.insert(employeeSiteHistory).values({
      companyId: data.companyId,
      employeeId: data.employeeId,
      obraId: alocAnterior.obraId,
      tipo: 'saida',
      dataInicio: alocAnterior.dataInicio || hoje,
      dataFim: hoje,
      motivoTransferencia: data.motivo || (isTransferencia ? 'Transferência para outra obra' : null),
      registradoPor: data.registradoPor || null,
      registradoPorUserId: data.registradoPorUserId || null,
    } as any);
  }
  // Criar nova alocação
  const insertData: any = {
    obraId: data.obraId,
    employeeId: data.employeeId,
    companyId: data.companyId,
    funcaoNaObra: data.funcaoNaObra || null,
    dataInicio: hoje,
    isActive: true,
  };
  const [result] = await db.insert(obraFuncionarios).values(insertData);
  // Registrar entrada no histórico
  await db.insert(employeeSiteHistory).values({
    companyId: data.companyId,
    employeeId: data.employeeId,
    obraId: data.obraId,
    tipo: isTransferencia ? 'transferencia' : 'alocacao',
    dataInicio: hoje,
    obraOrigemId: obraOrigemId,
    motivoTransferencia: data.motivo || null,
    registradoPor: data.registradoPor || null,
    registradoPorUserId: data.registradoPorUserId || null,
  } as any);
  // Atualizar obraAtualId do funcionário
  await db.update(employees).set({ obraAtualId: data.obraId } as any).where(eq(employees.id, data.employeeId));
  return { id: result.insertId, isTransferencia, obraOrigemId };
}

export async function removeEmployeeFromObra(employeeId: number, motivo?: string, registradoPor?: string, registradoPorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const hoje = new Date().toISOString().split('T')[0];
  // Buscar alocação ativa para registrar histórico
  const [alocAtiva] = await db.select().from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, employeeId), eq(obraFuncionarios.isActive, 1)));
  if (alocAtiva) {
    await db.insert(employeeSiteHistory).values({
      companyId: alocAtiva.companyId,
      employeeId: employeeId,
      obraId: alocAtiva.obraId,
      tipo: 'saida',
      dataInicio: alocAtiva.dataInicio || hoje,
      dataFim: hoje,
      motivoTransferencia: motivo || 'Remoção da obra',
      registradoPor: registradoPor || null,
      registradoPorUserId: registradoPorUserId || null,
    } as any);
  }
  await db.update(obraFuncionarios).set({ isActive: 0, dataFim: hoje } as any).where(and(eq(obraFuncionarios.employeeId, employeeId), eq(obraFuncionarios.isActive, 1)));
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


// ============================================================
// HISTÓRICO DE ALOCAÇÕES E EFETIVO POR OBRA
// ============================================================

/** Histórico de alocações de um funcionário */
export async function getEmployeeSiteHistory(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  const history = await db.select({
    id: employeeSiteHistory.id,
    companyId: employeeSiteHistory.companyId,
    employeeId: employeeSiteHistory.employeeId,
    obraId: employeeSiteHistory.obraId,
    tipo: employeeSiteHistory.tipo,
    dataInicio: employeeSiteHistory.dataInicio,
    dataFim: employeeSiteHistory.dataFim,
    motivoTransferencia: employeeSiteHistory.motivoTransferencia,
    obraOrigemId: employeeSiteHistory.obraOrigemId,
    registradoPor: employeeSiteHistory.registradoPor,
    observacoes: employeeSiteHistory.observacoes,
    createdAt: employeeSiteHistory.createdAt,
    obraNome: obras.nome,
    obraCodigo: obras.codigo,
  }).from(employeeSiteHistory)
    .leftJoin(obras, eq(employeeSiteHistory.obraId, obras.id))
    .where(eq(employeeSiteHistory.employeeId, employeeId))
    .orderBy(desc(employeeSiteHistory.dataInicio));
  return history;
}

/** Efetivo atual por obra (quantos funcionários ativos em cada obra)
 * Cruza com termination_notices (em_andamento) para Aviso Prévio
 * e vacation_periods (em_gozo/agendada com datas atuais) para Férias
 * Dados em tempo real — sempre reflete o estado atual do banco */
export async function getEfetivoPorObra(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const today = new Date().toISOString().split('T')[0];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];

  // 1. Buscar alocações ativas com dados do funcionário
  const alocacoes = await db.select({
    obraId: obraFuncionarios.obraId,
    obraNome: obras.nome,
    obraCodigo: obras.codigo,
    obraStatus: obras.status,
    obraCidade: obras.cidade,
    employeeId: obraFuncionarios.employeeId,
    empStatus: employees.status,
  }).from(obraFuncionarios)
    .innerJoin(obras, eq(obraFuncionarios.obraId, obras.id))
    .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
    .where(and(
      inArray(obraFuncionarios.companyId, ids),
      eq(obraFuncionarios.isActive, 1),
    ));

  if (alocacoes.length === 0) return [];

  // 2. Buscar funcionários com aviso prévio em andamento (tempo real)
  const avisosAtivos = await db.select({
    employeeId: terminationNotices.employeeId,
  }).from(terminationNotices)
    .where(and(
      inArray(terminationNotices.companyId, ids),
      eq(terminationNotices.status, 'em_andamento'),
      sql`${terminationNotices.deletedAt} IS NULL`,
    ));
  const empIdsEmAviso = new Set(avisosAtivos.map(a => a.employeeId));

  // 3. Buscar funcionários em férias agora (em_gozo OU agendada com data atual dentro do período)
  const feriasAtivas = await db.select({
    employeeId: vacationPeriods.employeeId,
  }).from(vacationPeriods)
    .where(and(
      inArray(vacationPeriods.companyId, ids),
      sql`${vacationPeriods.deletedAt} IS NULL`,
      sql`(
        ${vacationPeriods.status} = 'em_gozo'
        OR (
          ${vacationPeriods.status} = 'agendada'
          AND ${vacationPeriods.dataInicio} IS NOT NULL
          AND ${vacationPeriods.dataFim} IS NOT NULL
          AND ${vacationPeriods.dataInicio} <= ${today}
          AND ${vacationPeriods.dataFim} >= ${today}
        )
      )`,
    ));
  const empIdsEmFerias = new Set(feriasAtivas.map(f => f.employeeId));

  // 4. Agregar por obra com status real
  const obraMap = new Map<number, {
    obraId: number; obraNome: string; obraCodigo: string | null; obraStatus: string | null; obraCidade: string | null;
    efetivo: number; qtdAtivo: number; qtdAviso: number; qtdFerias: number; qtdAfastado: number; qtdRecluso: number;
  }>();

  for (const a of alocacoes) {
    if (!obraMap.has(a.obraId)) {
      obraMap.set(a.obraId, {
        obraId: a.obraId, obraNome: a.obraNome, obraCodigo: a.obraCodigo, obraStatus: a.obraStatus, obraCidade: a.obraCidade,
        efetivo: 0, qtdAtivo: 0, qtdAviso: 0, qtdFerias: 0, qtdAfastado: 0, qtdRecluso: 0,
      });
    }
    const o = obraMap.get(a.obraId)!;
    o.efetivo++;

    // Prioridade: Aviso Prévio > Férias > Status do employees
    if (empIdsEmAviso.has(a.employeeId)) {
      o.qtdAviso++;
    } else if (empIdsEmFerias.has(a.employeeId) || a.empStatus === 'Ferias') {
      o.qtdFerias++;
    } else if (a.empStatus === 'Afastado' || a.empStatus === 'Licenca') {
      o.qtdAfastado++;
    } else if (a.empStatus === 'Recluso') {
      o.qtdRecluso++;
    } else {
      o.qtdAtivo++;
    }
  }

  return Array.from(obraMap.values()).sort((a, b) => b.efetivo - a.efetivo);
}

/** Efetivo histórico por obra para dashboard (evolução mensal) */
export async function getEfetivoHistorico(companyId: number, meses: number = 12, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  // Gerar lista de meses para análise
  const hoje = new Date();
  const mesesList: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    mesesList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  
  // Buscar todas as alocações da empresa (ativas e inativas)
  const allAlocs = await db.select({
    obraId: obraFuncionarios.obraId,
    obraNome: obras.nome,
    employeeId: obraFuncionarios.employeeId,
    dataInicio: obraFuncionarios.dataInicio,
    dataFim: obraFuncionarios.dataFim,
    isActive: obraFuncionarios.isActive,
  }).from(obraFuncionarios)
    .innerJoin(obras, eq(obraFuncionarios.obraId, obras.id))
    .where(inArray(obraFuncionarios.companyId, ids));
  
  // Calcular efetivo por obra por mês
  const obrasMap: Record<number, string> = {};
  allAlocs.forEach(a => { obrasMap[a.obraId] = a.obraNome; });
  
  const result: { mes: string; obraId: number; obraNome: string; efetivo: number }[] = [];
  
  for (const mes of mesesList) {
    const [ano, mesNum] = mes.split('-').map(Number);
    const primeiroDia = new Date(ano, mesNum - 1, 1);
    const ultimoDia = new Date(ano, mesNum, 0);
    const primDiaStr = primeiroDia.toISOString().split('T')[0];
    const ultDiaStr = ultimoDia.toISOString().split('T')[0];
    
    // Contar funcionários por obra que estavam alocados nesse mês
    const porObra: Record<number, Set<number>> = {};
    for (const a of allAlocs) {
      const inicio = a.dataInicio || '2000-01-01';
      const fim = a.dataFim || '2099-12-31';
      // Funcionário estava na obra se: início <= último dia do mês E fim >= primeiro dia do mês
      if (inicio <= ultDiaStr && fim >= primDiaStr) {
        if (!porObra[a.obraId]) porObra[a.obraId] = new Set();
        porObra[a.obraId].add(a.employeeId);
      }
    }
    
    for (const [obraId, empSet] of Object.entries(porObra)) {
      result.push({
        mes,
        obraId: Number(obraId),
        obraNome: obrasMap[Number(obraId)] || 'Desconhecida',
        efetivo: empSet.size,
      });
    }
  }
  
  return result;
}

/** Funcionários sem obra alocada */
export async function getFuncionariosSemObra(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const result = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    cargo: employees.cargo,
    setor: employees.setor,
    status: employees.status,
    dataAdmissao: employees.dataAdmissao,
    obraAtualId: employees.obraAtualId,
  }).from(employees)
    .where(and(
      inArray(employees.companyId, ids),
      isNull(employees.deletedAt),
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
      sql`(${employees.obraAtualId} IS NULL OR ${employees.obraAtualId} = 0)`,
    ))
    .orderBy(employees.nomeCompleto);
  return result;
}

/** Transferência em lote de funcionários para uma obra */
export async function transferirFuncionariosEmLote(data: {
  companyId: number;
  obraDestinoId: number;
  employeeIds: number[];
  dataInicio: string;
  motivo?: string;
  registradoPor?: string;
  registradoPorUserId?: number;
}) {
  const resultados: { employeeId: number; success: boolean; error?: string }[] = [];
  for (const empId of data.employeeIds) {
    try {
      await allocateEmployeeToObra({
        obraId: data.obraDestinoId,
        employeeId: empId,
        companyId: data.companyId,
        dataInicio: data.dataInicio,
        motivo: data.motivo,
        registradoPor: data.registradoPor,
        registradoPorUserId: data.registradoPorUserId,
      });
      resultados.push({ employeeId: empId, success: true });
    } catch (e: any) {
      resultados.push({ employeeId: empId, success: false, error: e.message });
    }
  }
  return resultados;
}


// ============================================================
// INCONSISTÊNCIAS PONTO x OBRA
// ============================================================

/** Detectar e registrar inconsistência quando ponto é batido em obra diferente da alocação */
export async function detectarInconsistenciaPonto(data: {
  companyId: number;
  employeeId: number;
  obraPontoId: number;
  dataPonto: string;
  snRelogio?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  // Buscar obra alocada do funcionário
  const [emp] = await db.select({ obraAtualId: employees.obraAtualId }).from(employees).where(eq(employees.id, data.employeeId));
  const obraAlocadaId = emp?.obraAtualId || null;
  // Se não tem obra alocada ou é a mesma, não é inconsistência
  if (!obraAlocadaId || obraAlocadaId === data.obraPontoId) return null;
  // Verificar se já existe inconsistência para este funcionário/data/obra
  const existing = await db.select().from(obraPontoInconsistencies).where(and(
    eq(obraPontoInconsistencies.employeeId, data.employeeId),
    eq(obraPontoInconsistencies.obraPontoId, data.obraPontoId),
    eq(obraPontoInconsistencies.dataPonto, data.dataPonto),
  ));
  if (existing.length > 0) return existing[0];
  // Criar novo alerta
  const [result] = await db.insert(obraPontoInconsistencies).values({
    companyId: data.companyId,
    employeeId: data.employeeId,
    obraAlocadaId: obraAlocadaId,
    obraPontoId: data.obraPontoId,
    dataPonto: data.dataPonto,
    snRelogio: data.snRelogio || null,
  } as any);
  return { id: result.insertId, isNew: true };
}

/** Listar inconsistências pendentes */
export async function getInconsistenciasPendentes(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const result = await db.select({
    id: obraPontoInconsistencies.id,
    companyId: obraPontoInconsistencies.companyId,
    employeeId: obraPontoInconsistencies.employeeId,
    obraAlocadaId: obraPontoInconsistencies.obraAlocadaId,
    obraPontoId: obraPontoInconsistencies.obraPontoId,
    dataPonto: obraPontoInconsistencies.dataPonto,
    snRelogio: obraPontoInconsistencies.snRelogio,
    status: obraPontoInconsistencies.status,
    createdAt: obraPontoInconsistencies.createdAt,
    employeeName: employees.nomeCompleto,
    employeeFuncao: employees.funcao,
  }).from(obraPontoInconsistencies)
    .leftJoin(employees, eq(obraPontoInconsistencies.employeeId, employees.id))
    .where(and(
      inArray(obraPontoInconsistencies.companyId, ids),
      eq(obraPontoInconsistencies.status, 'pendente'),
    ))
    .orderBy(desc(obraPontoInconsistencies.dataPonto));
  // Enriquecer com nomes das obras
  if (result.length === 0) return [];
  const obraIds = Array.from(new Set([
    ...result.map(r => r.obraAlocadaId).filter(Boolean),
    ...result.map(r => r.obraPontoId),
  ])) as number[];
  if (obraIds.length === 0) return result.map(r => ({ ...r, obraAlocadaNome: null, obraPontoNome: null }));
  const obrasData = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(sql`${obras.id} IN (${sql.raw(obraIds.join(","))})`);
  const obrasMap = Object.fromEntries(obrasData.map(o => [o.id, o.nome]));
  return result.map(r => ({
    ...r,
    obraAlocadaNome: r.obraAlocadaId ? obrasMap[r.obraAlocadaId] || null : 'Sem alocação',
    obraPontoNome: obrasMap[r.obraPontoId] || null,
  }));
}

/** Resolver inconsistência: marcar como esporádico */
export async function resolverInconsistenciaEsporadico(id: number, userId: number, userName: string, obs?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(obraPontoInconsistencies).set({
    status: 'esporadico',
    resolvidoPor: userName,
    resolvidoPorUserId: userId,
    resolvidoEm: sql`NOW()`,
    observacoes: obs || 'Marcado como esporádico pelo gestor',
  } as any).where(eq(obraPontoInconsistencies.id, id));
}

/** Resolver inconsistência: transferir funcionário para a obra do ponto */
export async function resolverInconsistenciaTransferir(id: number, userId: number, userName: string, obs?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Buscar dados da inconsistência
  const [inc] = await db.select().from(obraPontoInconsistencies).where(eq(obraPontoInconsistencies.id, id));
  if (!inc) throw new Error("Inconsistência não encontrada");
  // Transferir funcionário
  await allocateEmployeeToObra({
    obraId: inc.obraPontoId,
    employeeId: inc.employeeId,
    companyId: inc.companyId,
    dataInicio: inc.dataPonto,
    motivo: `Transferência via resolução de inconsistência de ponto (${obs || 'Funcionário bateu ponto em obra diferente'})`,
    registradoPor: userName,
    registradoPorUserId: userId,
  });
  // Marcar como resolvido
  await db.update(obraPontoInconsistencies).set({
    status: 'transferido',
    resolvidoPor: userName,
    resolvidoPorUserId: userId,
    resolvidoEm: sql`NOW()`,
    observacoes: obs || 'Funcionário transferido para a obra do ponto',
  } as any).where(eq(obraPontoInconsistencies.id, id));
  // Resolver todas as pendentes do mesmo funcionário/obra (lote)
  await db.update(obraPontoInconsistencies).set({
    status: 'transferido',
    resolvidoPor: userName,
    resolvidoPorUserId: userId,
    resolvidoEm: sql`NOW()`,
    observacoes: 'Resolvido em lote pela transferência',
  } as any).where(and(
    eq(obraPontoInconsistencies.employeeId, inc.employeeId),
    eq(obraPontoInconsistencies.obraPontoId, inc.obraPontoId),
    eq(obraPontoInconsistencies.status, 'pendente'),
  ));
}

/** Contar inconsistências pendentes (para badge no menu) */
export async function countInconsistenciasPendentes(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return 0;
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(obraPontoInconsistencies).where(and(
    inArray(obraPontoInconsistencies.companyId, ids),
    eq(obraPontoInconsistencies.status, 'pendente'),
  ));
  return result?.count || 0;
}

/** Onde o funcionário trabalhou no mês (obra principal + obras visitadas via ponto) */
export async function getOndeTrabalhouNoMes(companyId: number, employeeId: number, mesAno: string) {
  const db = await getDb();
  if (!db) return { obraPrincipal: null, obrasVisitadas: [] };
  const [ano, mes] = mesAno.split('-').map(Number);
  const primeiroDia = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0];
  // Obra principal (alocação ativa no período)
  const alocacoes = await db.select({
    obraId: obraFuncionarios.obraId,
    obraNome: obras.nome,
    dataInicio: obraFuncionarios.dataInicio,
    dataFim: obraFuncionarios.dataFim,
    isActive: obraFuncionarios.isActive,
  }).from(obraFuncionarios)
    .innerJoin(obras, eq(obraFuncionarios.obraId, obras.id))
    .where(and(
      eq(obraFuncionarios.employeeId, employeeId),
      sql`(${obraFuncionarios.dataInicio} IS NULL OR ${obraFuncionarios.dataInicio} <= ${ultimoDia})`,
      sql`(${obraFuncionarios.dataFim} IS NULL OR ${obraFuncionarios.dataFim} >= ${primeiroDia})`,
    ));
  // Obras visitadas via ponto (inconsistências do mês)
  const inconsistencias = await db.select({
    obraPontoId: obraPontoInconsistencies.obraPontoId,
    dataPonto: obraPontoInconsistencies.dataPonto,
    status: obraPontoInconsistencies.status,
  }).from(obraPontoInconsistencies)
    .where(and(
      eq(obraPontoInconsistencies.employeeId, employeeId),
      sql`${obraPontoInconsistencies.dataPonto} >= ${primeiroDia}`,
      sql`${obraPontoInconsistencies.dataPonto} <= ${ultimoDia}`,
    ));
  // Buscar nomes das obras visitadas
  const obraVisitadaIds = Array.from(new Set(inconsistencias.map(i => i.obraPontoId)));
  let obrasVisitadas: { obraId: number; obraNome: string; dias: number; status: string }[] = [];
  if (obraVisitadaIds.length > 0) {
    const obrasData = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(sql`${obras.id} IN (${sql.raw(obraVisitadaIds.join(","))})`);
    const obrasMap = Object.fromEntries(obrasData.map(o => [o.id, o.nome]));
    obrasVisitadas = obraVisitadaIds.map(obraId => ({
      obraId,
      obraNome: obrasMap[obraId] || 'Desconhecida',
      dias: inconsistencias.filter(i => i.obraPontoId === obraId).length,
      status: inconsistencias.find(i => i.obraPontoId === obraId)?.status || 'pendente',
    }));
  }
  return {
    obraPrincipal: alocacoes.find(a => a.isActive === 1) || alocacoes[0] || null,
    alocacoesNoMes: alocacoes,
    obrasVisitadas,
  };
}


/** Get team members of a specific obra (with employee details) */
export async function getEquipeObra(obraId: number, companyId: number) {
  const db = await getDb();
  if (!db) return [];
  const allocs = await db.select({
    employeeId: obraFuncionarios.employeeId,
    dataInicio: obraFuncionarios.dataInicio,
  }).from(obraFuncionarios).where(and(
    eq(obraFuncionarios.obraId, obraId),
    eq(obraFuncionarios.companyId, companyId),
    eq(obraFuncionarios.isActive, 1),
  ));
  if (allocs.length === 0) return [];
  const empIds = allocs.map(a => a.employeeId);
  const emps = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    cargo: employees.cargo,
    setor: employees.setor,
    status: employees.status,
    dataAdmissao: employees.dataAdmissao,
    cpf: employees.cpf,
  }).from(employees).where(sql`${employees.id} IN (${sql.raw(empIds.join(","))})`);

  // Cross-reference termination_notices for Aviso Prévio
  const today = new Date().toISOString().split('T')[0];
  const avisoRows = await db.select({
    employeeId: terminationNotices.employeeId,
  }).from(terminationNotices).where(and(
    eq(terminationNotices.companyId, companyId),
    eq(terminationNotices.status, 'em_andamento'),
    sql`${terminationNotices.dataInicio} <= ${today}`,
    sql`${terminationNotices.dataFim} >= ${today}`,
    sql`${terminationNotices.employeeId} IN (${sql.raw(empIds.join(","))})`
  ));
  const avisoSet = new Set(avisoRows.map(r => r.employeeId));

  // Cross-reference vacation_periods for Férias em gozo
  const feriasRows = await db.select({
    employeeId: vacationPeriods.employeeId,
  }).from(vacationPeriods).where(and(
    eq(vacationPeriods.companyId, companyId),
    eq(vacationPeriods.status, 'em_gozo'),
    sql`${vacationPeriods.dataInicio} <= ${today}`,
    sql`${vacationPeriods.dataFim} >= ${today}`,
    sql`${vacationPeriods.employeeId} IN (${sql.raw(empIds.join(","))})`
  ));
  const feriasSet = new Set(feriasRows.map(r => r.employeeId));

  const allocMap = Object.fromEntries(allocs.map(a => [a.employeeId, a]));
  return emps.map(e => {
    // Determine effective status: Aviso > Ferias > original status
    let effectiveStatus: string = e.status || 'Ativo';
    if (avisoSet.has(e.id)) effectiveStatus = 'Aviso';
    else if (feriasSet.has(e.id)) effectiveStatus = 'Ferias';
    return {
      ...e,
      status: effectiveStatus,
      dataInicioObra: allocMap[e.id]?.dataInicio || null,
    };
  }).sort((a, b) => (a.nomeCompleto || '').localeCompare(b.nomeCompleto || ''));
}

/** Get efetivo dashboard data with ponto cross-reference for a specific month */
export async function getEfetivoDashboardMensal(companyId: number, mesRef: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return { porObra: [], pontoData: [], semObra: 0 };
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  
  // 1. Get active allocations for this company
  const alocacoes = await db.select({
    obraId: obraFuncionarios.obraId,
    obraNome: obras.nome,
    employeeId: obraFuncionarios.employeeId,
    dataInicio: obraFuncionarios.dataInicio,
    dataFim: obraFuncionarios.dataFim,
    isActive: obraFuncionarios.isActive,
  }).from(obraFuncionarios)
    .innerJoin(obras, eq(obraFuncionarios.obraId, obras.id))
    .where(inArray(obraFuncionarios.companyId, ids));
  
  // 2. Get ponto records for this month (if any)
  const pontoRecords = await db.select({
    employeeId: timeRecords.employeeId,
    obraId: timeRecords.obraId,
    diasTrabalhados: sql<number>`COUNT(DISTINCT ${timeRecords.data})`.as('diasTrabalhados'),
    totalHoras: sql<string>`SUM(CASE WHEN ${timeRecords.horasTrabalhadas} IS NOT NULL AND ${timeRecords.horasTrabalhadas} != '' THEN CAST(REPLACE(${timeRecords.horasTrabalhadas}, ':', '.') AS DECIMAL(10,2)) ELSE 0 END)`.as('totalHoras'),
  }).from(timeRecords)
    .where(and(
      inArray(timeRecords.companyId, ids),
      like(timeRecords.data, `${mesRef}%`),
    ))
    .groupBy(timeRecords.employeeId, timeRecords.obraId);
  
  // 3. Calculate efetivo per obra for the given month
  const [anoNum, mesNum] = mesRef.split('-').map(Number);
  const primDia = `${mesRef}-01`;
  const ultDia = new Date(anoNum, mesNum, 0).toISOString().split('T')[0];
  
  const porObra: Record<number, { obraNome: string; alocados: Set<number>; comPonto: Set<number>; diasPonto: number }> = {};
  
  for (const a of alocacoes) {
    const inicio = a.dataInicio || '2000-01-01';
    const fim = a.dataFim || '2099-12-31';
    if (inicio <= ultDia && fim >= primDia) {
      if (!porObra[a.obraId]) {
        porObra[a.obraId] = { obraNome: a.obraNome, alocados: new Set(), comPonto: new Set(), diasPonto: 0 };
      }
      porObra[a.obraId].alocados.add(a.employeeId);
    }
  }
  
  // 4. Cross-reference with ponto
  for (const p of pontoRecords) {
    if (p.obraId && porObra[p.obraId]) {
      porObra[p.obraId].comPonto.add(p.employeeId);
      porObra[p.obraId].diasPonto += p.diasTrabalhados;
    }
  }
  
  // 5. Count sem obra
  const activeEmps = await db.select({ id: employees.id }).from(employees).where(and(
    inArray(employees.companyId, ids),
    isNull(employees.deletedAt),
    sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
    sql`(${employees.obraAtualId} IS NULL OR ${employees.obraAtualId} = 0)`,
  ));
  
  const result = Object.entries(porObra).map(([obraId, data]) => ({
    obraId: Number(obraId),
    obraNome: data.obraNome,
    alocados: data.alocados.size,
    comPonto: data.comPonto.size,
    diasPonto: data.diasPonto,
  })).sort((a, b) => b.alocados - a.alocados);
  
  return {
    porObra: result,
    pontoData: pontoRecords.map(p => ({
      employeeId: p.employeeId,
      obraId: p.obraId,
      diasTrabalhados: p.diasTrabalhados,
    })),
    semObra: activeEmps.length,
  };
}


// ============================================================
// GRUPOS DE USUÁRIOS
// ============================================================

export async function listUserGroups() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userGroups).orderBy(userGroups.nome);
}

export async function getUserGroupById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userGroups).where(eq(userGroups.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createUserGroup(data: { nome: string; descricao?: string; cor?: string; icone?: string; somenteVisualizacao?: number; ocultarDadosSensiveis?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const result = await db.insert(userGroups).values({
    nome: data.nome,
    descricao: data.descricao ?? null,
    cor: data.cor ?? '#6b7280',
    icone: data.icone ?? 'Users',
    somenteVisualizacao: data.somenteVisualizacao ?? 1,
    ocultarDadosSensiveis: data.ocultarDadosSensiveis ?? 1,
  });
  return { id: Number(result[0].insertId) };
}

export async function updateUserGroup(id: number, data: { nome?: string; descricao?: string; cor?: string; icone?: string; somenteVisualizacao?: number; ocultarDadosSensiveis?: number; ativo?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(userGroups).set(data).where(eq(userGroups.id, id));
}

export async function deleteUserGroup(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  // Remove membros e permissões do grupo
  await db.delete(userGroupMembers).where(eq(userGroupMembers.groupId, id));
  await db.delete(userGroupPermissions).where(eq(userGroupPermissions.groupId, id));
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

// Permissões do grupo
export async function getGroupPermissions(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userGroupPermissions).where(eq(userGroupPermissions.groupId, groupId));
}

export async function setGroupPermissions(groupId: number, perms: { rota: string; canView: number; canEdit: number; canCreate: number; canDelete: number; ocultarValores: number; ocultarDocumentos: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(userGroupPermissions).where(eq(userGroupPermissions.groupId, groupId));
  if (perms.length > 0) {
    await db.insert(userGroupPermissions).values(perms.map(p => ({ ...p, groupId })));
  }
}

// Membros do grupo
export async function getGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userGroupMembers).where(eq(userGroupMembers.groupId, groupId));
}

export async function getUserGroupMemberships(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userGroupMembers).where(eq(userGroupMembers.userId, userId));
}

export async function addUserToGroup(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  // Verificar se já existe
  const existing = await db.select().from(userGroupMembers).where(
    and(eq(userGroupMembers.groupId, groupId), eq(userGroupMembers.userId, userId))
  );
  if (existing.length > 0) return;
  await db.insert(userGroupMembers).values({ groupId, userId });
}

export async function removeUserFromGroup(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(userGroupMembers).where(
    and(eq(userGroupMembers.groupId, groupId), eq(userGroupMembers.userId, userId))
  );
}

export async function setUserGroups(userId: number, groupIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(userGroupMembers).where(eq(userGroupMembers.userId, userId));
  if (groupIds.length > 0) {
    await db.insert(userGroupMembers).values(groupIds.map(groupId => ({ groupId, userId })));
  }
}

// Obter permissões efetivas do usuário baseado nos grupos
export async function getUserEffectiveGroupPermissions(userId: number) {
  const db = await getDb();
  if (!db) return { groups: [] as any[], permissions: [] as any[], somenteVisualizacao: true, ocultarDadosSensiveis: true };
  
  // Buscar grupos do usuário
  const memberships = await db.select().from(userGroupMembers).where(eq(userGroupMembers.userId, userId));
  if (memberships.length === 0) return { groups: [], permissions: [], somenteVisualizacao: true, ocultarDadosSensiveis: true };
  
  const groupIds = memberships.map(m => m.groupId);
  
  // Buscar dados dos grupos
  const groups = await db.select().from(userGroups).where(sql`${userGroups.id} IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})`);
  
  // Buscar permissões de todos os grupos (merge: se qualquer grupo permite, permite)
  const allPerms = await db.select().from(userGroupPermissions).where(sql`${userGroupPermissions.groupId} IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})`);
  
  // Merge permissões: para cada rota, pegar o mais permissivo de todos os grupos
  const permMap = new Map<string, { rota: string; canView: number; canEdit: number; canCreate: number; canDelete: number; ocultarValores: number; ocultarDocumentos: number }>();
  for (const p of allPerms) {
    const existing = permMap.get(p.rota);
    if (existing) {
      existing.canView = Math.max(existing.canView, p.canView);
      existing.canEdit = Math.max(existing.canEdit, p.canEdit);
      existing.canCreate = Math.max(existing.canCreate, p.canCreate);
      existing.canDelete = Math.max(existing.canDelete, p.canDelete);
      // Para ocultar, se qualquer grupo NÃO oculta, não oculta (min)
      existing.ocultarValores = Math.min(existing.ocultarValores, p.ocultarValores);
      existing.ocultarDocumentos = Math.min(existing.ocultarDocumentos, p.ocultarDocumentos);
    } else {
      permMap.set(p.rota, { ...p });
    }
  }
  
  // Merge flags globais dos grupos: se qualquer grupo NÃO é somente visualização, não é
  const somenteVisualizacao = groups.every(g => !!g.somenteVisualizacao);
  const ocultarDadosSensiveis = groups.every(g => !!g.ocultarDadosSensiveis);
  
  return {
    groups: groups.map(g => ({ id: g.id, nome: g.nome, cor: g.cor, icone: g.icone })),
    permissions: Array.from(permMap.values()),
    somenteVisualizacao,
    ocultarDadosSensiveis,
  };
}


// ============================================================
// CACHE EM MEMÓRIA PARA QUERIES FREQUENTES
// ============================================================

import { cache } from "./cache";

/** Lista obras {id, nome} de uma empresa (cacheada 5 min) */
export async function getCachedObraNames(companyId: number) {
  return cache.getOrSet(`obraNames:${companyId}`, async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: obras.id, nome: obras.nome })
      .from(obras)
      .where(and(eq(obras.companyId, companyId), isNull(obras.deletedAt)))
      .orderBy(obras.nome);
  }, 300);
}

/** Lista todas as empresas (cacheada 5 min) */
export async function getCachedCompanies() {
  return cache.getOrSet("companies:all", async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(companies).where(isNull(companies.deletedAt)).orderBy(companies.razaoSocial);
  }, 300);
}

/** Invalida cache de obras de uma empresa */
export function invalidateObrasCache(companyId: number) {
  cache.invalidate(`obraNames:${companyId}`);
}

/** Invalida cache de empresas */
export function invalidateCompaniesCache() {
  cache.invalidate("companies:all");
}
