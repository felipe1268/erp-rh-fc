/**
 * raioXGuard.ts — Rev. 5195
 * Central authorization helper for the Raio-X (employee dossier) system.
 *
 * Policy:
 *   admin_master → true GLOBAL access (no company scoping).
 *   "full" mode  → rh-dp module at level "admin" → full ONLY WITHIN authorized
 *                  companies (getCompaniesForUser). RH/DP full is NEVER global —
 *                  an out-of-scope target employee is denied.
 *   "self" mode  → any other authenticated user (own employee record only,
 *                  scoped to authorized companies).
 *   Generic `admin` role does NOT receive full access (LGPD / task #192).
 *
 * Denials always use:
 *   TRPCError { code: "FORBIDDEN", message: "Você não tem autorização pra isso" }
 *   (no trailing period — exact match required by frontend)
 *
 * Own-employee resolution (NEVER performs a global match):
 *   1. employees.userId == user.id, scoped to allowed companies
 *   2. Fallback: normalized email match scoped to allowed companies ONLY
 *      → ambiguous (2+ matches in scope)  → FORBIDDEN
 *      → no match in scope               → FORBIDDEN
 *
 * Company scope is ALWAYS derived server-side from getCompaniesForUser —
 * never trusted from client-supplied input.
 */

import { TRPCError } from "@trpc/server";
import { eq, and, isNull, inArray } from "drizzle-orm";
import {
  getDb as realGetDb,
  getUserModuleAccessMap as realGetUserModuleAccessMap,
  getCompaniesForUser as realGetCompaniesForUser,
} from "./db";
import { employees } from "../drizzle/schema";
import { normalizeModulePerm } from "../shared/modulePages";
import { sql } from "drizzle-orm";

// Exact message required by frontend — no trailing period.
export const RAIO_X_FORBIDDEN_MSG = "Você não tem autorização pra isso";

/**
 * Injectable data-access dependencies. Production code uses the real db module.
 * Tests may override these via __setRaioXGuardDeps to exercise the pure
 * authorization logic without a live database. This keeps the public guard API
 * unchanged while making the module unit-testable in a broken-mock toolchain.
 */
type EmpRef = { id: number; companyId: number };

type GuardDeps = {
  getUserModuleAccessMap: typeof realGetUserModuleAccessMap;
  getCompaniesForUser: typeof realGetCompaniesForUser;
  // High-level, drizzle-backed data accessors (injectable for unit tests).
  /** Employees with the given userId FK, within allowedCompanyIds, non-deleted. */
  findEmployeesByUserId: (userId: number, allowedCompanyIds: number[]) => Promise<EmpRef[]>;
  /** Employees with a normalized-email match, within allowedCompanyIds, non-deleted. */
  findEmployeesByEmail: (normalizedEmail: string, allowedCompanyIds: number[]) => Promise<EmpRef[]>;
  /** Company of a single employee (non-deleted), or null. */
  findEmployeeCompanyId: (employeeId: number) => Promise<number | null>;
  /** Existing (non-deleted) employees among the given ids. */
  findEmployeesByIds: (employeeIds: number[]) => Promise<EmpRef[]>;
};

// ─── Real, drizzle-backed default implementations ───────────────────────────
const realFindEmployeesByUserId = async (userId: number, allowedCompanyIds: number[]): Promise<EmpRef[]> => {
  const db = await realGetDb();
  if (!db) return [];
  return db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.userId, userId), inArray(employees.companyId, allowedCompanyIds), isNull(employees.deletedAt)))
    .limit(3);
};

const realFindEmployeesByEmail = async (normalizedEmail: string, allowedCompanyIds: number[]): Promise<EmpRef[]> => {
  const db = await realGetDb();
  if (!db) return [];
  return db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(
      sql`LOWER(TRIM(COALESCE(${employees.email}, ''))) = ${normalizedEmail}`,
      inArray(employees.companyId, allowedCompanyIds),
      isNull(employees.deletedAt),
    ))
    .limit(3);
};

const realFindEmployeeCompanyId = async (employeeId: number): Promise<number | null> => {
  const db = await realGetDb();
  if (!db) return null;
  const [row] = await db
    .select({ companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)))
    .limit(1);
  return row ? Number(row.companyId) : null;
};

const realFindEmployeesByIds = async (employeeIds: number[]): Promise<EmpRef[]> => {
  const db = await realGetDb();
  if (!db) return [];
  return db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(inArray(employees.id, employeeIds), isNull(employees.deletedAt)));
};

let deps: GuardDeps = {
  getUserModuleAccessMap: realGetUserModuleAccessMap,
  getCompaniesForUser: realGetCompaniesForUser,
  findEmployeesByUserId: realFindEmployeesByUserId,
  findEmployeesByEmail: realFindEmployeesByEmail,
  findEmployeeCompanyId: realFindEmployeeCompanyId,
  findEmployeesByIds: realFindEmployeesByIds,
};

