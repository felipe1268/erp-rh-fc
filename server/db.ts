import { eq, and, like, or, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  companies, InsertCompany,
  employees, InsertEmployee,
  employeeHistory, InsertEmployeeHistory,
  userProfiles, InsertUserProfile,
  permissions, InsertPermission,
  auditLogs, InsertAuditLog,
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
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
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
  return db.select().from(users).orderBy(desc(users.createdAt));
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
  return db.select().from(companies).orderBy(companies.razaoSocial);
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function deleteCompany(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(companies).where(eq(companies.id, id));
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
  const result = await db.insert(employees).values(data);
  return { id: result[0].insertId };
}

export async function updateEmployee(id: number, companyId: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set(data).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

export async function getEmployees(companyId: number, search?: string, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(employees.companyId, companyId)];
  if (status && status !== "Todos") {
    conditions.push(eq(employees.status, status as any));
  }
  if (search) {
    conditions.push(
      or(
        like(employees.nomeCompleto, `%${search}%`),
        like(employees.cpf, `%${search}%`),
        like(employees.rg, `%${search}%`),
        like(employees.cargo, `%${search}%`),
      )!
    );
  }
  return db.select().from(employees).where(and(...conditions)).orderBy(employees.nomeCompleto);
}

export async function getEmployeeById(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId))).limit(1);
  return result[0];
}

export async function deleteEmployee(id: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId)));
}

export async function getEmployeeStats(companyId: number) {
  const db = await getDb();
  if (!db) return { total: 0, ativos: 0, ferias: 0, afastados: 0, licenca: 0, desligados: 0, reclusos: 0 };
  const result = await db.select({
    status: employees.status,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.status);
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
