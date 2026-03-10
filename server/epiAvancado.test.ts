import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@fcengenharia.com",
    name: "Admin Test",
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

describe("epiAvancado router", () => {
  const ctx = createTestContext();
  const caller = appRouter.createCaller(ctx);

  describe("kitsList", () => {
    it("should return an array (possibly empty) for valid companyId", async () => {
      const result = await caller.epiAvancado.kitsList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("coresCapaceteList", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.coresCapaceteList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("vidaUtilList", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.vidaUtilList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("treinamentosVinculadosList", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.treinamentosVinculadosList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("estoqueMinList", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.estoqueMinList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("alertasEstoque", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.alertasEstoque({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("episProximosVencimento", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.episProximosVencimento({ companyId: 1, diasAntecedencia: 30 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("checklistList", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.checklistList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("relatorioCusto", () => {
    it("should return an object with dados array for tipo funcionario", async () => {
      const result = await caller.epiAvancado.relatorioCusto({
        companyId: 1,
        tipo: "funcionario",
        dataInicio: "2024-01-01",
        dataFim: "2026-12-31",
      });
      expect(result).toHaveProperty("dados");
      expect(Array.isArray(result.dados)).toBe(true);
    });

    it("should return an object with dados array for tipo obra", async () => {
      const result = await caller.epiAvancado.relatorioCusto({
        companyId: 1,
        tipo: "obra",
        dataInicio: "2024-01-01",
        dataFim: "2026-12-31",
      });
      expect(result).toHaveProperty("dados");
      expect(Array.isArray(result.dados)).toBe(true);
    });

    it("should return an object with dados array for tipo mensal", async () => {
      const result = await caller.epiAvancado.relatorioCusto({
        companyId: 1,
        tipo: "mensal",
        dataInicio: "2024-01-01",
        dataFim: "2026-12-31",
      });
      expect(result).toHaveProperty("dados");
      expect(Array.isArray(result.dados)).toBe(true);
    });
  });

  describe("analisesIAList", () => {
    it("should return an array for valid companyId", async () => {
      const result = await caller.epiAvancado.analisesIAList({ companyId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("kitsCreate", () => {
    it("should create a kit and return an id", async () => {
      const result = await caller.epiAvancado.kitsCreate({
        companyId: 1,
        nome: "Kit Teste",
        funcao: "Teste",
        items: [{ nomeEpi: "Capacete", categoria: "EPI", quantidade: 1, obrigatorio: true }],
      });
      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });
  });

  describe("seedAllDefaults", () => {
    it("should seed defaults and return a success message", async () => {
      const result = await caller.epiAvancado.seedAllDefaults({ companyId: 999 });
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    });
  });
});
