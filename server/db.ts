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

// ============================================================
// SST: ASOs
// ============================================================
import {
  asos, trainings, epis, epiDeliveries, accidents, warnings, risks,
  timeRecords, payroll,
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
  const conds = [eq(warnings.companyId, companyId)];
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

  const [asosVencidos] = await db.select({ count: sql<number>`count(*)` }).from(asos)
    .where(and(eq(asos.companyId, companyId), sql`${asos.dataValidade} < ${today}`));
  const [treinamentosVencer] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataValidade} < ${today}`));
  const [acidentesMes] = await db.select({ count: sql<number>`count(*)` }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${firstDayMonth}`));
  const [advertenciasMes] = await db.select({ count: sql<number>`count(*)` }).from(warnings)
    .where(and(eq(warnings.companyId, companyId), sql`${warnings.dataOcorrencia} >= ${firstDayMonth}`));

  return {
    asosVencidos: Number(asosVencidos?.count ?? 0),
    treinamentosVencer: Number(treinamentosVencer?.count ?? 0),
    acidentesMes: Number(acidentesMes?.count ?? 0),
    advertenciasMes: Number(advertenciasMes?.count ?? 0),
  };
}
