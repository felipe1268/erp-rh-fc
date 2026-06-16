import { eq, and, like, ilike, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { getCipaStatusByEmployeeIds, projectCipaFields } from "./_core/cipaStatus";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
  sstIntegracaoRegistros, sstIntegracaoConfig, sstIntegracaoModulos,
  employeeIntegrations, clientes,
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
import { normalizeCidadeInput } from '../shared/normalizeCidade';
import { normalizeModulePerm } from '../shared/modulePages';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

export async function getDb() {
  // Garante que SEMPRE usamos o Neon — nunca o banco local do Replit
  const dbUrl = ENV.databaseUrl; // = NEON_DATABASE_URL apenas (ver env.ts)
  if (!dbUrl) {
    console.error("[Database] NEON_DATABASE_URL não definido — sem conexão com banco.");
    return null;
  }
  // Proteção extra: rejeita explicitamente qualquer URL que não seja Neon
  if (dbUrl.includes("@helium") || dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
    console.error("[Database] BLOQUEADO: URL de banco local detectada. Configure NEON_DATABASE_URL corretamente.");
    return null;
  }
  if (!_db) {
    try {
      _pool = new Pool({
        connectionString: dbUrl,
        max: 10,
        min: 1,
        idleTimeoutMillis: 60000,
        // Rev. 2774 — o Neon hiberna após ~5 min de ociosidade; em deploy
        // autoscale o keep-alive não roda suspenso, então o 1º request após
        // dormir paga o cold-start (pode passar de 5s) e o login estourava
        // "timeout exceeded when trying to connect". 15s tolera o cold-start.
        connectionTimeoutMillis: 15000,
        keepAlive: true,
        allowExitOnIdle: false,
      });
      _pool.on('error', (err) => {
        console.warn('[Database] Pool error (idle client):', err.message);
      });
      _db = drizzle(_pool);
      console.log("[Database] Conectado ao Neon com sucesso.");

      // Rev. 2388 — Bootstrap CREATE TABLE IF NOT EXISTS para a tabela nova
      // de auditoria do Almoxarifado (evita rodar drizzle-kit migrate em prod).
      _pool.query(`
        CREATE TABLE IF NOT EXISTS almoxarifado_auditoria (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL,
          obra_id INTEGER,
          user_id INTEGER NOT NULL,
          user_nome VARCHAR(255),
          acao VARCHAR(40) NOT NULL,
          entidade_tipo VARCHAR(40) NOT NULL,
          entidade_id INTEGER NOT NULL,
          entidade_nome VARCHAR(255),
          dados_antes JSONB,
          dados_depois JSONB,
          justificativa TEXT NOT NULL,
          ip VARCHAR(64),
          status_validacao VARCHAR(20) NOT NULL DEFAULT 'pendente',
          validado_por_id INTEGER,
          validado_por_nome VARCHAR(255),
          validado_em TIMESTAMP,
          observacao_validacao TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_alm_aud_company_status ON almoxarifado_auditoria(company_id, status_validacao);
        CREATE INDEX IF NOT EXISTS idx_alm_aud_obra ON almoxarifado_auditoria(obra_id);
      `).catch(err => console.warn("[Database] bootstrap almoxarifado_auditoria:", err.message));

      // Rev. 2998 — Guard de UNICIDADE do id em epi_estoque_obra. A tabela foi
      // criada SEM PRIMARY KEY (drizzle: `serial()` sem `.primaryKey()`), e um
      // restore reabasteceu a sequence do zero → gerou ids 1..16 REPETIDOS,
      // colidindo com linhas antigas. Como o ajuste de estoque faz UPDATE ...
      // WHERE id=X, um "id=2" duplicado batia em 2 EPIs distintos (ex.: Luva
      // Mista e Luva Nitrílica) e ajustar uma "grudava" o valor na outra.
      // Os dados já foram desduplicados (cada linha tem id único) e a sequence
      // avançada; este índice ÚNICO impede recorrência. CREATE (aditivo, IF NOT
      // EXISTS, com .catch) — não fere a REGRA DE OURO (sem ALTER/DROP/DELETE).
      _pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_eeo_id ON epi_estoque_obra(id);`
      ).catch(err => console.warn("[Database] bootstrap uq_eeo_id:", err.message));

      // Keep-alive: ping a cada 4 min para impedir o Neon de hibernar
      // O Neon entra em sleep após ~5 min de inatividade — o ping mantém vivo
      // Rev. 2774 — limpa o interval anterior antes de criar um novo: a cada
      // resetDbPool()+getDb() um novo interval era criado e o antigo nunca era
      // limpo, acumulando timers/conexões a cada recuperação do pool.
      if (_keepAliveTimer) clearInterval(_keepAliveTimer);
      _keepAliveTimer = setInterval(async () => {
        try {
          if (_pool) await _pool.query('SELECT 1');
        } catch {
          // silencioso — se falhar, resetDbPool cuidará na próxima query real
        }
      }, 4 * 60 * 1000);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export function resetDbPool() {
  if (_pool) {
    _pool.end().catch(() => {});
  }
  // Rev. 2774 — limpa o interval órfão se o pool for resetado sem recriação imediata.
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer);
    _keepAliveTimer = null;
  }
  _pool = null;
  _db = null;
}

// Rev. 2774 — Helper genérico de retry para erros TRANSIENTES de conexão
// (cold-start do Neon, socket/timeout). Reseta o pool entre tentativas e
// re-executa a função. Reaproveitado pelo login (que antes não tinha retry e
// estourava "timeout exceeded when trying to connect" no 1º request após o
// Neon hibernar). Erros NÃO-transientes propagam imediatamente.
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const causeMsg = (e as any)?.cause?.message || '';
      const isTransient = /connection|timeout|socket|ECONNRE|terminating/i.test(causeMsg) ||
                          /connection|timeout|socket|ECONNRE|terminating/i.test(e?.message || '');
      if (!isTransient || attempt === attempts) throw e;
      console.warn(`[withDbRetry] Attempt ${attempt}/${attempts} falhou (transient):`, (causeMsg || e?.message || '').slice(0, 120));
      resetDbPool();
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
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
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
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
  const result = await db.insert(companies).values(data).returning();
  return { id: result[0].id };
}

export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(companies).set(data).where(eq(companies.id, id));
}

export async function getCompanies() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select().from(companies).where(isNull(companies.deletedAt)).orderBy(companies.razaoSocial);
    } catch (e: any) {
      const causeMsg = (e as any)?.cause?.message || '';
      const isTransient = /connection|timeout|socket|ECONNRE|terminating/i.test(causeMsg) ||
                          /connection|timeout|socket|ECONNRE|terminating/i.test(e.message || '');
      console.warn(`[getCompanies] Attempt ${attempt}/3 failed (transient=${isTransient}):`, causeMsg || e.message?.slice(0, 120));
      if (!isTransient || attempt === 3) throw e;
      resetDbPool();
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
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

// Retorna empresas que o usuário pode ver (admin_master e admin veem todas)
export async function getCompaniesForUser(userId: number, role: string) {
  const db = await getDb();
  if (!db) return [];
  // Rev. 1696 — `admin` também é tratado como acesso global (paridade com
  // `getEffectiveAllowedCompanyIds` L260 que já retorna null para ambos).
  // Sem isso, usuários `admin` sem vínculo explícito em `user_companies`
  // recebiam "Sem acesso a esta empresa" em mutações que chamam
  // `_assertCompanyAccess` (ex.: terceiros.empresas.create), mesmo conseguindo
  // listar/visualizar normalmente (pois list não tem o check).
  if (role === 'admin_master' || role === 'admin') {
    return getCompanies();
  }
  const links = await db.select({ companyId: userCompanies.companyId })
    .from(userCompanies).where(eq(userCompanies.userId, userId));
  if (links.length > 0) {
    const companyIds = links.map(l => l.companyId);
    const result = await db.select().from(companies)
      .where(and(isNull(companies.deletedAt), inArray(companies.id, companyIds)))
      .orderBy(companies.razaoSocial);
    if (result.length > 0) return result;
  }
  return db.select().from(companies)
    .where(isNull(companies.deletedAt))
    .orderBy(companies.razaoSocial)
    .limit(1);
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

/**
 * Retorna a lista de IDs de obras às quais o usuário tem acesso (data-row level).
 *
 * Regra:
 * - `null` => sem restrição (vê tudo). Aplica-se a `admin_master` e ao role `admin`.
 * - `number[]` => união de:
 *      a) `users.allowed_obra_ids` (JSON salvo via tela de gestão de usuários);
 *      b) obras onde o usuário é responsável (via `employees.email = users.email`
 *         e `obras.responsavelId = employees.id`).
 *   Lista vazia (`[]`) significa: nenhuma obra liberada — o usuário não vê nada
 *   que dependa de obra.
 *
 * Esta é a fonte da verdade do filtro por obra; routers tRPC devem chamar este
 * helper para aplicar o filtro de forma consistente.
 */
export async function getEffectiveAllowedObraIds(
  userId: number,
  role?: string | null,
): Promise<number[] | null> {
  if (role === "admin_master" || role === "admin") return null;
  const db = await getDb();
  if (!db) return [];
  const set = new Set<number>();
  // Rev. 1510 — Escritório Central: se o usuário pertence a algum grupo ativo
  // com `acesso_todas_obras = 1`, expande o conjunto com TODAS as obras ativas
  // das EMPRESAS às quais o usuário tem acesso (não retorna `null` para evitar
  // vazar obras de empresas não autorizadas em rotas que filtram somente por
  // `companyId` vindo do input).
  try {
    const flagRes = await db.execute(sql`
      SELECT 1
        FROM user_group_members ugm
        JOIN user_groups ug ON ug.id = ugm."groupId"
       WHERE ugm."userId" = ${userId}
         AND ug.acesso_todas_obras = 1
         AND ug.ativo = 1
       LIMIT 1
    `);
    const flagRows: any[] = (flagRes as any)?.rows ?? (flagRes as any) ?? [];
    if (flagRows.length > 0) {
      // Empresas que o usuário pode ver (vínculos em user_companies).
      const compRes = await db.execute(sql`
        SELECT c.id
          FROM companies c
          JOIN user_companies uc ON uc."companyId" = c.id
         WHERE uc."userId" = ${userId}
           AND c."deletedAt" IS NULL
      `);
      const compRows: any[] = (compRes as any)?.rows ?? (compRes as any) ?? [];
      const companyIds = compRows.map((c: any) => Number(c.id)).filter(Number.isFinite);
      if (companyIds.length > 0) {
        const obrasAll = await db.execute(sql`
          SELECT id
            FROM obras
           WHERE "companyId" = ANY(${companyIds})
             AND "deletedAt" IS NULL
             AND "isActive" = 1
        `);
        const obrasRows: any[] = (obrasAll as any)?.rows ?? (obrasAll as any) ?? [];
        for (const o of obrasRows) {
          const n = Number(o.id);
          if (Number.isFinite(n)) set.add(n);
        }
      }
    }
  } catch {}
  try {
    const r = await db.execute(sql`SELECT allowed_obra_ids, email FROM users WHERE id = ${userId}`);
    const rows: any[] = (r as any)?.rows ?? (r as any) ?? [];
    const raw = rows[0]?.allowed_obra_ids;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        for (const v of parsed) {
          const n = Number(v);
          if (Number.isFinite(n)) set.add(n);
        }
      }
    }
    const email = rows[0]?.email;
    if (email) {
      const empRes = await db.execute(sql`SELECT id FROM employees WHERE LOWER(email) = LOWER(${email}) AND "deletedAt" IS NULL`);
      const empRows: any[] = (empRes as any)?.rows ?? (empRes as any) ?? [];
      const empIds = empRows.map((e: any) => Number(e.id)).filter(Number.isFinite);
      if (empIds.length > 0) {
        const obrasRes = await db.execute(sql`SELECT id FROM obras WHERE "responsavelId" = ANY(${empIds}) AND "deletedAt" IS NULL`);
        const obrasRows: any[] = (obrasRes as any)?.rows ?? (obrasRes as any) ?? [];
        for (const o of obrasRows) {
          const n = Number(o.id);
          if (Number.isFinite(n)) set.add(n);
        }
      }
    }
  } catch {}
  return Array.from(set);
}

/**
 * Verifica se o usuário tem acesso a uma obra específica (consulta o helper
 * `getEffectiveAllowedObraIds` por baixo). admin/admin_master => true.
 * obraId nulo/undefined => false (registros sem obra são restritos).
 *
 * Use nos handlers de mutations e get-by-id que recebem o id de um registro
 * já existente; carregue o `obraId` do registro do banco e passe aqui.
 * Routers devem lançar `TRPCError({code:'FORBIDDEN'})` quando isso retornar false.
 */
export async function userCanAccessObra(
  userId: number,
  role: string | null | undefined,
  obraId: number | null | undefined,
): Promise<boolean> {
  const allowed = await getEffectiveAllowedObraIds(userId, role);
  if (allowed === null) return true;
  if (obraId == null) return false;
  return allowed.includes(Number(obraId));
}

/**
 * Rev. 2542 — Conjunto de obras acessíveis para o ALMOXARIFADO (telas
 * operacionais de campo: Baias, Inventário, etc.). Diferente de
 * `getEffectiveAllowedObraIds` (guard de segurança geral), este helper SOMA a
 * alocação OPERACIONAL via `obra_funcionarios` (match por e-mail → employee),
 * espelhando a fonte `obras.listForAlmoxarifado`. Assim um membro da equipe
 * ALOCADO à obra (mesmo sem ser responsável, sem `allowed_obra_ids` e sem grupo
 * "todas as obras") consegue operar o almoxarifado da sua obra.
 *
 * Retorna `null` = sem restrição (admin/admin_master). Caso contrário, um Set de
 * ids permitidos (pode ser vazio). NÃO aplica o fallback "todas as obras" do
 * `listForAlmoxarifado` — aqui é guard de operação, então ausência de qualquer
 * vínculo ⇒ nenhum acesso (seguro).
 */
export async function getAlmoxAllowedObraIdSet(
  userId: number,
  role: string | null | undefined,
  email: string | null | undefined,
): Promise<Set<number> | null> {
  const base = await getEffectiveAllowedObraIds(userId, role);
  if (base === null) return null; // admin/admin_master
  const set = new Set<number>(base);
  const db = await getDb();
  if (db && email) {
    try {
      const empRes = await db.execute(sql`SELECT id FROM employees WHERE LOWER(email) = LOWER(${email}) AND "deletedAt" IS NULL`);
      const empRows: any[] = (empRes as any)?.rows ?? (empRes as any) ?? [];
      const empIds = empRows.map((e: any) => Number(e.id)).filter(Number.isFinite);
      if (empIds.length > 0) {
        const allocRes = await db.execute(sql`SELECT DISTINCT "obraId" FROM obra_funcionarios WHERE "employeeId" = ANY(${empIds}) AND "isActive" = 1`);
        const allocRows: any[] = (allocRes as any)?.rows ?? (allocRes as any) ?? [];
        for (const r of allocRows) {
          const n = Number(r.obraId);
          if (Number.isFinite(n)) set.add(n);
        }
      }
    } catch {}
  }
  return set;
}

/**
 * Rev. 2542 — Predicado de acesso a obra para o ALMOXARIFADO (allocation-aware).
 * Use nos guards do fluxo de Baias/Inventário em vez de `userCanAccessObra`.
 */
export async function userCanAccessObraAlmox(
  userId: number,
  role: string | null | undefined,
  email: string | null | undefined,
  obraId: number | null | undefined,
): Promise<boolean> {
  const set = await getAlmoxAllowedObraIdSet(userId, role, email);
  if (set === null) return true;
  if (obraId == null) return false;
  return set.has(Number(obraId));
}

/**
 * Resolve o mapa de `moduleAccess` efetivo do usuário (grupo "novo sistema" >
 * individual), espelhando `userManagement.getMyPermissions`. Usado em guards
 * server-side de nível de módulo.
 */
async function getUserModuleAccessMap(userId: number): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) return {};
  let moduleAccess: Record<string, unknown> = {};
  try {
    const groupPerms = await getUserEffectiveGroupPermissions(userId);
    if (groupPerms.groups.length > 0) {
      const groupIds = groupPerms.groups.map((g: any) => g.id as number);
      const groupRows = await db
        .select({ id: userGroups.id, moduleAccess: (userGroups as any).moduleAccess })
        .from(userGroups)
        .where(inArray(userGroups.id, groupIds));
      for (const gr of groupRows) {
        if ((gr as any).moduleAccess) {
          try { Object.assign(moduleAccess, JSON.parse((gr as any).moduleAccess as string)); } catch {}
        }
      }
    }
    if (Object.keys(moduleAccess).length === 0) {
      const [u] = await db.select({ modulesAccess: users.modulesAccess }).from(users).where(eq(users.id, userId));
      if ((u as any)?.modulesAccess) { try { moduleAccess = JSON.parse((u as any).modulesAccess); } catch {} }
    }
  } catch {}
  return moduleAccess;
}

/**
 * Espelha o `isRhOrAdmin` do client (RaioXPage): Admin Master / admin (role) OU
 * admin do módulo `rh-dp` enxergam TODOS os colaboradores. Demais usuários ficam
 * restritos às obras liberadas. CRÍTICO: RH costuma ter role `user` + admin de
 * `rh-dp` — por isso o check de módulo é separado do role.
 */
export async function userIsRhOrAdmin(userId: number, role?: string | null): Promise<boolean> {
  if (role === "admin_master" || role === "admin") return true;
  const ma = await getUserModuleAccessMap(userId);
  const perm = normalizeModulePerm("rh-dp", (ma as any)["rh-dp"]);
  return perm?.level === "admin";
}

/**
 * LGPD — Raio-X / dossiê do colaborador: decide se `userId` pode acessar a
 * documentação completa de `employeeId`. RH/Admin: tudo. Demais: somente se
 * ALGUMA obra com alocação ATIVA do colaborador estiver entre as obras liberadas
 * do usuário. Colaborador sem obra ativa fica restrito (igual ao filtro
 * client-side da lista do Raio-X).
 */
export async function userCanAccessEmployeeDossier(
  userId: number,
  role: string | null | undefined,
  employeeId: number,
): Promise<boolean> {
  if (await userIsRhOrAdmin(userId, role)) return true;
  const allowed = await getEffectiveAllowedObraIds(userId, role);
  if (allowed === null) return true;
  const db = await getDb();
  if (!db) return false;
  const alocs = await db
    .select({ obraId: obraFuncionarios.obraId })
    .from(obraFuncionarios)
    .where(and(eq(obraFuncionarios.employeeId, employeeId), eq(obraFuncionarios.isActive, 1)));
  if (alocs.length === 0) return false;
  return alocs.some((a) => allowed.includes(Number(a.obraId)));
}

/**
 * Resolve o `employees.id` correspondente ao usuário logado, via match por email.
 * Retorna `null` se o usuário não tem employee correspondente.
 */
export async function getCurrentUserEmployeeId(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const r = await db.execute(sql`SELECT email FROM users WHERE id = ${userId}`);
    const rows: any[] = (r as any)?.rows ?? (r as any) ?? [];
    const email = rows[0]?.email;
    if (!email) return null;
    const empRes = await db.execute(sql`SELECT id FROM employees WHERE LOWER(email) = LOWER(${email}) AND "deletedAt" IS NULL LIMIT 1`);
    const empRows: any[] = (empRes as any)?.rows ?? (empRes as any) ?? [];
    const id = empRows[0]?.id;
    return id != null ? Number(id) : null;
  } catch {
    return null;
  }
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
  const result = await db.insert(userProfiles).values(data).returning();
  return { id: result[0].id };
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

/**
 * Rev. 2118 — Helper defensivo: calcula o próximo número de codigoInterno
 * pra uma empresa olhando o MAX numérico dos employees existentes
 * (ignora soft-deleted). Usado como fallback quando `nextCodigoInterno`
 * está desincronizado (NULL, zerado, ou menor que o MAX já gerado).
 *
 * Rev. 2168 — HOTFIX: a query estourava com "Failed query: ... CAST AS
 * INTEGER" quando algum employee tinha `codigoInterno` com >9 dígitos
 * (CPF/telefone colado por engano vira número > INT_MAX 2.147.483.647).
 * Mudanças:
 *  - `CAST AS BIGINT` (suporta até 9.2e18).
 *  - Filtra só códigos com 1-9 dígitos após limpeza (ignora "lixo" como
 *    CPF/RG/telefone que possa ter sido salvo errado no passado).
 *  - `NULLIF(..., '')` blinda contra `CAST('' AS BIGINT)`.
 *  - try/catch fail-open → retorna 0 e loga warn, evitando bloquear
 *    o cadastro inteiro caso a query exploda por outro motivo.
 */
async function getMaxCodigoInternoNumero(db: any, companyId: number, prefixo: string): Promise<number> {
  try {
    const exec = await db.execute(
      sql`SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE("codigoInterno", '\D', '', 'g'), '') AS BIGINT)), 0) AS max_num
          FROM employees
          WHERE "companyId" = ${companyId}
            AND "codigoInterno" IS NOT NULL
            AND "codigoInterno" <> ''
            AND "codigoInterno" ~ '[0-9]'
            AND LENGTH(REGEXP_REPLACE("codigoInterno", '\D', '', 'g')) BETWEEN 1 AND 9`
    ) as any;
    const rows = exec?.rows ?? exec ?? [];
    const n = parseInt(String(rows?.[0]?.max_num ?? 0)) || 0;
    return n;
  } catch (e: any) {
    console.warn(`[getMaxCodigoInternoNumero] companyId=${companyId} falhou: ${e?.message}. Usando 0 como fallback.`);
    return 0;
  }
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (data.nomeCompleto && typeof data.nomeCompleto === 'string') {
    data = { ...data, nomeCompleto: data.nomeCompleto.replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ').trim().toUpperCase() };
  }
  // Normalizar cidade: Title Case + acentos corretos
  if (data.cidade && typeof data.cidade === 'string') {
    data = { ...data, cidade: normalizeCidadeInput(data.cidade) };
  }
  // Gerar código interno automaticamente usando prefixo da empresa + auto-incremento atômico
  const companyId = data.companyId;
  
  // Buscar prefixo da empresa e incrementar nextCodigoInterno atomicamente
  await db.execute(
    sql`UPDATE companies SET "nextCodigoInterno" = COALESCE("nextCodigoInterno", 0) + 1 WHERE id = ${companyId}`
  );
  const companyExec = await db.execute(
    sql`SELECT "prefixoCodigo", "nextCodigoInterno" - 1 as "usedNum", "numerosProibidos" FROM companies WHERE id = ${companyId}`
  ) as any;
  const companyRows = companyExec?.rows ?? companyExec ?? [];
  
  const prefixo = companyRows?.[0]?.prefixoCodigo || 'EMP';
  const numerosProibidosStr = companyRows?.[0]?.numerosProibidos;
  const proibidos = parseNumerosProibidos(numerosProibidosStr);
  let num = parseInt(String(companyRows?.[0]?.usedNum ?? 0)) || 0;

  // Rev. 2118 — DEFENSIVO: se o contador `nextCodigoInterno` está desincronizado
  // (NULL, 0, ou menor que o maior número JÁ usado por algum employee desta
  // empresa), realinhar com MAX(codigoInterno)+1. Evita colisões e códigos
  // baixos repetidos quando o counter foi resetado ou nunca inicializado.
  const maxExistente = await getMaxCodigoInternoNumero(db, companyId as number, prefixo);
  if (num <= maxExistente) {
    num = maxExistente + 1;
    await db.execute(
      sql`UPDATE companies SET "nextCodigoInterno" = ${num + 1} WHERE id = ${companyId}`
    );
  }
  if (num < 1) num = 1;
  
  // Pular números proibidos (dinâmico, configurado por empresa)
  num = proximoNumeroValido(num, proibidos);
  
  // Se o número foi avançado por causa de proibidos, atualizar o contador da empresa
  const originalNum = parseInt(String(companyRows?.[0]?.usedNum ?? 1)) || 1;
  if (num !== originalNum) {
    await db.execute(
      sql`UPDATE companies SET "nextCodigoInterno" = ${num + 1} WHERE id = ${companyId}`
    );
  }
  
  let codigoInterno = prefixo + String(num).padStart(3, '0');
  
  // Retry with incremented number if duplicate (handles stale nextCodigoInterno)
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const result = await db.insert(employees).values({ ...data, codigoInterno }).returning();
      return { id: result[0].id, codigoInterno };
    } catch (err: any) {
      if (err?.errno === 1062 && err?.sqlMessage?.includes('idx_codigo_interno')) {
        // Increment and retry, pulando números proibidos
        await db.execute(
          sql`UPDATE companies SET "nextCodigoInterno" = "nextCodigoInterno" + 1 WHERE id = ${companyId}`
        );
        const retryExec = await db.execute(
          sql`SELECT "prefixoCodigo", "nextCodigoInterno" - 1 as "usedNum" FROM companies WHERE id = ${companyId}`
        ) as any;
        const retryRows = retryExec?.rows ?? retryExec ?? [];
        let retryNum = parseInt(String(retryRows?.[0]?.usedNum ?? (num + attempt + 1))) || (num + attempt + 1);
        retryNum = proximoNumeroValido(retryNum, proibidos);
        // Atualizar contador se pulou proibidos
        const retryOriginal = parseInt(String(retryRows?.[0]?.usedNum ?? 0)) || 0;
        if (retryNum !== retryOriginal) {
          await db.execute(
            sql`UPDATE companies SET "nextCodigoInterno" = ${retryNum + 1} WHERE id = ${companyId}`
          );
        }
        codigoInterno = prefixo + String(retryNum).padStart(3, '0');
        continue;
      }
      throw err;
    }
  }
  // Final attempt without retry
  const result = await db.insert(employees).values({ ...data, codigoInterno }).returning();
  return { id: result[0].id, codigoInterno };
}

export async function updateEmployee(id: number, companyId: number, data: Partial<InsertEmployee>, auditUser?: { name?: string; id?: number }) {
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
    "salarioBase", "valorHora", "horasMensais", "tipoRemuneracao",
    // EPI / uniforme (Rev. 2854)
    "tamanhoCalcado", "tamanhoCamisa", "tamanhoCalca",
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
    "fotoUrl", "observacoes",
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
    // Rev. 3022 — pré-marcação "não renovar"
    "experienciaNaoRenovar", "experienciaNaoRenovarEm", "experienciaNaoRenovarPor",
    // Conta bancária empresa
    "contaBancariaEmpresaId",
    // Benefícios
    "vtRecebe", "vtTipo", "vtValorDiario", "vtOperadora", "vtNumeroCartao", "vtLinhas", "vtDescontoFolha",
    "vaRecebe", "vaValor", "vaOperadora", "vaNumeroCartao",
    "auxFarmacia", "auxFarmaciaValor", "planoSaude", "planoSaudeOperadora", "planoSaudeValor",
    "benefObs",
    // Dependentes IR
    "dependentesIR",
    // Pensão Alimentícia
    "pensaoAlimenticia", "pensaoValor", "pensaoTipo", "pensaoPercentual",
    "pensaoBeneficiario", "pensaoBanco", "pensaoAgencia", "pensaoConta", "pensaoObservacoes",
    // Licença Maternidade/Paternidade
    "licencaMaternidade", "licencaTipo", "licencaDataInicio", "licencaDataFim", "licencaObservacoes",
    // Campos rateáveis
    "seguroVida", "contribuicaoSindical", "fgtsPercentual", "inssPercentual",
    "dissidioData", "dissidioPercentual", "convencaoColetiva", "convencaoVigencia",
    "ddsParticipacao",
    // Cargo de Confiança / Isenção Art. 62 CLT (Rev. 1874: + inciso + observação)
    "cargoConfianca", "cargoConfiancaDesde", "cargoConfiancaGratificacao",
    "cargoConfiancaInciso", "cargoConfiancaObservacao",
  ]);
  // Campos booleanos armazenados como smallint (0/1) no banco
  const booleanFields = new Set(["listaNegra", "recebeComplemento", "acordoHoraExtra", "pensaoAlimenticia", "licencaMaternidade", "ddsParticipacao", "cargoConfianca", "experienciaNaoRenovar"]);
  // Campos inteiros
  const intFields = new Set(["contaBancariaEmpresaId", "desligadoUserId", "listaNegraUserId", "dependentesIR"]);
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
      // smallint no banco: usar 1/0 (não true/false)
      sanitized[key] = (value === true || value === "true" || value === 1 || value === "1") ? 1 : 0;
    } else if (intFields.has(key)) {
      const num = parseInt(String(value));
      sanitized[key] = isNaN(num) ? null : num;
    } else {
      sanitized[key] = value;
    }
  }
  if (sanitized.nomeCompleto && typeof sanitized.nomeCompleto === 'string') {
    sanitized.nomeCompleto = sanitized.nomeCompleto.replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  // Normalizar cidade: Title Case + acentos corretos
  if (sanitized.cidade && typeof sanitized.cidade === 'string') {
    sanitized.cidade = normalizeCidadeInput(sanitized.cidade);
  }
  // Validar código interno: não permitir números proibidos (dinâmico)
  if (sanitized.codigoInterno) {
    // Buscar números proibidos da empresa
    const configExec = await db.execute(
      sql`SELECT "numerosProibidos" FROM companies WHERE id = ${companyId}`
    ) as any;
    const configRows = configExec?.rows ?? configExec ?? [];
    const proibidosEmpresa = parseNumerosProibidos(configRows?.[0]?.numerosProibidos);
    const numPart = parseInt(String(sanitized.codigoInterno).replace(/\D/g, ''));
    if (!isNaN(numPart) && proibidosEmpresa.has(numPart)) {
      const listaProibidos = Array.from(proibidosEmpresa).sort((a, b) => a - b).join(', ');
      throw new Error(`Número interno ${numPart} não é permitido. Números proibidos: ${listaProibidos}`);
    }
  }
  // Rev. 2118 — FIX RETROATIVO: se o employee atual está SEM codigoInterno
  // (cadastro legado que escapou da geração automática) e o update NÃO está
  // definindo um, gerar o próximo código sequencial da empresa aqui.
  // Assim, basta o usuário abrir o cadastro do colaborador e clicar Salvar
  // para preencher o código que faltou.
  if (sanitized.codigoInterno === undefined || sanitized.codigoInterno === null || sanitized.codigoInterno === "") {
    const [empAtual] = await db.select({ codigoInterno: employees.codigoInterno })
      .from(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
    const atual = empAtual?.codigoInterno;
    if (!atual || String(atual).trim() === "") {
      try {
        const cfgExec = await db.execute(
          sql`SELECT "prefixoCodigo", "numerosProibidos" FROM companies WHERE id = ${companyId}`
        ) as any;
        const cfgRows = cfgExec?.rows ?? cfgExec ?? [];
        const prefixo = cfgRows?.[0]?.prefixoCodigo || 'EMP';
        const proibidos = parseNumerosProibidos(cfgRows?.[0]?.numerosProibidos);
        const maxExistente = await getMaxCodigoInternoNumero(db, companyId, prefixo);
        let novoNum = proximoNumeroValido(maxExistente + 1, proibidos);
        sanitized.codigoInterno = prefixo + String(novoNum).padStart(3, '0');
        // Manter contador da empresa em dia
        await db.execute(
          sql`UPDATE companies SET "nextCodigoInterno" = ${novoNum + 1} WHERE id = ${companyId} AND COALESCE("nextCodigoInterno", 0) <= ${novoNum}`
        );
      } catch (e) {
        console.error('[updateEmployee] Falha ao gerar codigoInterno retroativo:', e);
      }
    }
  }

  if (Object.keys(sanitized).length === 0) return;

  if (sanitized.status) {
    const [empAntes] = await db.select({ status: employees.status, nomeCompleto: employees.nomeCompleto })
      .from(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
    if (empAntes && empAntes.status !== sanitized.status) {
      const { logStatusChange } = await import("./lib/employeeStatusHelper");
      await logStatusChange({
        db, companyId, employeeId: id,
        nomeCompleto: empAntes.nomeCompleto, statusAnterior: empAntes.status || 'Desconhecido',
        statusNovo: sanitized.status, alteradoPor: auditUser?.name || 'Edição Manual',
        alteradoPorUserId: auditUser?.id, motivo: 'Edição manual do cadastro',
        origemModulo: 'employee.update',
      });
    }
  }

  await db.update(employees).set(sanitized).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

export async function getEmployees(companyId: number, search?: string, status?: string, companyIds?: number[], excludeTerminated?: boolean, includeTerminatedInMonth?: string) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const conditions = [inArray(employees.companyId, ids), isNull(employees.deletedAt)];
  if (status && status !== "Todos") {
    conditions.push(eq(employees.status, status as any));
  } else if (excludeTerminated) {
    if (includeTerminatedInMonth) {
      const [yStr, mStr] = includeTerminatedInMonth.split('-');
      const y = parseInt(yStr), m = parseInt(mStr);
      const mesInicio = `${y}-${String(m).padStart(2, '0')}-01`;
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      const mesFim = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
      conditions.push(sql`(${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo') OR (${employees.status} IN ('Desligado', 'Lista_Negra') AND COALESCE(${employees.dataDesligamentoEfetiva}, ${employees.dataDemissao}) >= ${mesInicio}::date))`);
    } else {
      conditions.push(sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`);
    }
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

    const cleanDigits = search.replace(/\D/g, ''); // só dígitos, para comparar CPF/RG sem formatação
    const orConditions: any[] = [
      ilike(employees.nomeCompleto, `%${search}%`),
      ilike(employees.cpf, `%${search}%`),
      ilike(employees.rg, `%${search}%`),
      ilike(employees.cargo, `%${search}%`),
      ilike(employees.funcao, `%${search}%`),
      ilike(employees.codigoInterno, `%${search}%`),
      ilike(employees.setor, `%${search}%`),
    ];
    // CPF/RG: comparar também com dígitos limpos (ex: busca "36250688854" acha "362.506.888-54")
    if (cleanDigits.length >= 3) {
      orConditions.push(
        sql`regexp_replace(${employees.cpf}, '[^0-9]', '', 'g') ilike ${'%' + cleanDigits + '%'}`,
        sql`regexp_replace(${employees.rg}, '[^0-9]', '', 'g') ilike ${'%' + cleanDigits + '%'}`,
      );
    }
    if (tipoContratoSearch) {
      orConditions.push(eq(employees.tipoContrato, tipoContratoSearch as any));
    }
    conditions.push(or(...orConditions)!);
  }
  // Get all employee rows
  const rows = await db.select().from(employees).where(and(...conditions)).orderBy(asc(employees.nomeCompleto));
  
  // Enrich with obra name via obra_funcionarios (alocação ativa)
  const empIds = rows.map(r => r.id);
  let empObraMap: Record<number, { obraId: number; obraNome: string }> = {};
  if (empIds.length > 0) {
    const alocacoes = await db.select({
      employeeId: obraFuncionarios.employeeId,
      obraId: obraFuncionarios.obraId,
      obraNome: obras.nome,
    }).from(obraFuncionarios)
      .innerJoin(obras, eq(obraFuncionarios.obraId, obras.id))
      .where(and(
        inArray(obraFuncionarios.employeeId, empIds),
        eq(obraFuncionarios.isActive, 1),
      ));
    alocacoes.forEach(a => { empObraMap[a.employeeId] = { obraId: a.obraId, obraNome: a.obraNome }; });
  }
  return rows.map(r => ({ ...r, obraAtualId: empObraMap[r.id]?.obraId || null, obraAtualNome: empObraMap[r.id]?.obraNome || null }));
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

export async function getEmployeeStats(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return { total: 0, naEmpresa: 0, ativos: 0, ferias: 0, afastados: 0, licenca: 0, desligados: 0, reclusos: 0, aviso: 0, blacklist: 0, clt: 0, pj: 0, socio: 0, porStatus: {} as Record<string, number> };
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];

  // Query única agrupada por (status, listaNegra) — fonte de verdade para todos os badges.
  // Isso garante que cada número exibido vem de uma contagem real do banco, sem estimativas.
  const [rawResult, tipoResult] = await Promise.all([
    db.execute(
      sql`SELECT status, "listaNegra", COUNT(*) as cnt
          FROM employees
          WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
            AND "deletedAt" IS NULL
          GROUP BY status, "listaNegra"`
    ),
    db.execute(
      // CLT/PJ: apenas quem está Ativo (mesmo critério do badge "Ativos")
      sql`SELECT "tipoContrato", COUNT(*) as cnt
          FROM employees
          WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
            AND "deletedAt" IS NULL
            AND status = 'Ativo'
          GROUP BY "tipoContrato"`
    ),
  ]);

  const rows: Array<{ status: string; listaNegra: number; cnt: number }> =
    ((rawResult as any).rows || []).map((r: any) => ({
      status: r.status || 'Sem Status',
      listaNegra: Number(r.listaNegra ?? 0),
      cnt: Number(r.cnt),
    }));

  const stats = {
    total: 0,
    naEmpresa: 0,   // Vínculo ativo: total − desligados − blacklist (todos que AINDA têm conexão com a empresa)
    ativos: 0,
    ferias: 0,
    afastados: 0,
    licenca: 0,
    desligados: 0,  // Desligado SEM flag listaNegra
    reclusos: 0,
    aviso: 0,
    blacklist: 0,   // TODOS com listaNegra=1, qualquer status
    clt: 0,
    pj: 0,
    socio: 0,       // Ativos com tipoContrato='Socio' (fecha a conta: ativos = clt + pj + socio)
    porStatus: {} as Record<string, number>,
  };

  for (const r of rows) {
    stats.total += r.cnt;
    // porStatus agrega sem distinção de listaNegra (para uso interno)
    stats.porStatus[r.status] = (stats.porStatus[r.status] ?? 0) + r.cnt;

    // Blacklist = qualquer funcionário com flag listaNegra=1
    if (r.listaNegra === 1) {
      stats.blacklist += r.cnt;
      // Desligados com flag listaNegra NÃO entram no badge "Desligados" para evitar dupla contagem
      continue;
    }

    // A partir daqui: listaNegra = 0 (funcionários normais)
    if (r.status === "Ativo")       stats.ativos    += r.cnt;
    else if (r.status === "Ferias") stats.ferias    += r.cnt;
    else if (r.status === "Afastado") stats.afastados += r.cnt;
    else if (r.status === "Licenca")  stats.licenca   += r.cnt;
    else if (r.status === "Desligado") stats.desligados += r.cnt;
    else if (r.status === "Recluso")   stats.reclusos  += r.cnt;
    else if (r.status === "Aviso")     stats.aviso     += r.cnt;
  }

  // CLT e PJ: contagem por tipo de contrato (apenas ativos)
  const tipoRows: Array<{ tipoContrato: string; cnt: number }> =
    ((tipoResult as any).rows || []).map((r: any) => ({ tipoContrato: r.tipoContrato, cnt: Number(r.cnt) }));
  for (const r of tipoRows) {
    if (r.tipoContrato === 'CLT') stats.clt = r.cnt;
    else if (r.tipoContrato === 'PJ') stats.pj = r.cnt;
    else if (r.tipoContrato === 'Socio') stats.socio = r.cnt;
  }

  // Vínculo ativo na empresa = todos que ainda têm conexão = total − dispensados (desligados + blacklist).
  // Equivale a Ativos + Férias + Afastados + Licença + Aviso + Reclusos (+ eventuais "Sem Status").
  stats.naEmpresa = stats.total - stats.desligados - stats.blacklist;

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

export async function createAuditLog(data: Omit<InsertAuditLog, "module"> & { module?: string }) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values({ module: "sistema", ...data } as InsertAuditLog);
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
  const result = await db.insert(asos).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(trainings).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(epis).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(epiDeliveries).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(accidents).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(warnings).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(risks).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(timeRecords).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(payroll).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(vehicles).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(equipment).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(extinguishers).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(hydrants).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(audits).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(deviations).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(actionPlans).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(chemicals).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(dds).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(cipaElections).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(cipaMembers).values(data).returning();
  return { id: result[0].id };
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
  const result = await db.insert(trainingDocuments).values(data).returning();
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
  const result = await db.insert(payrollUploads).values(data).returning();
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

// Verifica CPF duplicado SOMENTE dentro da mesma empresa (companyId obrigatório).
// Cada empresa tem isolamento total — o mesmo funcionário pode existir em empresas diferentes.
export async function checkDuplicateCpf(cpf: string, companyId: number, excludeEmployeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) return [];
  const conditions: any[] = [
    // Compara só os DÍGITOS dos dois lados: no banco o CPF pode estar formatado
    // ("362.506.888-54") ou limpo; sem isto um duplicado formatado não era detectado.
    sql`regexp_replace(${employees.cpf}, '[^0-9]', '', 'g') = ${cleanCpf}`,
    isNull(employees.deletedAt),
    eq(employees.companyId, companyId),
  ];
  if (excludeEmployeeId) {
    const { ne } = await import("drizzle-orm");
    conditions.push(ne(employees.id, excludeEmployeeId));
  }
  const results = await db.select().from(employees).where(and(...conditions));
  if (results.length > 0) {
    const [company] = await db.select({ nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial })
      .from(companies).where(eq(companies.id, companyId));
    const empresaNome = company?.nomeFantasia || company?.razaoSocial || "Desconhecida";
    return results.map(r => ({ ...r, empresa: empresaNome }));
  }
  return [];
}

// Lista negra filtrada por empresa — isolamento total entre empresas.
export async function checkBlacklist(cpf: string, companyId?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [eq(employees.cpf, cpf), eq(employees.listaNegra, 1)];
  if (companyId) conditions.push(eq(employees.companyId, companyId));
  const result = await db.select().from(employees).where(and(...conditions));
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
  // Verifica duplicata: não permite duas obras ativas com o mesmo nome na mesma empresa
  const [existing] = await db.select({ id: obras.id })
    .from(obras)
    .where(and(eq(obras.companyId, data.companyId), eq(obras.nome, data.nome), isNull(obras.deletedAt)));
  if (existing) {
    throw new Error(`Já existe uma obra ativa com o nome "${data.nome}". Verifique se ela não foi criada anteriormente.`);
  }
  const result = await db.insert(obras).values(data).returning();
  return { id: result[0].id };
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

  // GOLDEN RULE #11: Excluir obra = cascata TOTAL. Nada do projeto deletado pode ser reaproveitado.
  // Hard-delete ALL child data before soft-deleting the obra itself.

  // 1) Planejamento: delete all dependents first, then projetos
  const projRows = await db.execute(sql`SELECT id FROM planejamento_projetos WHERE obra_id = ${id}`);
  const projIds = ((projRows as any).rows ?? projRows ?? []).map((r: any) => r.id);
  if (projIds.length > 0) {
    for (const pid of projIds) {
      await db.execute(sql`DELETE FROM planejamento_refis WHERE projeto_id = ${pid}`);
      await db.execute(sql`DELETE FROM planejamento_avancos WHERE projeto_id = ${pid}`);
      await db.execute(sql`DELETE FROM planejamento_medicoes WHERE projeto_id = ${pid}`);
      await db.execute(sql`DELETE FROM planejamento_atividades WHERE projeto_id = ${pid}`);
      await db.execute(sql`DELETE FROM planejamento_revisoes WHERE projeto_id = ${pid}`);
      try { await db.execute(sql`DELETE FROM ia_cronograma_chat WHERE projeto_id = ${pid}`); } catch (_) {}
      try { await db.execute(sql`DELETE FROM ia_cronograma_alertas WHERE projeto_id = ${pid}`); } catch (_) {}
      try { await db.execute(sql`DELETE FROM ia_cronograma_cenarios WHERE projeto_id = ${pid}`); } catch (_) {}
      try { await db.execute(sql`DELETE FROM ia_cronograma_monitoramento WHERE projeto_id = ${pid}`); } catch (_) {}
    }
    await db.execute(sql`DELETE FROM planejamento_projetos WHERE obra_id = ${id}`);
  }

  // 2) Orçamentos: delete all children then orçamentos
  const orcRows = await db.execute(sql`SELECT id FROM orcamentos WHERE "obraId" = ${id}`);
  const orcIds = ((orcRows as any).rows ?? orcRows ?? []).map((r: any) => r.id);
  if (orcIds.length > 0) {
    for (const oid of orcIds) {
      await db.execute(sql`DELETE FROM orcamento_itens WHERE "orcamentoId" = ${oid}`);
      await db.execute(sql`DELETE FROM orcamento_insumos WHERE "orcamentoId" = ${oid}`);
      await db.execute(sql`DELETE FROM orcamento_bdi WHERE "orcamentoId" = ${oid}`);
      try { await db.execute(sql`DELETE FROM orcamento_revisoes WHERE "orcamentoId" = ${oid}`); } catch (_) {}
    }
    await db.execute(sql`DELETE FROM orcamentos WHERE "obraId" = ${id}`);
  }

  // 3) All direct child tables with "obraId" (camelCase)
  const camelCaseTables = [
    'obra_funcionarios', 'obra_horas_rateio', 'manual_obra_assignments', 'obra_sns',
    'time_records', 'time_inconsistencies', 'unmatched_dixi_records', 'timecard_daily',
    'employee_site_history', 'epi_deliveries', 'epi_estoque_obra', 'epi_estoque_minimo',
    'convencao_coletiva', 'dixi_afd_importacoes', 'dixi_afd_marcacoes', 'dixi_devices',
    'eval_avaliacoes', 'eval_avaliadores', 'eval_surveys',
    'field_notes', 'financial_events', 'funcionarios_terceiros',
    'he_solicitacoes', 'meal_benefit_configs',
  ];
  for (const t of camelCaseTables) {
    try { await db.execute(sql.raw(`DELETE FROM ${t} WHERE "obraId" = ${id}`)); } catch (_) {}
  }

  // 4) All direct child tables with "obra_id" (snake_case)
  const snakeCaseTables = [
    'purchase_requests', 'purchase_orders', 'purchase_receipts',
    'purchase_accounts_payable', 'purchase_approval_rules', 'purchase_spending_limits',
    'budget_reallocations', 'buyer_commissions', 'emergency_metrics',
    'terceiro_contratos', 'terceiro_medicoes',
  ];
  for (const t of snakeCaseTables) {
    try { await db.execute(sql.raw(`DELETE FROM ${t} WHERE obra_id = ${id}`)); } catch (_) {}
  }

  // 5) Soft-delete the obra itself (keeps in lixeira for audit trail)
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
  const rows = await db.select().from(obras).where(and(inArray(obras.companyId, ids), eq(obras.isActive, 1), isNull(obras.deletedAt), eq(obras.status, 'Em_Andamento'))).orderBy(obras.nome);
  // Consolidate by name when multiple companies (CONSTRUTORAS mode)
  if (ids.length > 1) {
    const seen = new Map<string, typeof rows[0] & { obraIds?: number[] }>();
    for (const r of rows) {
      const key = (r.nome || '').trim().toUpperCase();
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        if (!(existing as any).obraIds) (existing as any).obraIds = [existing.id];
        (existing as any).obraIds.push(r.id);
      } else {
        seen.set(key, { ...r, obraIds: [r.id] } as any);
      }
    }
    return Array.from(seen.values());
  }
  return rows;
}

// Funcionários alocados na obra
/**
 * Rev. 2938 — Helper REUSÁVEL: monta os mapas de INTEGRAÇÕES (por cliente,
 * `employee_integrations`) e de NRs (treinamentos, `trainings.norma`) por
 * funcionário. Extraído de `getObraFuncionarios` para ser reaproveitado pelo
 * endpoint company-wide `getIntegracoesNrsPorFuncionario` (abas "Todos"/"Sem Obra").
 * Tenant-safe (restrito a companyIdsArr) e 100% read-only.
 */
type IntegracaoChip = { cliente: string; tipo: string; dataValidade: string | null; vencida: boolean; semVencimento: boolean };
type NrChip = { norma: string; nome: string; dataValidade: string | null; vencida: boolean };
async function buildIntegracoesNrsMaps(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyIdsArr: number[],
  empIds: number[],
): Promise<{ integracoesMap: Map<number, IntegracaoChip[]>; nrsMap: Map<number, NrChip[]> }> {
  const integracoesMap = new Map<number, IntegracaoChip[]>();
  const nrsMap = new Map<number, NrChip[]>();
  if (empIds.length === 0 || companyIdsArr.length === 0) return { integracoesMap, nrsMap };

  // INTEGRAÇÕES por funcionário, agrupadas por CLIENTE/REFERÊNCIA (employee_integrations).
  {
    const integRows = await db.select({
      employeeId: employeeIntegrations.employeeId,
      tipo: employeeIntegrations.tipo,
      clienteNome: employeeIntegrations.clienteNome,
      clienteRazao: clientes.razaoSocial,
      dataVencimento: employeeIntegrations.dataVencimento,
      dataRealizacao: employeeIntegrations.dataRealizacao,
    }).from(employeeIntegrations)
      .leftJoin(clientes, and(
        eq(clientes.id, employeeIntegrations.clienteId),
        eq(clientes.companyId, employeeIntegrations.companyId),
      ))
      .where(and(
        inArray(employeeIntegrations.companyId, companyIdsArr),
        sql`${employeeIntegrations.employeeId} IN (${sql.raw(empIds.join(","))})`,
      ))
      .orderBy(desc(employeeIntegrations.dataRealizacao));

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeMs = hoje.getTime();
    for (const r of integRows) {
      const cliente = ((r.clienteNome || r.clienteRazao || (r.tipo === 'interna' ? 'FC Engenharia (Interna)' : 'Sem cliente')) || 'Sem cliente').trim();
      const venc = r.dataVencimento;
      const semVencimento = !venc;
      let vencida = false;
      if (venc) {
        const vMs = new Date(venc + 'T00:00:00').getTime();
        vencida = !Number.isNaN(vMs) && vMs < hojeMs;
      }
      const arr = integracoesMap.get(r.employeeId) || [];
      if (!arr.some(x => x.cliente.toLowerCase() === cliente.toLowerCase())) {
        arr.push({ cliente, tipo: r.tipo, dataValidade: venc ?? null, vencida, semVencimento });
        integracoesMap.set(r.employeeId, arr);
      }
    }
  }

  // NRs do funcionário a partir dos DOCUMENTOS DE TREINAMENTO (trainings.norma).
  {
    const hojeNr = new Date();
    hojeNr.setHours(0, 0, 0, 0);
    const hojeNrMs = hojeNr.getTime();
    const trRows = await db.select({
      employeeId: trainings.employeeId,
      norma: trainings.norma,
      nome: trainings.nome,
      dataValidade: trainings.dataValidade,
    }).from(trainings)
      .where(and(
        inArray(trainings.companyId, companyIdsArr),
        isNull(trainings.deletedAt),
        sql`${trainings.employeeId} IN (${sql.raw(empIds.join(","))})`,
      ))
      .orderBy(desc(trainings.dataRealizacao));
    for (const r of trRows) {
      const norma = (r.norma || '').trim();
      if (!norma) continue;
      const dv = r.dataValidade ? String(r.dataValidade).slice(0, 10) : null;
      let vencida = false;
      if (dv) {
        const vMs = new Date(dv + 'T00:00:00').getTime();
        vencida = !Number.isNaN(vMs) && vMs < hojeNrMs;
      }
      const arr = nrsMap.get(r.employeeId) || [];
      if (!arr.some(x => x.norma.toLowerCase() === norma.toLowerCase())) {
        arr.push({ norma, nome: r.nome, dataValidade: r.dataValidade ?? null, vencida });
        nrsMap.set(r.employeeId, arr);
      }
    }
  }

  return { integracoesMap, nrsMap };
}

/**
 * Rev. 2938 — Integrações + NRs por funcionário em ESCOPO DE EMPRESA (todos os
 * funcionários ativos), para enriquecer as abas "Todos" e "Sem Obra" do Efetivo
 * por Obra (que não passam por `getObraFuncionarios`). Read-only, tenant-safe.
 */
export async function getIntegracoesNrsPorFuncionario(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const emps = await db.select({ id: employees.id }).from(employees).where(and(
    inArray(employees.companyId, ids),
    isNull(employees.deletedAt),
    sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
  ));
  const empIds = emps.map(e => e.id);
  if (empIds.length === 0) return [];
  const { integracoesMap, nrsMap } = await buildIntegracoesNrsMaps(db, ids, empIds);
  return empIds.map(employeeId => ({
    employeeId,
    integracoes: integracoesMap.get(employeeId) || [],
    nrs: nrsMap.get(employeeId) || [],
  }));
}

export async function getObraFuncionarios(obraId: number, obraIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const idsToQuery = obraIds && obraIds.length > 0 ? obraIds : [obraId];
  const allocs = await db.select().from(obraFuncionarios).where(and(
    idsToQuery.length === 1 ? eq(obraFuncionarios.obraId, idsToQuery[0]) : inArray(obraFuncionarios.obraId, idsToQuery),
    eq(obraFuncionarios.isActive, 1)
  ));
  if (allocs.length === 0) return [];
  const empIdsAll = allocs.map(a => a.employeeId);
  const companyIdsSet = new Set(allocs.map(a => a.companyId));
  const companyIdsArr = Array.from(companyIdsSet);
  const empsRaw = await db.select().from(employees).where(and(
    sql`${employees.id} IN (${sql.raw(empIdsAll.join(","))})`,
    sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`,
    isNull(employees.deletedAt),
  ));
  const empMap = Object.fromEntries(empsRaw.map(e => [e.id, e]));
  const empIds = empsRaw.map(e => e.id);
  if (empIds.length === 0) return [];

  // Cross-reference termination_notices for Aviso Prévio
  const today = new Date().toISOString().split('T')[0];
  const avisoRows = await db.select({
    employeeId: terminationNotices.employeeId,
    dataFim: terminationNotices.dataFim,
    tipo: terminationNotices.tipo,
    reducaoJornada: terminationNotices.reducaoJornada,
  }).from(terminationNotices).where(and(
    inArray(terminationNotices.companyId, companyIdsArr),
    eq(terminationNotices.status, 'em_andamento'),
    sql`${terminationNotices.deletedAt} IS NULL`,
    sql`${terminationNotices.dataInicio} <= ${today}`,
    sql`${terminationNotices.dataFim} >= ${today}`,
    sql`${terminationNotices.employeeId} IN (${sql.raw(empIds.join(","))})`
  ));
  const avisoMap = new Map<number, { dataFim: string | null; tipo: string | null; dispensado: boolean }>();
  for (const r of avisoRows) {
    // Se redução = 7 dias corridos, calcular se já está no período de dispensa
    let dispensado = false;
    if (r.reducaoJornada === '7_dias_corridos' && r.dataFim) {
      const dataFimDate = new Date(r.dataFim + 'T00:00:00');
      const dataDispensa = new Date(dataFimDate);
      dataDispensa.setDate(dataDispensa.getDate() - 6); // 7 dias corridos antes do fim
      const todayDate = new Date(today + 'T00:00:00');
      if (todayDate >= dataDispensa) dispensado = true;
    }
    avisoMap.set(r.employeeId, { dataFim: r.dataFim, tipo: r.tipo, dispensado });
  }

  // Cross-reference vacation_periods for Férias em gozo
  const feriasRows = await db.select({
    employeeId: vacationPeriods.employeeId,
    dataInicio: vacationPeriods.dataInicio,
    dataFim: vacationPeriods.dataFim,
  }).from(vacationPeriods).where(and(
    inArray(vacationPeriods.companyId, companyIdsArr),
    sql`${vacationPeriods.status} IN ('em_gozo','agendada')`,
    sql`${vacationPeriods.dataInicio} IS NOT NULL`,
    sql`${vacationPeriods.dataFim} IS NOT NULL`,
    sql`${vacationPeriods.dataInicio} <= ${today}`,
    sql`${vacationPeriods.dataFim} >= ${today}`,
    sql`${vacationPeriods.employeeId} IN (${sql.raw(empIds.join(","))})`
  ));
  const feriasMap = new Map<number, { dataInicio: string | null; dataFim: string | null }>();
  for (const r of feriasRows) feriasMap.set(r.employeeId, { dataInicio: r.dataInicio, dataFim: r.dataFim });

  // Rev. 2932 — PRÓXIMA férias AGENDADA (futura) por funcionário, para mostrar
  // "quando vai sair de férias" no painel da equipe. Distinto da férias em gozo
  // acima (dataInicio <= hoje): aqui pegamos a agendada com início > hoje, a mais
  // próxima. Read-only.
  const feriasFuturasRows = await db.select({
    employeeId: vacationPeriods.employeeId,
    dataInicio: vacationPeriods.dataInicio,
    dataFim: vacationPeriods.dataFim,
  }).from(vacationPeriods).where(and(
    inArray(vacationPeriods.companyId, companyIdsArr),
    eq(vacationPeriods.status, 'agendada'),
    sql`${vacationPeriods.dataInicio} IS NOT NULL`,
    sql`${vacationPeriods.dataInicio} > ${today}`,
    sql`${vacationPeriods.employeeId} IN (${sql.raw(empIds.join(","))})`
  )).orderBy(asc(vacationPeriods.dataInicio));
  const feriasFuturasMap = new Map<number, { dataInicio: string | null; dataFim: string | null }>();
  for (const r of feriasFuturasRows) {
    // a primeira (asc) para cada funcionário é a mais próxima
    if (!feriasFuturasMap.has(r.employeeId)) feriasFuturasMap.set(r.employeeId, { dataInicio: r.dataInicio, dataFim: r.dataFim });
  }

  // Rev. 2934/2938 — INTEGRAÇÕES (por cliente, `employee_integrations`) + NRs
  // (treinamentos, `trainings.norma`) por funcionário. Lógica extraída p/ o helper
  // `buildIntegracoesNrsMaps` (reusado pelo endpoint company-wide das abas
  // "Todos"/"Sem Obra"). Tenant-safe (companyIdsArr) e read-only.
  const { integracoesMap, nrsMap } = await buildIntegracoesNrsMaps(db, companyIdsArr, empIds);

  // Rev. 2479 — enrich com status CIPA (ativo/estabilidade).
  const cipaMap = await getCipaStatusByEmployeeIds(db, companyIdsArr, empIds);

  return allocs
    .filter(a => empMap[a.employeeId])
    .map(a => {
      const emp = empMap[a.employeeId];
      const avisoInfo = avisoMap.get(a.employeeId);
      const feriasInfo = feriasMap.get(a.employeeId);
      let effectiveStatus: string = emp?.status || 'Ativo';
      if (avisoInfo) {
        effectiveStatus = avisoInfo.dispensado ? 'AvisoDispensado' : 'Aviso';
      } else if (feriasInfo) effectiveStatus = 'Ferias';
      const cipa = projectCipaFields(cipaMap, a.employeeId);
      return {
        ...a,
        employee: { ...emp, status: effectiveStatus as any, ...cipa },
        avisoDataFim: avisoInfo?.dataFim || null,
        avisoTipo: avisoInfo?.tipo || null,
        avisoDispensado: avisoInfo?.dispensado || false,
        feriasDataInicio: feriasInfo?.dataInicio || null,
        feriasDataFim: feriasInfo?.dataFim || null,
        // Rev. 2932 — próxima férias agendada (futura) + integrações SST
        feriasAgendadaInicio: feriasFuturasMap.get(a.employeeId)?.dataInicio || null,
        feriasAgendadaFim: feriasFuturasMap.get(a.employeeId)?.dataFim || null,
        integracoes: integracoesMap.get(a.employeeId) || [],
        nrs: nrsMap.get(a.employeeId) || [],
        ...cipa,
      };
    });
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
    obraAtualNome: obraMap[a.obraId] || `Obra #${a.obraId}`,
    dataInicio: a.dataInicio,
  }));
}

