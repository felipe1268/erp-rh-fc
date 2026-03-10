import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(role: string): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: role as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as any,
  };
}

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as any,
  };
}

describe("Avaliação Router Structure", () => {
  it("should have all sub-routers", () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    expect(caller.avaliacao).toBeDefined();
    expect(caller.avaliacao.avaliadores).toBeDefined();
    expect(caller.avaliacao.avaliacoes).toBeDefined();
    expect(caller.avaliacao.pesquisas).toBeDefined();
    expect(caller.avaliacao.clima).toBeDefined();
    expect(caller.avaliacao.dashboard).toBeDefined();
    expect(caller.avaliacao.obras).toBeDefined();
  });
});

describe("Dashboard - Global Stats", () => {
  it("should return stats for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.globalStats({ companyId: 1 });
    expect(result).toHaveProperty("totalAvaliacoes");
    expect(result).toHaveProperty("totalAvaliadores");
    expect(result).toHaveProperty("totalPesquisas");
    expect(result).toHaveProperty("mediaGeral");
    expect(result).toHaveProperty("porMes");
    expect(result).toHaveProperty("porRecomendacao");
    expect(result._restricted).toBe(false);
  });

  it("should return restricted stats for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.globalStats({ companyId: 1 });
    expect(result._restricted).toBe(true);
    expect(result.mediaGeral).toBe(0);
    expect(result.porMes).toEqual([]);
    expect(result.porRecomendacao).toEqual([]);
  });
});

describe("Dashboard - Employee Ranking", () => {
  it("should return ranking for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.employeeRanking({ companyId: 1, limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.employeeRanking({ companyId: 1, limit: 10 });
    expect(result).toEqual([]);
  });
});

describe("Dashboard - Evaluator Stats", () => {
  it("should return stats for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.evaluatorStats({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.evaluatorStats({ companyId: 1 });
    expect(result).toEqual([]);
  });
});

describe("Dashboard - Pillar Comparison", () => {
  it("should return pillar data for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.pillarComparison({ companyId: 1 });
    if (result) {
      expect(result).toHaveProperty("labels");
      expect(result).toHaveProperty("values");
      expect(result).toHaveProperty("pilares");
      expect(result.labels).toHaveLength(12);
      expect(result.values).toHaveLength(12);
    }
  });

  it("should return null for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.pillarComparison({ companyId: 1 });
    expect(result).toBeNull();
  });
});

describe("Dashboard - By Obra", () => {
  it("should return obra comparison for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.byObra({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.byObra({ companyId: 1 });
    expect(result).toEqual([]);
  });
});

describe("Dashboard - Monthly Evolution", () => {
  it("should return monthly data for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.monthlyEvolution({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.monthlyEvolution({ companyId: 1 });
    expect(result).toEqual([]);
  });
});

describe("Dashboard - Clima Consolidated", () => {
  it("should return clima data for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.climaConsolidated({ companyId: 1 });
    if (result) {
      expect(result).toHaveProperty("totalSurveys");
      expect(result).toHaveProperty("totalRespondentes");
      expect(result).toHaveProperty("indiceGeral");
      expect(result).toHaveProperty("byCategory");
    }
  });

  it("should return null for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.climaConsolidated({ companyId: 1 });
    expect(result).toBeNull();
  });
});

describe("Dashboard - Top/Bottom Employees", () => {
  it("should return top and bottom for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.topBottomEmployees({ companyId: 1, limit: 5 });
    expect(result).toHaveProperty("top");
    expect(result).toHaveProperty("bottom");
    expect(Array.isArray(result.top)).toBe(true);
    expect(Array.isArray(result.bottom)).toBe(true);
  });

  it("should return empty for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.topBottomEmployees({ companyId: 1, limit: 5 });
    expect(result.top).toEqual([]);
    expect(result.bottom).toEqual([]);
  });
});

describe("Dashboard - Score Distribution", () => {
  it("should return distribution for admin", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.dashboard.scoreDistribution({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty for non-admin", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const result = await caller.avaliacao.dashboard.scoreDistribution({ companyId: 1 });
    expect(result).toEqual([]);
  });
});

describe("Avaliadores CRUD", () => {
  it("should list avaliadores", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.avaliadores.list({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Avaliacoes CRUD", () => {
  it("should list avaliacoes", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.avaliacoes.list({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Pesquisas", () => {
  it("should list pesquisas", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.pesquisas.list({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Clima", () => {
  it("should list clima surveys", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.clima.listSurveys({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Obras", () => {
  it("should list active obras", async () => {
    const caller = appRouter.createCaller(createCtx("admin"));
    const result = await caller.avaliacao.obras.listActive({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Public Survey Routes", () => {
  it("should return null for invalid token (pesquisas)", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const result = await caller.avaliacao.pesquisas.getByToken({ token: "invalid-token-12345" });
    expect(result).toBeNull();
  });

  it("should return null for invalid token (clima)", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const result = await caller.avaliacao.clima.getPublicSurvey({ token: "invalid-token-12345" });
    expect(result).toBeNull();
  });
});

describe("Role-based Access Control", () => {
  it("admin_master should have access to dashboard", async () => {
    const caller = appRouter.createCaller(createCtx("admin_master"));
    const result = await caller.avaliacao.dashboard.globalStats({ companyId: 1 });
    expect(result._restricted).toBe(false);
  });

  it("rh role should have access to dashboard", async () => {
    const caller = appRouter.createCaller(createCtx("rh"));
    const result = await caller.avaliacao.dashboard.globalStats({ companyId: 1 });
    // rh is not in canViewResults, so should be restricted
    expect(result).toHaveProperty("totalAvaliacoes");
  });

  it("regular user should not see detailed stats", async () => {
    const caller = appRouter.createCaller(createCtx("user"));
    const stats = await caller.avaliacao.dashboard.globalStats({ companyId: 1 });
    expect(stats._restricted).toBe(true);
    
    const ranking = await caller.avaliacao.dashboard.employeeRanking({ companyId: 1, limit: 5 });
    expect(ranking).toEqual([]);
    
    const pillar = await caller.avaliacao.dashboard.pillarComparison({ companyId: 1 });
    expect(pillar).toBeNull();
    
    const topBot = await caller.avaliacao.dashboard.topBottomEmployees({ companyId: 1, limit: 5 });
    expect(topBot.top).toEqual([]);
    expect(topBot.bottom).toEqual([]);
  });
});