/** TEST ONLY — override guard data-access deps. Returns a restore function. */
export function __setRaioXGuardDeps(overrides: Partial<GuardDeps>): () => void {
  const prev = deps;
  deps = { ...deps, ...overrides };
  return () => {
    deps = prev;
  };
}

// Internal accessors so the rest of the module uses the injectable deps.
const getUserModuleAccessMap = (...args: Parameters<typeof realGetUserModuleAccessMap>) =>
  deps.getUserModuleAccessMap(...args);
const getCompaniesForUser = (...args: Parameters<typeof realGetCompaniesForUser>) =>
  deps.getCompaniesForUser(...args);

function forbidden(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: RAIO_X_FORBIDDEN_MSG });
}

// ─── Ctx shape accepted by the guard ────────────────────────────────────────
type GuardCtx = {
  user: {
    id: number;
    role: string;
    email?: string | null;
    name?: string | null;
  };
};

/**
 * Returns true only for admin_master OR rh-dp module admin.
 * Explicit generic `admin` role is intentionally excluded (policy #192).
 */
export async function userHasFullRaioXAccess(
  userId: number,
  role: string | null | undefined,
): Promise<boolean> {
  if (role === "admin_master") return true;
  // NOTE: `admin` (generic) deliberately does NOT get full access per task #192.
  const ma = await getUserModuleAccessMap(userId);
  const perm = normalizeModulePerm("rh-dp", (ma as any)["rh-dp"]);
  return perm?.level === "admin";
}

/**
 * Derives the authoritative list of company IDs for the current user,
 * entirely server-side. Never trusts client-supplied IDs.
 */
export async function deriveAllowedCompanyIds(
  userId: number,
  role: string,
): Promise<number[]> {
  const companies = await getCompaniesForUser(userId, role);
  return (companies as any[]).map((c) => Number(c.id)).filter(Number.isFinite);
}

/**
 * Resolves the employee record that belongs to the currently logged-in user.
 * The search is ALWAYS scoped to the server-derived allowedCompanyIds list.
 * A global (cross-company) email match is never performed.
 *
 * Resolution strategy:
 *   1. employees.userId === user.id, within allowed companies
 *   2. Fallback: normalized email match within allowed companies
 *
 * Returns null when:
 *   - No match found in allowed companies
 *   - Match is ambiguous (2+ records in scope)
 *   - DB is unavailable
 */
export async function resolveOwnEmployee(
  userId: number,
  userEmail: string | null | undefined,
  allowedCompanyIds: number[],
): Promise<{ id: number; companyId: number } | null> {
  if (allowedCompanyIds.length === 0) return null;

  // Strategy 1: direct userId FK, scoped to allowed companies.
  const byUserId = await deps.findEmployeesByUserId(userId, allowedCompanyIds);
  if (byUserId.length === 1) return byUserId[0];
  // More than one match with same userId in allowed companies → ambiguous
  if (byUserId.length > 1) return null;

  // Strategy 2: email fallback — ALWAYS scoped to allowed companies (never global).
  if (!userEmail) return null;
  const normalizedEmail = userEmail.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const byEmail = await deps.findEmployeesByEmail(normalizedEmail, allowedCompanyIds);
  if (byEmail.length === 1) return byEmail[0];
  return null; // 0 → not found; 2+ → ambiguous — both deny
}

/**
 * Returns the Raio-X access status for the current user.
 * Company scope is always derived server-side (ignores any client-supplied IDs).
 *
 * Returns `{ mode: "full" | "self" | "none", employeeId?: number }`.
 * `employeeId` is only present when mode === "self".
 */
export async function getRaioXAccessStatus(
  ctx: GuardCtx,
): Promise<{ mode: "full" | "self" | "none"; employeeId?: number }> {
  const { id: userId, role, email } = ctx.user;

  if (await userHasFullRaioXAccess(userId, role)) {
    return { mode: "full" };
  }

  // Derive company scope server-side — never from client input.
  const allowedCompanyIds = await deriveAllowedCompanyIds(userId, role);
  if (allowedCompanyIds.length === 0) return { mode: "none" };

  const emp = await resolveOwnEmployee(userId, email, allowedCompanyIds);
  if (emp) return { mode: "self", employeeId: emp.id };
  return { mode: "none" };
}

/**
 * Loads the company of a target employee. Returns null if not found.
 * admin_master is exempt from company scoping (true global access).
 */
async function getEmployeeCompanyId(employeeId: number): Promise<number | null> {
  return deps.findEmployeeCompanyId(employeeId);
}

/**
 * Verifies the target employee's ACTUAL company (derived server-side) equals the
 * expected company. Prevents a caller who legitimately has multiple companies in
 * scope from persisting a record under the wrong companyId (cross-tenant write).
 *
 * Throws the central RAIO_X_FORBIDDEN_MSG on any mismatch or missing employee.
 * Returns the derived companyId on success.
 */