export async function allocateEmployeeToObra(data: { obraId: number; employeeId: number; companyId: number; funcaoNaObra?: string; dataInicio?: string; motivo?: string; registradoPor?: string; registradoPorUserId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const hoje = data.dataInicio || new Date().toISOString().split('T')[0];
  // Rev. 2559 — TUDO numa transação para fechar a janela de corrida que gerava
  // funcionários DUPLICADOS na obra (2+ linhas isActive=1 para o mesmo
  // funcionário). Antes: lia/desativava só a PRIMEIRA alocação ativa
  // (`[alocAnterior]`) e inseria uma nova — então, sob duplo-submit (o usuário
  // reclica "Alocar/Transferir" ao ver o erro transitório "Unexpected end of
  // JSON input") ou requisições concorrentes, sobravam várias ativas.
  // Agora: desativa TODAS as alocações ativas do funcionário e cria UMA nova,
  // garantindo o invariante "no máximo 1 alocação ativa por funcionário".
  try {
  return await db.transaction(async (tx) => {
    // Lock por funcionário (advisory, escopo da transação) — serializa chamadas
    // concorrentes do MESMO funcionário, fechando a janela de corrida do
    // isolamento READ COMMITTED (duas tx lendo "0 ativas" e ambas inserindo).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${data.employeeId})`);
    // Buscar TODAS as alocações ativas anteriores (pode haver duplicatas legadas).
    // Ordenado para tornar a "origem" determinística (a mais recente).
    const ativasAnteriores = await tx.select().from(obraFuncionarios)
      .where(and(eq(obraFuncionarios.employeeId, data.employeeId), eq(obraFuncionarios.isActive, 1)))
      .orderBy(desc(obraFuncionarios.dataInicio), desc(obraFuncionarios.id));
    // "Origem" = a alocação ativa mais recente — para fins de histórico
    const alocAnterior = ativasAnteriores[0];
    const obraOrigemId = alocAnterior?.obraId || null;
    const isTransferencia = !!alocAnterior;
    // Encerrar TODAS as alocações ativas anteriores (não só a primeira)
    if (ativasAnteriores.length > 0) {
      await tx.update(obraFuncionarios).set({ isActive: 0, dataFim: hoje } as any)
        .where(and(eq(obraFuncionarios.employeeId, data.employeeId), eq(obraFuncionarios.isActive, 1)));
      // Registrar saída no histórico (uma vez, referente à alocação de origem)
      await tx.insert(employeeSiteHistory).values({
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
    // Criar nova alocação (única ativa)
    const insertData: any = {
      obraId: data.obraId,
      employeeId: data.employeeId,
      companyId: data.companyId,
      funcaoNaObra: data.funcaoNaObra || null,
      dataInicio: hoje,
      isActive: 1,
    };
    const [inserted] = await tx.insert(obraFuncionarios).values(insertData).returning({ id: obraFuncionarios.id });
    // Registrar entrada no histórico
    await tx.insert(employeeSiteHistory).values({
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
    return { id: inserted.id, isTransferencia, obraOrigemId };
  });
  } catch (e: any) {
    // Backstop de banco (Rev. 2560): o índice único parcial
    // `uniq_obra_func_active_employee` impede 2 alocações ativas simultâneas. Os
    // fluxos legítimos desativam tudo antes de inserir (nunca disparam), mas se
    // um caminho concorrente fora do padrão violar (23505), traduz para uma
    // mensagem de domínio clara em vez de erro cru de banco.
    if (e?.code === '23505' && String(e?.constraint ?? e?.detail ?? '').includes('uniq_obra_func_active_employee')) {
      throw new Error('Este funcionário já está alocado em outra obra (cada funcionário só pode estar em 1 obra ativa). Atualize a tela e tente novamente.');
    }
    throw e;
  }
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
  // Rev. 2558 — retornar payload explícito (em vez de void) para garantir
  // corpo de resposta não-vazio no httpBatchLink/superjson. Idempotente: 2ª
  // chamada não acha alocação ativa (WHERE isActive=1) e vira no-op silencioso.
  return { success: true };
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
  }).returning();
  return { id: result[0].id };
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

export async function createJobFunction(data: { companyId: number; nome: string; descricao?: string; ordemServico?: string; cbo?: string; categoriaMO?: string | null }) {
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
    categoriaMO: data.categoriaMO || null,
  }).returning();
  return { id: result[0].id };
}

export async function updateJobFunction(id: number, companyId: number, data: { nome?: string; descricao?: string; ordemServico?: string; cbo?: string; isActive?: boolean; categoriaMO?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = {};
  if (data.nome !== undefined) updateData.nome = data.nome;
  if (data.descricao !== undefined) updateData.descricao = data.descricao;
  if (data.ordemServico !== undefined) updateData.ordemServico = data.ordemServico;
  if (data.cbo !== undefined) updateData.cbo = data.cbo;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.categoriaMO !== undefined) updateData.categoriaMO = data.categoriaMO;
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
  return { id: result[0].id };
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
  // `system_revisions.version` NÃO é UNIQUE — backfills antigos (Rev. 2852) geraram
  // DUPLICATAS (ex.: faixa 1859–1876 com 2–3 linhas por versão), inflando a contagem
  // e repetindo cards na tela "Controle de Revisões". Deduplicamos NA LEITURA por
  // versão, mantendo UMA entrada — a de MAIOR id (último sync via JSDoc = fonte
  // canônica mais completa). Não-destrutivo: zero ALTER/DELETE, só filtra ao ler.
  const rows = await db
    .select()
    .from(systemRevisions)
    .orderBy(desc(systemRevisions.version), desc(systemRevisions.id));
  const seen = new Set<number>();
  const out: typeof rows = [];
  for (const r of rows) {
    const v = Number(r.version);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(r);
  }
  return out;
}

export async function getLatestRevision() {
  const db = await getDb();
  if (!db) return null;
  // `version` não é UNIQUE — sob duplicatas da versão máxima, desempata por `id`
  // (maior = insert mais recente via JSDoc) p/ retorno determinístico entre réplicas.
  const rows = await db
    .select()
    .from(systemRevisions)
    .orderBy(desc(systemRevisions.version), desc(systemRevisions.id))
    .limit(1);
  return rows[0] || null;
}

export async function createRevision(data: {
  version: number;
  titulo: string;
  descricao: string;
  tipo: string;
  modulos?: string;
  criadoPor: string;
  dataPublicacao?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(systemRevisions).values(data).returning();
  return { id: Number(result[0].id) };
}

/** Retorna o conjunto de versões já registradas (leve — só a coluna version). */
export async function getRegisteredRevisionVersions(): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select({ version: systemRevisions.version }).from(systemRevisions);
  return new Set(rows.map((r) => Number(r.version)));
}

/**
 * Advisory lock (best-effort) para serializar o backfill de revisões entre múltiplas
 * réplicas/instâncias subindo ao mesmo tempo. `system_revisions.version` não é UNIQUE,
 * então sem isto dois startups simultâneos poderiam inserir as mesmas versões duplicadas.
 * Retorna true se ESTE processo obteve o lock (deve então rodar o sync e liberar depois).
 */
const REVISION_SYNC_LOCK_KEY = 47_2852;
export async function tryRevisionSyncLock(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const r: any = await db.execute(sql`SELECT pg_try_advisory_lock(${REVISION_SYNC_LOCK_KEY}) AS locked`);
    const rows = r?.rows ?? r;
    return rows?.[0]?.locked === true;
  } catch {
    return false;
  }
}
export async function releaseRevisionSyncLock(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`SELECT pg_advisory_unlock(${REVISION_SYNC_LOCK_KEY})`);
  } catch {
    /* ignore */
  }
}

