/**
 * raioXGuard.fixtures.ts — Rev. 5195
 * Shared in-memory fixtures + dependency injection helper for Raio-X guard
 * tests. Used by both raioXGuard.test.ts (vitest) and the standalone runner
 * scripts/raioXGuard.runner.ts (tsx). No database required.
 */

export type EmpRow = {
  id: number;
  companyId: number;
  userId: number | null;
  email: string | null;
};

export type Fixtures = {
  employees?: EmpRow[];
  /** userId → module access map (e.g. { "rh-dp": { level: "admin" } }) */
  moduleAccess?: Record<number, any>;
  /** userId → authorized company IDs */
  userCompanies?: Record<number, number[]>;
};

export function ctxFor(user: { id: number; role: string; email?: string | null }) {
  return { user } as any;
}

/**
 * Installs in-memory guard deps via the provided __setRaioXGuardDeps setter.
 * Returns a restore function that reverts to the previous deps.
 */
export function installFixtures(
  setDeps: (overrides: any) => () => void,
  fx: Fixtures,
): () => void {
  const employees = fx.employees ?? [];
  const moduleAccess = fx.moduleAccess ?? {};
  const userCompanies = fx.userCompanies ?? {};

  const nonDeleted = () => employees; // fixtures never include soft-deleted rows

  return setDeps({
    getUserModuleAccessMap: async (userId: number) => moduleAccess[userId] ?? {},
    getCompaniesForUser: async (userId: number, _role: string) =>
      (userCompanies[userId] ?? []).map((id) => ({ id })),
    findEmployeesByUserId: async (userId: number, allowedCompanyIds: number[]) =>
      nonDeleted()
        .filter((e) => e.userId === userId && allowedCompanyIds.includes(e.companyId))
        .map((e) => ({ id: e.id, companyId: e.companyId })),
    findEmployeesByEmail: async (normalizedEmail: string, allowedCompanyIds: number[]) =>
      nonDeleted()
        .filter(
          (e) =>
            (e.email ?? "").trim().toLowerCase() === normalizedEmail &&
            allowedCompanyIds.includes(e.companyId),
        )
        .map((e) => ({ id: e.id, companyId: e.companyId })),
    findEmployeeCompanyId: async (employeeId: number) => {
      const row = nonDeleted().find((e) => e.id === employeeId);
      return row ? row.companyId : null;
    },
    findEmployeesByIds: async (employeeIds: number[]) =>
      nonDeleted()
        .filter((e) => employeeIds.includes(e.id))
        .map((e) => ({ id: e.id, companyId: e.companyId })),
  });
}