export async function assertEmployeeInCompany(
  employeeId: number,
  expectedCompanyId: number,
): Promise<number> {
  const actual = await getEmployeeCompanyId(employeeId);
  if (actual == null) forbidden();
  if (actual !== expectedCompanyId) forbidden();
  return actual;
}

/**
 * assertRaioXAccess — THE central guard.
 *
 * Call this at the top of every Raio-X endpoint that takes a target employeeId.
 *
 * - admin_master: true global access (no company scoping).
 * - Full-access users (rh-dp admin): "full" ONLY WITHIN their authorized
 *   companies. The target employee must belong to a company the user can access;
 *   an out-of-scope target is denied even for full users. RH/DP full is NEVER
 *   global.
 * - Self-access users: pass only when employeeId matches their own record
 *   AND that record is within their server-derived company scope.
 * - No linked employee / mismatch / out-of-scope: throws FORBIDDEN.
 *
 * Company scope is ALWAYS derived server-side (role-based via getCompaniesForUser).
 * Never trusts client-supplied companyIds.
 *
 * Returns the resolved access mode ("full" | "self") for informational use.
 */
export async function assertRaioXAccess(
  ctx: GuardCtx,
  employeeId: number,
): Promise<"full" | "self"> {
  const { id: userId, role, email } = ctx.user;

  // admin_master → true global access, no company scoping.
  if (role === "admin_master") return "full";

  // Derive company scope server-side for EVERY non-master caller.
  const allowedCompanyIds = await deriveAllowedCompanyIds(userId, role);
  if (allowedCompanyIds.length === 0) forbidden();

  // Full (rh-dp admin) → full BUT ONLY within authorized companies.
  if (await userHasFullRaioXAccess(userId, role)) {
    const targetCompanyId = await getEmployeeCompanyId(employeeId);
    if (targetCompanyId == null) forbidden();
    if (!allowedCompanyIds.includes(targetCompanyId)) forbidden();
    return "full";
  }

  // Self-access path: resolve own employee within scope and compare.
  const ownEmp = await resolveOwnEmployee(userId, email, allowedCompanyIds);
  if (!ownEmp) forbidden();
  if (ownEmp.id !== employeeId) forbidden();
  return "self";
}

/**
 * assertFullRaioXAccess — guard for tenant-wide queries and management
 * mutations that must never be available to self-only users.
 *
 * Use this for:
 *  - Endpoints where NO specific employeeId is provided and the response covers
 *    all employees in a company/tenant (list endpoints called without employeeId).
 *  - Write/management mutations that are hidden/disabled for self-only users in
 *    the Raio-X UI (create/delete/approve/etc.) — enforced server-side so a
 *    self user can never bulk-create or manage via direct API calls.
 *
 * Only full-access users (admin_master or rh-dp admin) pass. All others receive
 * FORBIDDEN — fail closed. When a companyId is provided, an rh-dp admin must
 * have that company in scope (admin_master is exempt).
 */
export async function assertFullRaioXAccess(
  ctx: GuardCtx,
  companyId?: number,
): Promise<void> {
  const { id: userId, role } = ctx.user;
  if (role === "admin_master") return; // global

  if (!(await userHasFullRaioXAccess(userId, role))) forbidden();

  // rh-dp admin: verify the requested company is within authorized scope.
  if (companyId != null) {
    const allowedCompanyIds = await deriveAllowedCompanyIds(userId, role);
    if (!allowedCompanyIds.includes(companyId)) forbidden();
  }
}

/**
 * assertFullRaioXAccessForEmployees — batch variant of assertFullRaioXAccess.
 *
 * For bulk operations spanning multiple employees (e.g. criarLote). Requires
 * full access AND (for rh-dp admins) that EVERY target employee belongs to an
 * authorized company. No self user may ever bulk-create/manage.
 */
export async function assertFullRaioXAccessForEmployees(
  ctx: GuardCtx,
  employeeIds: number[],
): Promise<void> {
  const { id: userId, role } = ctx.user;
  if (role === "admin_master") return; // global

  if (!(await userHasFullRaioXAccess(userId, role))) forbidden();

  if (employeeIds.length === 0) forbidden();

  const allowedCompanyIds = await deriveAllowedCompanyIds(userId, role);
  if (allowedCompanyIds.length === 0) forbidden();

  const uniqueIds = Array.from(new Set(employeeIds.filter((n) => Number.isFinite(n))));
  if (uniqueIds.length === 0) forbidden();

  const rows = await deps.findEmployeesByIds(uniqueIds);

  // Every requested target must exist and be within authorized company scope.
  if (rows.length !== uniqueIds.length) forbidden();
  for (const r of rows) {
    if (!allowedCompanyIds.includes(Number(r.companyId))) forbidden();
  }
}
