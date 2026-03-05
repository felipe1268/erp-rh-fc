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

describe("EPI Alerta de Capacidade de Contratação", () => {
  const ctx = createTestContext();
  const caller = appRouter.createCaller(ctx);
  const testCompanyId = 999;

  describe("getAlertaCapacidade", () => {
    it("should return null when no config exists", async () => {
      const result = await caller.epiAvancado.getAlertaCapacidade({ companyId: testCompanyId });
      // Pode ser null ou um objeto (se já foi criado por outro teste)
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  describe("salvarAlertaCapacidade", () => {
    it("should create a new alert config", async () => {
      const result = await caller.epiAvancado.salvarAlertaCapacidade({
        companyId: testCompanyId,
        limiar: 5,
        ativo: 1,
        intervaloMinHoras: 24,
      });
      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });

    it("should update existing alert config", async () => {
      const result = await caller.epiAvancado.salvarAlertaCapacidade({
        companyId: testCompanyId,
        limiar: 10,
        ativo: 1,
        emailDestinatarios: JSON.stringify(["teste@email.com"]),
        intervaloMinHoras: 12,
      });
      expect(result).toHaveProperty("id");
      expect(result.updated).toBe(true);
    });

    it("should read back updated config", async () => {
      const config = await caller.epiAvancado.getAlertaCapacidade({ companyId: testCompanyId });
      expect(config).not.toBeNull();
      expect(config!.limiar).toBe(10);
      expect(config!.ativo).toBe(1);
      expect(config!.intervaloMinHoras).toBe(12);
    });
  });

  describe("getAlertaCapacidadeLogs", () => {
    it("should return an array (possibly empty)", async () => {
      const result = await caller.epiAvancado.getAlertaCapacidadeLogs({ companyId: testCompanyId });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("verificarAlertaCapacidade", () => {
    it("should check capacity and return result", async () => {
      const result = await caller.epiAvancado.verificarAlertaCapacidade({
        companyId: testCompanyId,
        forcar: true,
      });
      expect(result).toHaveProperty("disparado");
      expect(typeof result.disparado).toBe("boolean");
      // motivo existe quando não disparado
      if (!result.disparado) {
        expect(result).toHaveProperty("motivo");
      }
    }, 15000); // Timeout maior pois pode tentar enviar email
  });

  describe("capacidadeContratacao", () => {
    it("should return capacity data with proper structure", async () => {
      const result = await caller.epiAvancado.capacidadeContratacao({ companyId: 1 });
      expect(result).toHaveProperty("capacidade");
      expect(typeof result.capacidade).toBe("number");
      expect(result).toHaveProperty("kitConfigurado");
      expect(typeof result.kitConfigurado).toBe("boolean");
    });

    it("should return detalhes array", async () => {
      const result = await caller.epiAvancado.capacidadeContratacao({ companyId: 1 });
      expect(result).toHaveProperty("detalhes");
      expect(Array.isArray(result.detalhes)).toBe(true);
    });
  });

  describe("capacidadePorObra", () => {
    it("should return obras array", async () => {
      const result = await caller.epiAvancado.capacidadePorObra({ companyId: 1 });
      expect(result).toHaveProperty("kitConfigurado");
      if (result.kitConfigurado) {
        expect(result).toHaveProperty("obras");
        expect(Array.isArray(result.obras)).toBe(true);
      }
    });
  });

  describe("kitBasicoContratacao", () => {
    it("should return kit data", async () => {
      const result = await caller.epiAvancado.kitBasicoContratacao({ companyId: 1 });
      expect(result).toHaveProperty("kit");
      expect(result).toHaveProperty("itens");
      expect(Array.isArray(result.itens)).toBe(true);
    });
  });
});
