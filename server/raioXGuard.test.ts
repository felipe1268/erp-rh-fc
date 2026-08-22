/**
 * raioXGuard.test.ts — Rev. 5195
 * Regression coverage for the central Raio-X authorization guard.
 *
 * Runs WITHOUT vi.mock (the current Vite 7 / Vitest 2.1.9 combo breaks module
 * mocking with `__vite_ssr_exportName__`). Instead it injects in-memory
 * data-access deps via __setRaioXGuardDeps, exercising the pure authorization
 * logic with no database. The same file also runs under the standalone runner
 * scripts/raioXGuard.runner.ts (via tsx).
 *
 * Scenarios covered (per security review):
 *   - self user viewing own record                      → allowed ("self")
 *   - self user viewing another employee                → FORBIDDEN
 *   - RH/DP full user within authorized company          → allowed ("full")
 *   - RH/DP full user targeting out-of-scope company     → FORBIDDEN (never global)
 *   - admin_master                                       → allowed globally
 *   - user with no employee linkage                      → FORBIDDEN
 *   - company-A RH accessing a company-B employee        → FORBIDDEN
 *   - generic `admin` role                               → NOT full (self logic)
 *   - tenant-wide (assertFullRaioXAccess)                → self denied, full ok
 *   - direct integration-ID bypass (batch)              → self denied, out-of-scope denied
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  assertRaioXAccess,
  assertFullRaioXAccess,
  assertFullRaioXAccessForEmployees,
  assertEmployeeInCompany,
  __setRaioXGuardDeps,
  RAIO_X_FORBIDDEN_MSG,
} from "./raioXGuard";
import {
  installFixtures,
  ctxFor,
  type EmpRow,
} from "./raioXGuard.fixtures";

async function expectForbidden(fn: () => Promise<any>) {
  await expect(fn()).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: RAIO_X_FORBIDDEN_MSG,
  });
}

// Company/employee fixture:
//   company 1 (A): emp 100 (userId 10, self), emp 101 (other, userId 11)
//   company 2 (B): emp 200 (userId 20)
const BASE_EMPLOYEES: EmpRow[] = [
  { id: 100, companyId: 1, userId: 10, email: "self@a.com" },
  { id: 101, companyId: 1, userId: 11, email: "other@a.com" },
  { id: 200, companyId: 2, userId: 20, email: "b@b.com" },
];

let restore: () => void;

beforeEach(() => {
  restore?.();
  restore = installFixtures(__setRaioXGuardDeps, {
    employees: BASE_EMPLOYEES.map((e) => ({ ...e })),
    moduleAccess: {},
    userCompanies: {},
  });
});

describe("raioXGuard — denial message", () => {
  it("uses the exact string with no trailing period", () => {
    expect(RAIO_X_FORBIDDEN_MSG).toBe("Você não tem autorização pra isso");
    expect(RAIO_X_FORBIDDEN_MSG.endsWith(".")).toBe(false);
  });
});

describe("assertRaioXAccess — self user", () => {
  it("allows a self user to view their own employee record", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 10: [1] },
    });
    const mode = await assertRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" }), 100);
    expect(mode).toBe("self");
  });

  it("denies a self user viewing another employee", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 10: [1] },
    });
    await expectForbidden(() =>
      assertRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" }), 101),
    );
  });

  it("resolves self via email fallback within company scope", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: [...BASE_EMPLOYEES, { id: 150, companyId: 1, userId: null, email: "byemail@a.com" }],
      userCompanies: { 999: [1] },
    });
    const mode = await assertRaioXAccess(ctxFor({ id: 999, role: "user", email: "byemail@a.com" }), 150);
    expect(mode).toBe("self");
  });
});

describe("assertRaioXAccess — no employee linkage", () => {
  it("denies a user with no linked employee record", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 77: [1, 2] },
    });
    await expectForbidden(() =>
      assertRaioXAccess(ctxFor({ id: 77, role: "user", email: "nobody@x.com" }), 100),
    );
  });

  it("denies when the user has no company scope at all", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 10: [] },
    });
    await expectForbidden(() =>
      assertRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" }), 100),
    );
  });
});

describe("assertRaioXAccess — RH/DP full user (never global)", () => {
  it("allows an rh-dp admin to view an employee within an authorized company", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1] },
    });
    const mode = await assertRaioXAccess(ctxFor({ id: 30, role: "user", email: "rh@a.com" }), 101);
    expect(mode).toBe("full");
  });

  it("DENIES an rh-dp admin (company A) targeting a company-B employee", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1] },
    });
    await expectForbidden(() =>
      assertRaioXAccess(ctxFor({ id: 30, role: "user", email: "rh@a.com" }), 200),
    );
  });

  it("allows the same rh-dp admin once company B is in scope", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1, 2] },
    });
    const mode = await assertRaioXAccess(ctxFor({ id: 30, role: "user", email: "rh@a.com" }), 200);
    expect(mode).toBe("full");
  });
});

describe("assertRaioXAccess — admin_master", () => {
  it("allows admin_master globally (any company, no scope needed)", async () => {
    restore = installFixtures(__setRaioXGuardDeps, { employees: BASE_EMPLOYEES });
    const mode = await assertRaioXAccess(ctxFor({ id: 1, role: "admin_master" }), 200);
    expect(mode).toBe("full");
  });
});

describe("assertRaioXAccess — generic admin is NOT full", () => {
  it("treats generic admin as self (no rh-dp admin) and denies other employees", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 40: [1, 2] },
    });
    await expectForbidden(() =>
      assertRaioXAccess(ctxFor({ id: 40, role: "admin", email: "admin@nowhere.com" }), 101),
    );
  });
});

describe("assertFullRaioXAccess — tenant-wide / management", () => {
  it("denies a self user", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 10: [1] },
    });
    await expectForbidden(() => assertFullRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" })));
  });

  it("denies a generic admin (not rh-dp admin)", async () => {
    restore = installFixtures(__setRaioXGuardDeps, { userCompanies: { 40: [1, 2] } });
    await expectForbidden(() => assertFullRaioXAccess(ctxFor({ id: 40, role: "admin", email: "a@a.com" })));
  });

  it("allows an rh-dp admin, and enforces company scope when provided", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1] },
    });
    await expect(assertFullRaioXAccess(ctxFor({ id: 30, role: "user" }), 1)).resolves.toBeUndefined();
    await expectForbidden(() => assertFullRaioXAccess(ctxFor({ id: 30, role: "user" }), 2));
  });

  it("allows admin_master for any company", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {});
    await expect(assertFullRaioXAccess(ctxFor({ id: 1, role: "admin_master" }), 999)).resolves.toBeUndefined();
  });
});

describe("assertFullRaioXAccessForEmployees — batch / direct-ID bypass", () => {
  it("denies a self user attempting a bulk operation", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      userCompanies: { 10: [1] },
    });
    await expectForbidden(() =>
      assertFullRaioXAccessForEmployees(ctxFor({ id: 10, role: "user", email: "self@a.com" }), [100, 101]),
    );
  });

  it("allows an rh-dp admin when ALL targets are within authorized companies", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1] },
    });
    await expect(
      assertFullRaioXAccessForEmployees(ctxFor({ id: 30, role: "user" }), [100, 101]),
    ).resolves.toBeUndefined();
  });

  it("DENIES an rh-dp admin when ANY target is out of company scope", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1] },
    });
    await expectForbidden(() =>
      assertFullRaioXAccessForEmployees(ctxFor({ id: 30, role: "user" }), [100, 200]),
    );
  });

  it("DENIES when a target employee id does not exist", async () => {
    restore = installFixtures(__setRaioXGuardDeps, {
      employees: BASE_EMPLOYEES,
      moduleAccess: { 30: { "rh-dp": { level: "admin" } } },
      userCompanies: { 30: [1] },
    });
    await expectForbidden(() =>
      assertFullRaioXAccessForEmployees(ctxFor({ id: 30, role: "user" }), [100, 999999]),
    );
  });

  it("allows admin_master to bulk across any company", async () => {
    restore = installFixtures(__setRaioXGuardDeps, { employees: BASE_EMPLOYEES });
    await expect(
      assertFullRaioXAccessForEmployees(ctxFor({ id: 1, role: "admin_master" }), [100, 200]),
    ).resolves.toBeUndefined();
  });
});

describe("assertEmployeeInCompany — cross-tenant write protection", () => {
  beforeEach(() => {
    restore = installFixtures(__setRaioXGuardDeps, { employees: BASE_EMPLOYEES });
  });

  it("resolves when the employee's actual company matches", async () => {
    await expect(assertEmployeeInCompany(100, 1)).resolves.toBe(1);
  });

  it("denies when the employee belongs to a different company", async () => {
    await expectForbidden(() => assertEmployeeInCompany(100, 2));
  });

  it("denies when the employee does not exist", async () => {
    await expectForbidden(() => assertEmployeeInCompany(999999, 1));
  });
});
