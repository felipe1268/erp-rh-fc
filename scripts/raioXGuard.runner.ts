/**
 * scripts/raioXGuard.runner.ts — Rev. 5195
 * Standalone executable regression runner for the Raio-X authorization guard.
 *
 * Runs today via:  npx tsx scripts/raioXGuard.runner.ts
 *
 * It bypasses the currently-broken Vite 7 / Vitest 2.1.9 module-mock transform
 * by injecting in-memory data-access deps through __setRaioXGuardDeps. Exit code
 * is non-zero if any assertion fails (CI-friendly).
 */

import {
  assertRaioXAccess,
  assertFullRaioXAccess,
  assertFullRaioXAccessForEmployees,
  assertEmployeeInCompany,
  __setRaioXGuardDeps,
  RAIO_X_FORBIDDEN_MSG,
} from "../server/raioXGuard";
import { installFixtures, ctxFor, type EmpRow } from "../server/raioXGuard.fixtures";

const BASE_EMPLOYEES: EmpRow[] = [
  { id: 100, companyId: 1, userId: 10, email: "self@a.com" },
  { id: 101, companyId: 1, userId: 11, email: "other@a.com" },
  { id: 200, companyId: 2, userId: 20, email: "b@b.com" },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function bad(name: string, detail: string) {
  failed++;
  failures.push(`${name}: ${detail}`);
  console.error(`  ✗ ${name} — ${detail}`);
}

async function expectMode(name: string, fn: () => Promise<string>, expected: string) {
  try {
    const got = await fn();
    if (got === expected) ok(name);
    else bad(name, `expected mode "${expected}", got "${got}"`);
  } catch (e: any) {
    bad(name, `unexpected throw: ${e?.message ?? e}`);
  }
}

async function expectResolves(name: string, fn: () => Promise<any>) {
  try {
    await fn();
    ok(name);
  } catch (e: any) {
    bad(name, `unexpected throw: ${e?.message ?? e}`);
  }
}

async function expectForbidden(name: string, fn: () => Promise<any>) {
  try {
    await fn();
    bad(name, "expected FORBIDDEN, but call resolved");
  } catch (e: any) {
    if (e?.code === "FORBIDDEN" && e?.message === RAIO_X_FORBIDDEN_MSG) ok(name);
    else bad(name, `wrong error: code=${e?.code} message=${JSON.stringify(e?.message)}`);
  }
}

function fx(overrides: Parameters<typeof installFixtures>[1]) {
  return installFixtures(__setRaioXGuardDeps, {
    employees: BASE_EMPLOYEES.map((e) => ({ ...e })),
    ...overrides,
  });
}

async function main() {
  console.log("Raio-X guard regression runner\n");

  // denial message
  if (RAIO_X_FORBIDDEN_MSG === "Você não tem autorização pra isso" && !RAIO_X_FORBIDDEN_MSG.endsWith("."))
    ok("denial message exact, no trailing period");
  else bad("denial message", `unexpected: ${JSON.stringify(RAIO_X_FORBIDDEN_MSG)}`);

  // self user
  let r = fx({ userCompanies: { 10: [1] } });
  await expectMode("self views own record", () => assertRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" }), 100), "self");
  r();

  r = fx({ userCompanies: { 10: [1] } });
  await expectForbidden("self views another employee", () => assertRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" }), 101));
  r();

  r = installFixtures(__setRaioXGuardDeps, {
    employees: [...BASE_EMPLOYEES, { id: 150, companyId: 1, userId: null, email: "byemail@a.com" }],
    userCompanies: { 999: [1] },
  });
  await expectMode("self via email fallback (in scope)", () => assertRaioXAccess(ctxFor({ id: 999, role: "user", email: "byemail@a.com" }), 150), "self");
  r();

  // no linkage
  r = fx({ userCompanies: { 77: [1, 2] } });
  await expectForbidden("no employee linkage", () => assertRaioXAccess(ctxFor({ id: 77, role: "user", email: "nobody@x.com" }), 100));
  r();

  r = fx({ userCompanies: { 10: [] } });
  await expectForbidden("no company scope", () => assertRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" }), 100));
  r();

  // RH/DP full — never global
  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectMode("rh-dp admin views employee in-scope", () => assertRaioXAccess(ctxFor({ id: 30, role: "user", email: "rh@a.com" }), 101), "full");
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectForbidden("company-A RH accessing company-B employee", () => assertRaioXAccess(ctxFor({ id: 30, role: "user", email: "rh@a.com" }), 200));
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1, 2] } });
  await expectMode("rh-dp admin with B in scope", () => assertRaioXAccess(ctxFor({ id: 30, role: "user", email: "rh@a.com" }), 200), "full");
  r();

  // admin_master
  r = fx({});
  await expectMode("admin_master global", () => assertRaioXAccess(ctxFor({ id: 1, role: "admin_master" }), 200), "full");
  r();

  // generic admin NOT full
  r = fx({ userCompanies: { 40: [1, 2] } });
  await expectForbidden("generic admin denied other employee", () => assertRaioXAccess(ctxFor({ id: 40, role: "admin", email: "admin@nowhere.com" }), 101));
  r();

  // assertFullRaioXAccess
  r = fx({ userCompanies: { 10: [1] } });
  await expectForbidden("assertFull denies self user", () => assertFullRaioXAccess(ctxFor({ id: 10, role: "user", email: "self@a.com" })));
  r();

  r = fx({ userCompanies: { 40: [1, 2] } });
  await expectForbidden("assertFull denies generic admin", () => assertFullRaioXAccess(ctxFor({ id: 40, role: "admin", email: "a@a.com" })));
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectResolves("assertFull allows rh-dp admin (company in scope)", () => assertFullRaioXAccess(ctxFor({ id: 30, role: "user" }), 1));
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectForbidden("assertFull denies rh-dp admin (company out of scope)", () => assertFullRaioXAccess(ctxFor({ id: 30, role: "user" }), 2));
  r();

  r = fx({});
  await expectResolves("assertFull allows admin_master any company", () => assertFullRaioXAccess(ctxFor({ id: 1, role: "admin_master" }), 999));
  r();

  // batch / direct-ID bypass
  r = fx({ userCompanies: { 10: [1] } });
  await expectForbidden("batch denies self user", () => assertFullRaioXAccessForEmployees(ctxFor({ id: 10, role: "user", email: "self@a.com" }), [100, 101]));
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectResolves("batch allows rh-dp admin (all in scope)", () => assertFullRaioXAccessForEmployees(ctxFor({ id: 30, role: "user" }), [100, 101]));
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectForbidden("batch denies when any target out of scope", () => assertFullRaioXAccessForEmployees(ctxFor({ id: 30, role: "user" }), [100, 200]));
  r();

  r = fx({ moduleAccess: { 30: { "rh-dp": { level: "admin" } } }, userCompanies: { 30: [1] } });
  await expectForbidden("batch denies when a target does not exist", () => assertFullRaioXAccessForEmployees(ctxFor({ id: 30, role: "user" }), [100, 999999]));
  r();

  r = fx({});
  await expectResolves("batch allows admin_master across companies", () => assertFullRaioXAccessForEmployees(ctxFor({ id: 1, role: "admin_master" }), [100, 200]));
  r();

  // assertEmployeeInCompany — cross-tenant write protection
  r = fx({});
  await expectResolves("assertEmployeeInCompany allows matching company", () => assertEmployeeInCompany(100, 1));
  r();

  r = fx({});
  await expectForbidden("assertEmployeeInCompany denies wrong company (emp 100 is company 1)", () => assertEmployeeInCompany(100, 2));
  r();

  r = fx({});
  await expectForbidden("assertEmployeeInCompany denies nonexistent employee", () => assertEmployeeInCompany(999999, 1));
  r();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:\n" + failures.map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Runner crashed:", e);
  process.exit(1);
});
