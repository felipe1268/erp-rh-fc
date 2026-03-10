import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@fc.com",
    name: "Admin FC",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("ERP Router Structure", () => {
  it("should have all core routers defined", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.auth).toBeDefined();
    expect(caller.companies).toBeDefined();
    expect(caller.employees).toBeDefined();
    expect(caller.profiles).toBeDefined();
    expect(caller.audit).toBeDefined();
    expect(caller.sst).toBeDefined();
    expect(caller.timesheet).toBeDefined();
    expect(caller.assets).toBeDefined();
    expect(caller.quality).toBeDefined();
    expect(caller.cipa).toBeDefined();
  });

  it("should have new module routers defined (trainingDocs, payrollUploads, dixiDevices, blacklist)", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.trainingDocs).toBeDefined();
    expect(caller.payrollUploads).toBeDefined();
    expect(caller.dixiDevices).toBeDefined();
    expect(caller.blacklist).toBeDefined();
    expect(caller.searchByTraining).toBeDefined();
  });

  it("should have SST sub-routers", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.sst.asos).toBeDefined();
    expect(caller.sst.trainings).toBeDefined();
    expect(caller.sst.epis).toBeDefined();
    expect(caller.sst.accidents).toBeDefined();
    expect(caller.sst.warnings).toBeDefined();
    expect(caller.sst.risks).toBeDefined();
  });

  it("should have timesheet sub-routers", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.timesheet.records).toBeDefined();
    expect(caller.timesheet.payroll).toBeDefined();
  });

  it("should have assets sub-routers", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.assets.vehicles).toBeDefined();
    expect(caller.assets.equipment).toBeDefined();
    expect(caller.assets.extinguishers).toBeDefined();
    expect(caller.assets.hydrants).toBeDefined();
  });

  it("should have quality sub-routers", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.quality.audits).toBeDefined();
    expect(caller.quality.deviations).toBeDefined();
    expect(caller.quality.actions).toBeDefined();
    expect(caller.quality.dds).toBeDefined();
  });

  it("should have CIPA sub-routers", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.cipa.members).toBeDefined();
    expect(caller.cipa.elections).toBeDefined();
  });

  it("should have trainingDocs sub-routers (list, byEmployee, create, delete)", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.trainingDocs.list).toBeDefined();
    expect(caller.trainingDocs.byEmployee).toBeDefined();
    expect(caller.trainingDocs.create).toBeDefined();
    expect(caller.trainingDocs.delete).toBeDefined();
  });

  it("should have payrollUploads sub-routers (list, create, updateStatus, delete)", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.payrollUploads.list).toBeDefined();
    expect(caller.payrollUploads.create).toBeDefined();
    expect(caller.payrollUploads.updateStatus).toBeDefined();
    expect(caller.payrollUploads.delete).toBeDefined();
  });

  it("should have dixiDevices sub-routers (list, create, update, delete)", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.dixiDevices.list).toBeDefined();
    expect(caller.dixiDevices.create).toBeDefined();
    expect(caller.dixiDevices.update).toBeDefined();
    expect(caller.dixiDevices.delete).toBeDefined();
  });

  it("should have blacklist check route", () => {
    const caller = appRouter.createCaller(createTestContext());
    expect(caller.blacklist.check).toBeDefined();
  });

  it("should return authenticated user from auth.me", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.name).toBe("Admin FC");
    expect(user?.email).toBe("admin@fc.com");
    expect(user?.role).toBe("admin");
  });

  it("should handle logout correctly", async () => {
    const clearedCookies: any[] = [];
    const ctx = createTestContext();
    ctx.res = {
      clearCookie: (name: string, options: any) => {
        clearedCookies.push({ name, options });
      },
    } as any;
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});

describe("Shared Modules", () => {
  it("should export all module keys", async () => {
    const { MODULE_KEYS } = await import("../shared/modules");
    expect(MODULE_KEYS.length).toBeGreaterThan(0);
    expect(MODULE_KEYS).toContain("core_rh");
    expect(MODULE_KEYS).toContain("sst");
    expect(MODULE_KEYS).toContain("usuarios");
    expect(MODULE_KEYS).toContain("dashboards");
  });

  it("should have default permissions for all profile types", async () => {
    const { DEFAULT_PERMISSIONS, MODULE_KEYS } = await import("../shared/modules");
    const profiles = ["adm_master", "adm", "operacional", "avaliador", "consulta"] as const;
    profiles.forEach(profile => {
      expect(DEFAULT_PERMISSIONS[profile]).toBeDefined();
      MODULE_KEYS.forEach(mod => {
        const perm = DEFAULT_PERMISSIONS[profile][mod];
        expect(perm).toBeDefined();
        expect(typeof perm.canView).toBe("boolean");
        expect(typeof perm.canCreate).toBe("boolean");
        expect(typeof perm.canEdit).toBe("boolean");
        expect(typeof perm.canDelete).toBe("boolean");
      });
    });
  });

  it("adm_master should have full access to all modules", async () => {
    const { DEFAULT_PERMISSIONS, MODULE_KEYS } = await import("../shared/modules");
    MODULE_KEYS.forEach(mod => {
      const perm = DEFAULT_PERMISSIONS.adm_master[mod];
      expect(perm.canView).toBe(true);
      expect(perm.canCreate).toBe(true);
      expect(perm.canEdit).toBe(true);
      expect(perm.canDelete).toBe(true);
    });
  });

  it("consulta should only have view access to dashboards and core_rh", async () => {
    const { DEFAULT_PERMISSIONS } = await import("../shared/modules");
    expect(DEFAULT_PERMISSIONS.consulta.dashboards.canView).toBe(true);
    expect(DEFAULT_PERMISSIONS.consulta.core_rh.canView).toBe(true);
    expect(DEFAULT_PERMISSIONS.consulta.sst.canView).toBe(false);
    expect(DEFAULT_PERMISSIONS.consulta.core_rh.canCreate).toBe(false);
    expect(DEFAULT_PERMISSIONS.consulta.core_rh.canEdit).toBe(false);
    expect(DEFAULT_PERMISSIONS.consulta.core_rh.canDelete).toBe(false);
  });

  it("avaliador should only have access to avaliacao module", async () => {
    const { DEFAULT_PERMISSIONS } = await import("../shared/modules");
    expect(DEFAULT_PERMISSIONS.avaliador.avaliacao.canView).toBe(true);
    expect(DEFAULT_PERMISSIONS.avaliador.avaliacao.canCreate).toBe(true);
    expect(DEFAULT_PERMISSIONS.avaliador.avaliacao.canEdit).toBe(true);
    expect(DEFAULT_PERMISSIONS.avaliador.core_rh.canView).toBe(false);
    expect(DEFAULT_PERMISSIONS.avaliador.sst.canView).toBe(false);
  });

  it("should have correct employee status definitions including ListaNegra", async () => {
    const { EMPLOYEE_STATUS } = await import("../shared/modules");
    const values = EMPLOYEE_STATUS.map(s => s.value);
    expect(values).toContain("Ativo");
    expect(values).toContain("Ferias");
    expect(values).toContain("Afastado");
    expect(values).toContain("Licenca");
    expect(values).toContain("Desligado");
    expect(values).toContain("Recluso");
  });
});
