import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ============================================================
// TESTES: HE Solicitações + Ponto Descontos (Motor CLT)
// ============================================================

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-master-test",
    email: "admin@fc.com.br",
    name: "Admin Master Test",
    loginMethod: "manus",
    role: "admin_master",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "user-test",
    email: "user@fc.com.br",
    name: "User Test",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ============================================================
// HE SOLICITAÇÕES ROUTER TESTS
// ============================================================
describe("heSolicitacoes router", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const userCaller = appRouter.createCaller(createUserContext());

  it("should have the heSolicitacoes router registered", () => {
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.list");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.create");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.approve");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.reject");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.cancel");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.counts");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.checkAuthorized");
    expect(appRouter._def.procedures).toHaveProperty("heSolicitacoes.bulkCheckAuthorized");
  });

  it("should list solicitações (empty for non-existent company)", async () => {
    const result = await adminCaller.heSolicitacoes.list({ companyId: 99999 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("should get counts (zero for non-existent company)", async () => {
    const result = await adminCaller.heSolicitacoes.counts({ companyId: 99999 });
    expect(result).toHaveProperty("pendentes");
    expect(result).toHaveProperty("aprovadas");
    expect(result).toHaveProperty("rejeitadas");
    expect(result).toHaveProperty("total");
    expect(result.pendentes).toBe(0);
    expect(result.total).toBe(0);
  });

  it("should check authorized HE (false for non-existent)", async () => {
    const result = await adminCaller.heSolicitacoes.checkAuthorized({
      companyId: 99999,
      employeeId: 1,
      data: "2026-02-20",
    });
    expect(result.authorized).toBe(false);
    expect(result.solicitacao).toBeNull();
  });

  it("should bulk check authorized HE (empty for non-existent)", async () => {
    const result = await adminCaller.heSolicitacoes.bulkCheckAuthorized({
      companyId: 99999,
      mesReferencia: "2026-02",
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("should reject approval from non-admin user", async () => {
    try {
      await userCaller.heSolicitacoes.approve({ id: 1 });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("FORBIDDEN");
    }
  });

  it("should reject rejection from non-admin user", async () => {
    try {
      await userCaller.heSolicitacoes.reject({ id: 1, motivoRejeicao: "Teste de rejeição" });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("FORBIDDEN");
    }
  });

  it("should validate create input - motivo too short", async () => {
    try {
      await adminCaller.heSolicitacoes.create({
        companyId: 1,
        dataSolicitacao: "2026-02-20",
        motivo: "ab",
        funcionarioIds: [1],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("BAD_REQUEST");
    }
  });

  it("should validate create input - no funcionarios", async () => {
    try {
      await adminCaller.heSolicitacoes.create({
        companyId: 1,
        dataSolicitacao: "2026-02-20",
        motivo: "Teste de motivo válido",
        funcionarioIds: [],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("BAD_REQUEST");
    }
  });
});

// ============================================================
// PONTO DESCONTOS ROUTER TESTS
// ============================================================
describe("pontoDescontos router", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const userCaller = appRouter.createCaller(createUserContext());

  it("should have the pontoDescontos router registered", () => {
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.calcularMes");
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.listByMonth");
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.listResumo");
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.totaisMes");
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.abonar");
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.revisar");
    expect(appRouter._def.procedures).toHaveProperty("pontoDescontos.fecharMes");
  });

  it("should list descontos by month (empty for non-existent company)", async () => {
    const result = await adminCaller.pontoDescontos.listByMonth({
      companyId: 99999,
      mesReferencia: "2026-02",
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("should list resumo (empty for non-existent company)", async () => {
    const result = await adminCaller.pontoDescontos.listResumo({
      companyId: 99999,
      mesReferencia: "2026-02",
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("should get totais (null/zero for non-existent company)", async () => {
    const result = await adminCaller.pontoDescontos.totaisMes({
      companyId: 99999,
      mesReferencia: "2026-02",
    });
    expect(result).not.toBeNull();
    expect(result!.totalEventos).toBe(0);
    expect(result!.totalAtrasos).toBe(0);
    expect(result!.totalFaltas).toBe(0);
    expect(result!.funcionariosAfetados).toBe(0);
  });

  it("should reject fecharMes from non-admin user", async () => {
    try {
      await userCaller.pontoDescontos.fecharMes({
        companyId: 1,
        mesReferencia: "2026-02",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("FORBIDDEN");
    }
  });

  it("should validate abonar input - motivo too short", async () => {
    try {
      await adminCaller.pontoDescontos.abonar({
        id: 1,
        motivoAbono: "ab",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("BAD_REQUEST");
    }
  });

  it("should validate mesReferencia format", async () => {
    try {
      await adminCaller.pontoDescontos.calcularMes({
        companyId: 1,
        mesReferencia: "2026/02",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("BAD_REQUEST");
    }
  });

  it("should calculate descontos for company with no employees", async () => {
    const result = await adminCaller.pontoDescontos.calcularMes({
      companyId: 99999,
      mesReferencia: "2026-02",
    });
    expect(result.success).toBe(undefined); // returns message about no employees
    expect(result.totalFuncionarios).toBe(0);
  });
});