/** Insere várias revisões de uma vez (uma viagem ao banco). */
export async function createRevisionsBulk(rows: Array<{
  version: number;
  titulo: string;
  descricao: string;
  tipo: string;
  modulos?: string;
  criadoPor: string;
  dataPublicacao?: string;
}>): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return 0;
  await db.insert(systemRevisions).values(rows);
  return rows.length;
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

  // 1. Buscar alocações ativas com dados do funcionário (excluir obras deletadas)
  const alocacoes = await db.select({
    obraId: obraFuncionarios.obraId,
    obraNome: obras.nome,
    obraCodigo: obras.codigo,
    obraStatus: obras.status,
    obraCidade: obras.cidade,
    employeeId: obraFuncionarios.employeeId,
    empStatus: employees.status,
  }).from(obraFuncionarios)
    .innerJoin(obras, and(eq(obraFuncionarios.obraId, obras.id), isNull(obras.deletedAt)))
    .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
    .where(and(
      inArray(obraFuncionarios.companyId, ids),
      eq(obraFuncionarios.isActive, 1),
      sql`${obras.status} NOT IN ('Concluida', 'Paralisada', 'Cancelada')`,
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`,
      isNull(employees.deletedAt),
    ));

  if (alocacoes.length === 0) return [];

  // 2. Buscar funcionários com aviso prévio em andamento (tempo real)
  const avisosAtivos = await db.select({
    employeeId: terminationNotices.employeeId,
    dataFim: terminationNotices.dataFim,
    reducaoJornada: terminationNotices.reducaoJornada,
  }).from(terminationNotices)
    .where(and(
      inArray(terminationNotices.companyId, ids),
      eq(terminationNotices.status, 'em_andamento'),
      sql`${terminationNotices.deletedAt} IS NULL`,
    ));
  const empIdsEmAviso = new Set(avisosAtivos.map(a => a.employeeId));
  // Identificar quem está no período de dispensa (7 dias corridos antes do fim)
  const empIdsDispensados = new Set<number>();
  for (const a of avisosAtivos) {
    if (a.reducaoJornada === '7_dias_corridos' && a.dataFim) {
      const dataFimDate = new Date(a.dataFim + 'T00:00:00');
      const dataDispensa = new Date(dataFimDate);
      dataDispensa.setDate(dataDispensa.getDate() - 6);
      const todayDate = new Date(today + 'T00:00:00');
      if (todayDate >= dataDispensa) empIdsDispensados.add(a.employeeId);
    }
  }

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

  // 4. Agregar por obra — sempre consolida por NOME para evitar duplicatas com mesmo nome e IDs diferentes
  const obraMap = new Map<string, {
    obraId: number; obraIds: number[]; obraNome: string; obraCodigo: string | null; obraStatus: string | null; obraCidade: string | null;
    efetivo: number; qtdAtivo: number; qtdAviso: number; qtdAvisoDispensado: number; qtdFerias: number; qtdAfastado: number; qtdRecluso: number;
  }>();

  for (const a of alocacoes) {
    // Chave sempre por nome (trim+upper) — evita duplicatas de mesma obra com IDs diferentes
    const key = (a.obraNome || '').trim().toUpperCase();
    if (!obraMap.has(key)) {
      obraMap.set(key, {
        obraId: a.obraId, obraIds: [a.obraId], obraNome: a.obraNome, obraCodigo: a.obraCodigo, obraStatus: a.obraStatus, obraCidade: a.obraCidade,
        efetivo: 0, qtdAtivo: 0, qtdAviso: 0, qtdAvisoDispensado: 0, qtdFerias: 0, qtdAfastado: 0, qtdRecluso: 0,
      });
    }
    const o = obraMap.get(key)!;
    if (!o.obraIds.includes(a.obraId)) o.obraIds.push(a.obraId);
    o.efetivo++;

    // Prioridade: Aviso Dispensado > Aviso Prévio > Férias > Status do employees
    // Aviso Dispensado = últimos 7 dias corridos, funcionário não comparece à obra
    if (empIdsEmAviso.has(a.employeeId) && empIdsDispensados.has(a.employeeId)) {
      o.qtdAvisoDispensado++;
    } else if (empIdsEmAviso.has(a.employeeId)) {
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
  // When multi-company (CONSTRUTORAS), consolidate by obra name
  const isMultiCompany = ids.length > 1;
  const obrasMap: Record<number, string> = {};
  allAlocs.forEach(a => { obrasMap[a.obraId] = a.obraNome; });
  
  const result: { mes: string; obraId: number; obraNome: string; efetivo: number }[] = [];
  
  for (const mes of mesesList) {
    const [ano, mesNum] = mes.split('-').map(Number);
    const primeiroDia = new Date(ano, mesNum - 1, 1);
    const ultimoDia = new Date(ano, mesNum, 0);
    const primDiaStr = primeiroDia.toISOString().split('T')[0];
    const ultDiaStr = ultimoDia.toISOString().split('T')[0];
    
    if (isMultiCompany) {
      // Consolidate by obra name
      const porObraNome: Record<string, { obraId: number; empSet: Set<number> }> = {};
      for (const a of allAlocs) {
        const inicio = a.dataInicio || '2000-01-01';
        const fim = a.dataFim || '2099-12-31';
        if (inicio <= ultDiaStr && fim >= primDiaStr) {
          const key = (a.obraNome || '').trim().toUpperCase();
          if (!porObraNome[key]) porObraNome[key] = { obraId: a.obraId, empSet: new Set() };
          porObraNome[key].empSet.add(a.employeeId);
        }
      }
      for (const [nameKey, data] of Object.entries(porObraNome)) {
        result.push({
          mes,
          obraId: data.obraId,
          obraNome: obrasMap[data.obraId] || nameKey,
          efetivo: data.empSet.size,
        });
      }
    } else {
      // Single company: group by obraId
      const porObra: Record<number, Set<number>> = {};
      for (const a of allAlocs) {
        const inicio = a.dataInicio || '2000-01-01';
        const fim = a.dataFim || '2099-12-31';
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
  }
  
  return result;
}

/** Funcionários sem obra alocada */
export async function getFuncionariosSemObra(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  // Buscar IDs de funcionários com alocação ativa em obra_funcionarios
  const alocados = await db.select({ employeeId: obraFuncionarios.employeeId })
    .from(obraFuncionarios)
    .where(and(
      inArray(obraFuncionarios.companyId, ids),
      eq(obraFuncionarios.isActive, 1),
    ));
  const empIdsAlocados = new Set(alocados.map(a => a.employeeId));
  
  // Buscar todos os funcionários ativos
  const allActive = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    cargo: employees.cargo,
    setor: employees.setor,
    status: employees.status,
    dataAdmissao: employees.dataAdmissao,
    fotoUrl: employees.fotoUrl,
  }).from(employees)
    .where(and(
      inArray(employees.companyId, ids),
      isNull(employees.deletedAt),
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
    ))
    .orderBy(employees.nomeCompleto);
  
  // Retornar apenas os que NÃO têm alocação ativa
  return allActive.filter(e => !empIdsAlocados.has(e.id));
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
  // Buscar obra alocada via obra_funcionarios
  const [alocAtiva] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, data.employeeId), eq(obraFuncionarios.isActive, 1)));
  const obraAlocadaId = alocAtiva?.obraId || null;
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
  return { id: result[0].id, isNew: true };
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
export async function getEquipeObra(obraId: number, companyId: number, obraIds?: number[], companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];
  const idsObra = obraIds && obraIds.length > 0 ? obraIds : [obraId];
  const idsCompany = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  const allocs = await db.select({
    employeeId: obraFuncionarios.employeeId,
    dataInicio: obraFuncionarios.dataInicio,
  }).from(obraFuncionarios).where(and(
    idsObra.length === 1 ? eq(obraFuncionarios.obraId, idsObra[0]) : inArray(obraFuncionarios.obraId, idsObra),
    inArray(obraFuncionarios.companyId, idsCompany),
    eq(obraFuncionarios.isActive, 1),
  ));
  if (allocs.length === 0) return [];
  const empIdsAll = allocs.map(a => a.employeeId);
  const emps = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    cargo: employees.cargo,
    setor: employees.setor,
    status: employees.status,
    dataAdmissao: employees.dataAdmissao,
    cpf: employees.cpf,
    fotoUrl: employees.fotoUrl,
    tipoContrato: employees.tipoContrato,
  }).from(employees).where(and(
    sql`${employees.id} IN (${sql.raw(empIdsAll.join(","))})`,
    sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`,
    isNull(employees.deletedAt),
  ));
  if (emps.length === 0) return [];
  const empIds = emps.map(e => e.id);

  // Rev. 1596 — Categoria (Direto/Indireto) por nome de função, espelhando a
  // mesma lógica usada no Portal do Cliente para preservar a paridade.
  const jobFns = await db.select({
    nome: jobFunctions.nome,
    categoriaMO: jobFunctions.categoriaMO,
  }).from(jobFunctions).where(inArray(jobFunctions.companyId, idsCompany));
  const catByFn = new Map<string, string>();
  for (const j of jobFns) {
    if (j.nome) catByFn.set(j.nome.trim().toUpperCase(), (j.categoriaMO || "").toLowerCase());
  }
  const categoriaDe = (funcao: string | null | undefined): "Direto" | "Indireto" => {
    const cat = catByFn.get((funcao || "").trim().toUpperCase()) || "";
    if (cat === "indireta_obra" || cat === "escritorio_central") return "Indireto";
    return "Direto";
  };

  // Cross-reference termination_notices for Aviso Prévio
  const today = new Date().toISOString().split('T')[0];
  const avisoRows = await db.select({
    employeeId: terminationNotices.employeeId,
    dataFim: terminationNotices.dataFim,
    tipo: terminationNotices.tipo,
    reducaoJornada: terminationNotices.reducaoJornada,
  }).from(terminationNotices).where(and(
    inArray(terminationNotices.companyId, idsCompany),
    eq(terminationNotices.status, 'em_andamento'),
    sql`${terminationNotices.deletedAt} IS NULL`,
    sql`${terminationNotices.dataInicio} <= ${today}`,
    sql`${terminationNotices.dataFim} >= ${today}`,
    sql`${terminationNotices.employeeId} IN (${sql.raw(empIds.join(","))})`
  ));
  const avisoMap = new Map<number, { dataFim: string | null; tipo: string | null; dispensado: boolean }>();
  for (const r of avisoRows) {
    let dispensado = false;
    if (r.reducaoJornada === '7_dias_corridos' && r.dataFim) {
      const dataFimDate = new Date(r.dataFim + 'T00:00:00');
      const dataDispensa = new Date(dataFimDate);
      dataDispensa.setDate(dataDispensa.getDate() - 6);
      const todayDate = new Date(today + 'T00:00:00');
      if (todayDate >= dataDispensa) dispensado = true;
    }
    avisoMap.set(r.employeeId, { dataFim: r.dataFim, tipo: r.tipo, dispensado });
  }

  // Cross-reference vacation_periods for Férias em gozo
  const feriasRows = await db.select({
    employeeId: vacationPeriods.employeeId,
    dataFim: vacationPeriods.dataFim,
    dataInicio: vacationPeriods.dataInicio,
  }).from(vacationPeriods).where(and(
    inArray(vacationPeriods.companyId, idsCompany),
    sql`${vacationPeriods.status} IN ('em_gozo','agendada')`,
    sql`${vacationPeriods.dataInicio} IS NOT NULL`,
    sql`${vacationPeriods.dataFim} IS NOT NULL`,
    sql`${vacationPeriods.dataInicio} <= ${today}`,
    sql`${vacationPeriods.dataFim} >= ${today}`,
    sql`${vacationPeriods.employeeId} IN (${sql.raw(empIds.join(","))})`
  ));
  const feriasMap = new Map<number, { dataInicio: string | null; dataFim: string | null }>();
  for (const r of feriasRows) {
    feriasMap.set(r.employeeId, { dataInicio: r.dataInicio, dataFim: r.dataFim });
  }

  // Rev. 2479 — enrich com status CIPA (ativo/estabilidade).
  const cipaMap = await getCipaStatusByEmployeeIds(db, idsCompany, empIds);

  const allocMap = Object.fromEntries(allocs.map(a => [a.employeeId, a]));
  return emps.map(e => {
    // Determine effective status: Aviso > Ferias > original status
    let effectiveStatus: string = e.status || 'Ativo';
    const avisoInfo = avisoMap.get(e.id);
    const feriasInfo = feriasMap.get(e.id);
    if (avisoInfo) {
      effectiveStatus = avisoInfo.dispensado ? 'AvisoDispensado' : 'Aviso';
    } else if (feriasInfo) effectiveStatus = 'Ferias';
    return {
      ...e,
      status: effectiveStatus,
      effectiveStatus,
      dataInicioObra: allocMap[e.id]?.dataInicio || null,
      avisoDataFim: avisoInfo?.dataFim || null,
      avisoTipo: avisoInfo?.tipo || null,
      avisoDispensado: avisoInfo?.dispensado || false,
      feriasDataInicio: feriasInfo?.dataInicio || null,
      feriasDataFim: feriasInfo?.dataFim || null,
      categoria: categoriaDe(e.funcao || e.cargo),
      ...projectCipaFields(cipaMap, e.id),
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
  
  // When multi-company (CONSTRUTORAS), consolidate by obra name
  const isMultiCompany = ids.length > 1;
  const porObraMap = new Map<string, { obraId: number; obraIds: number[]; obraNome: string; alocados: Set<number>; comPonto: Set<number>; diasPonto: number }>();
  
  for (const a of alocacoes) {
    const inicio = a.dataInicio || '2000-01-01';
    const fim = a.dataFim || '2099-12-31';
    if (inicio <= ultDia && fim >= primDia) {
      const key = isMultiCompany ? (a.obraNome || '').trim().toUpperCase() : String(a.obraId);
      if (!porObraMap.has(key)) {
        porObraMap.set(key, { obraId: a.obraId, obraIds: [a.obraId], obraNome: a.obraNome, alocados: new Set(), comPonto: new Set(), diasPonto: 0 });
      }
      const entry = porObraMap.get(key)!;
      if (!entry.obraIds.includes(a.obraId)) entry.obraIds.push(a.obraId);
      entry.alocados.add(a.employeeId);
    }
  }
  
  // Build reverse map: obraId -> consolidated key
  const obraIdToKey = new Map<number, string>();
  for (const [key, entry] of Array.from(porObraMap)) {
    for (const oid of entry.obraIds) obraIdToKey.set(oid, key);
  }
  
  // 4. Cross-reference with ponto
  for (const p of pontoRecords) {
    if (p.obraId) {
      const key = obraIdToKey.get(p.obraId);
      if (key && porObraMap.has(key)) {
        const entry = porObraMap.get(key)!;
        entry.comPonto.add(p.employeeId);
        entry.diasPonto += p.diasTrabalhados;
      }
    }
  }
  
  // 5. Count sem obra (funcionários ativos sem alocação em obra_funcionarios)
  const allActiveEmps = await db.select({ id: employees.id }).from(employees).where(and(
    inArray(employees.companyId, ids),
    isNull(employees.deletedAt),
    sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
  ));
  const alocadosIds = await db.select({ employeeId: obraFuncionarios.employeeId }).from(obraFuncionarios).where(and(
    inArray(obraFuncionarios.companyId, ids),
    eq(obraFuncionarios.isActive, 1),
  ));
  const alocadosSet = new Set(alocadosIds.map(a => a.employeeId));
  const activeEmps = allActiveEmps.filter(e => !alocadosSet.has(e.id));
  
  const result = Array.from(porObraMap.values()).map(data => ({
    obraId: data.obraId,
    obraIds: data.obraIds,
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
  const exec = await db.execute(sql`
    SELECT ug.id, ug.nome, ug.descricao, ug.cor, ug.icone, ug.ativo,
           ug."somenteVisualizacao", ug."ocultarDadosSensiveis",
           ug.acesso_todas_obras AS "acessoTodasObras",
           COALESCE(ug.ver_status_aviso, 0) AS "verStatusAviso",
           ug.module_access AS "moduleAccess",
           ug.created_at AS "createdAt", ug.updated_at AS "updatedAt",
           (SELECT COUNT(*)::int FROM user_group_members ugm WHERE ugm."groupId" = ug.id) AS "memberCount"
    FROM user_groups ug
    ORDER BY ug.nome
  `) as any;
  return (exec?.rows ?? exec ?? []) as any[];
}

export async function getUserGroupById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const exec = await db.execute(sql`
    SELECT ug.id, ug.nome, ug.descricao, ug.cor, ug.icone, ug.ativo,
           ug."somenteVisualizacao", ug."ocultarDadosSensiveis",
           ug.acesso_todas_obras AS "acessoTodasObras",
           COALESCE(ug.ver_status_aviso, 0) AS "verStatusAviso",
           ug.module_access AS "moduleAccess",
           ug.created_at AS "createdAt", ug.updated_at AS "updatedAt",
           (SELECT COUNT(*)::int FROM user_group_members ugm WHERE ugm."groupId" = ug.id) AS "memberCount"
    FROM user_groups ug
    WHERE ug.id = ${id}
    LIMIT 1
  `) as any;
  const rows = (exec?.rows ?? exec ?? []) as any[];
  return rows[0] ?? null;
}

export async function createUserGroup(data: { nome: string; descricao?: string; cor?: string; icone?: string; somenteVisualizacao?: number; ocultarDadosSensiveis?: number; acessoTodasObras?: number; verStatusAviso?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const nome = data.nome;
  const descricao = data.descricao ?? null;
  const cor = data.cor ?? '#6b7280';
  const icone = data.icone ?? 'Users';
  const somenteViz = data.somenteVisualizacao ?? 1;
  const ocultarDados = data.ocultarDadosSensiveis ?? 1;
  const acessoTodas = data.acessoTodasObras ?? 0;
  const verAviso = data.verStatusAviso ?? 0;
  const exec = await db.execute(sql`
    INSERT INTO user_groups
      (nome, descricao, cor, icone, "somenteVisualizacao", "ocultarDadosSensiveis", acesso_todas_obras, ver_status_aviso, created_at, updated_at)
    VALUES (${nome}, ${descricao}, ${cor}, ${icone}, ${somenteViz}, ${ocultarDados}, ${acessoTodas}, ${verAviso}, now(), now())
    RETURNING id
  `) as any;
  const rows = (exec?.rows ?? exec ?? []) as any[];
  return { id: Number(rows[0].id) };
}

export async function updateUserGroup(id: number, data: { nome?: string; descricao?: string; cor?: string; icone?: string; somenteVisualizacao?: number; ocultarDadosSensiveis?: number; acessoTodasObras?: number; verStatusAviso?: number; ativo?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const setObj: Record<string, any> = { updatedAt: sql`now()` };
  if (data.nome !== undefined)                 setObj.nome = data.nome;
  if (data.descricao !== undefined)            setObj.descricao = data.descricao;
  if (data.cor !== undefined)                  setObj.cor = data.cor;
  if (data.icone !== undefined)                setObj.icone = data.icone;
  if (data.somenteVisualizacao !== undefined)  setObj.somenteVisualizacao = data.somenteVisualizacao;
  if (data.ocultarDadosSensiveis !== undefined) setObj.ocultarDadosSensiveis = data.ocultarDadosSensiveis;
  if (data.acessoTodasObras !== undefined)     setObj.acessoTodasObras = data.acessoTodasObras;
  if (data.verStatusAviso !== undefined)       setObj.verStatusAviso = data.verStatusAviso;
  if (data.ativo !== undefined)                setObj.ativo = data.ativo;
  await db.update(userGroups).set(setObj).where(eq(userGroups.id, id));
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
  // Regra: cada usuário só pode pertencer a 1 grupo.
  // Remove de qualquer grupo atual antes de inserir no novo.
  await db.delete(userGroupMembers).where(eq(userGroupMembers.userId, userId));
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
/**
 * Rev. 2206 — Sigilo do status "Aviso Prévio": apenas Admin Master e
 * usuários do grupo "RH" podem enxergar o status real `Aviso`. Demais
 * usuários recebem o registro mascarado como `Ativo` (no listar, na
 * ficha individual e nas estatísticas). Pedido da Lilian: "somente o
 * usuário master e os usuários de RH poderão ver se o colaborador
 * está de aviso prévio ou não". Match do nome do grupo é case-insensitive
 * e aceita variações comuns ("RH", "DP", "RH e DP", "RH-DP", "RHDP").
 */
export async function userCanSeeAvisoStatus(userId: number, role: string | null | undefined): Promise<boolean> {
  if (role === 'admin_master') return true;
  try {
    const eff = await getUserEffectiveGroupPermissions(userId);
    // Rev. 2207 — agora usa o flag explícito `ver_status_aviso` do grupo
    // (configurável na tela Grupos de Usuários → Informações). Basta um
    // dos grupos do usuário ter o flag = 1 para liberar a visualização.
    return eff.groups.some((g: any) => Number(g.verStatusAviso || g.ver_status_aviso || 0) === 1);
  } catch {
    return false;
  }
}

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
    groups: groups.map(g => ({ id: g.id, nome: g.nome, cor: g.cor, icone: g.icone, verStatusAviso: !!(g as any).verStatusAviso })),
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

// ============================================================================
// LIXEIRA CENTRAL — captura snapshots de hard deletes para restauração
// ============================================================================

/**
 * Registra uma entrada na lixeira central antes de um hard delete.
 * Salva o snapshot completo do registro (e filhos opcionais) em JSON.
 */
export async function recordTrashEntry(params: {
  entityType: string;
  entityId: number;
  companyId?: number | null;
  obraId?: number | null;
  parentEntity?: string | null;
  parentId?: number | null;
  label: string;
  snapshot: any;
  deletedBy?: string | null;
  deletedByUserId?: number | null;
}) {
  const db = await getDb();
  if (!db) return;
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    INSERT INTO recycle_bin (entity_type, entity_id, company_id, obra_id, parent_entity, parent_id, label, snapshot, deleted_by, deleted_by_user_id)
    VALUES (
      ${params.entityType},
      ${params.entityId},
      ${params.companyId ?? null},
      ${params.obraId ?? null},
      ${params.parentEntity ?? null},
      ${params.parentId ?? null},
      ${params.label},
      ${JSON.stringify(params.snapshot)}::json,
      ${params.deletedBy ?? null},
      ${params.deletedByUserId ?? null}
    )
  `);
}

/**
 * Captura o snapshot de uma linha pelo id antes de deletar.
 * Retorna o registro encontrado (ou null) para que o caller possa salvar via recordTrashEntry.
 */
export async function captureRowSnapshot(tableName: string, id: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const { sql } = await import("drizzle-orm");
  const r = await db.execute(sql.raw(`SELECT * FROM "${tableName}" WHERE id = ${Number(id)} LIMIT 1`));
  const rows = (r as any)?.rows ?? r ?? [];
  return rows[0] ?? null;
}

/** Lista entradas ativas (não restauradas) da lixeira central, com filtro de empresa. */
export async function listTrashEntries(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  const { sql } = await import("drizzle-orm");
  const r = await db.execute(sql`
    SELECT id, entity_type AS "entityType", entity_id AS "entityId", company_id AS "companyId",
           obra_id AS "obraId", parent_entity AS "parentEntity", parent_id AS "parentId",
           label, deleted_by AS "deletedBy", deleted_by_user_id AS "deletedByUserId",
           deleted_at AS "deletedAt", snapshot
    FROM recycle_bin
    WHERE restored_at IS NULL AND (company_id = ${companyId} OR company_id IS NULL)
    ORDER BY deleted_at DESC
  `);
  return ((r as any)?.rows ?? r ?? []) as any[];
}

/** Marca entrada da lixeira como restaurada (soft delete da própria entry). */
export async function markTrashEntryRestored(trashEntryId: number) {
  const db = await getDb();
  if (!db) return;
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`UPDATE recycle_bin SET restored_at = NOW() WHERE id = ${trashEntryId}`);
}

/** Remove entrada da lixeira (exclusão definitiva do snapshot). */
export async function deleteTrashEntry(trashEntryId: number) {
  const db = await getDb();
  if (!db) return;
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`DELETE FROM recycle_bin WHERE id = ${trashEntryId}`);
}

/** Lê uma entrada específica da lixeira pelo id. */
export async function getTrashEntry(trashEntryId: number) {
  const db = await getDb();
  if (!db) return null;
  const { sql } = await import("drizzle-orm");
  const r = await db.execute(sql`SELECT * FROM recycle_bin WHERE id = ${trashEntryId} LIMIT 1`);
  const rows = (r as any)?.rows ?? r ?? [];
  return rows[0] ?? null;
}

/**
 * Re-insere o snapshot na tabela original (para restaurar hard-deletes).
 * Mantém o id original. Falha silenciosa se já existir (conflito de PK).
 */
export async function reinsertSnapshot(tableName: string, snapshot: Record<string, any>) {
  const db = await getDb();
  if (!db) return;
  const { sql } = await import("drizzle-orm");
  const cols = Object.keys(snapshot);
  if (cols.length === 0) return;
  const colList = cols.map(c => `"${c}"`).join(", ");
  const valList = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map(c => snapshot[c]);
  // pg-style direct query: drizzle-orm sql.raw com placeholders não suporta bind nativamente,
  // então serializamos os valores como literais SQL seguros.
  const literals = values.map(v => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (v instanceof Date) return `'${v.toISOString()}'`;
    if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
    return `'${String(v).replace(/'/g, "''")}'`;
  }).join(", ");
  await db.execute(sql.raw(`INSERT INTO "${tableName}" (${colList}) VALUES (${literals}) ON CONFLICT (id) DO NOTHING`));
}

/**
 * Encerra todos os contratos PJ ativos de um funcionário desligado.
 * Marca status='encerrado' e adiciona observação com motivo/data.
 * Idempotente: se não há contratos ativos, não faz nada.
 * Retorna a quantidade de contratos encerrados.
 */
export async function encerrarContratosPjDoFuncionario(
  employeeId: number,
  motivo: string,
  encerradoPorNome: string,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const hoje = new Date().toISOString().split('T')[0];
  const obsLine = `[Encerrado automaticamente em ${hoje} — ${motivo} — por ${encerradoPorNome}]`;
  const r: any = await db.execute(sql`
    UPDATE pj_contracts
    SET "status" = 'encerrado',
        "observacoes" = COALESCE("observacoes" || E'\n', '') || ${obsLine},
        "updatedAt" = NOW()
    WHERE "employeeId" = ${employeeId}
      AND "status" IN ('ativo', 'pendente_assinatura', 'suspenso')
      AND "deletedAt" IS NULL
    RETURNING id
  `);
  const rows = r?.rows ?? r ?? [];
  const count = Array.isArray(rows) ? rows.length : 0;
  if (count > 0) {
    console.log(`[PJ AutoEncerrar] Funcionário #${employeeId}: ${count} contrato(s) PJ encerrado(s) (${motivo})`);
  }
  return count;
}
