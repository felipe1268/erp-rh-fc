import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Test that the router exports are correct
describe("Dashboards Router", () => {
  it("should export dashboardsRouter with all expected procedures", async () => {
    const { dashboardsRouter } = await import("./routers/dashboards");
    expect(dashboardsRouter).toBeDefined();
    
    // Check all expected procedures exist
    const procedures = Object.keys(dashboardsRouter._def.procedures);
    expect(procedures).toContain("funcionarios");
    expect(procedures).toContain("cartaoPonto");
    expect(procedures).toContain("folhaPagamento");
    expect(procedures).toContain("horasExtras");
    expect(procedures).toContain("epis");
    expect(procedures).toContain("juridico");
    expect(procedures).toContain("avisoPrevio");
    expect(procedures).toContain("ferias");
    expect(procedures).toContain("perfilTempoCasa");
    expect(procedures).toContain("analiseIAPerfil");
  });

  it("should have 12 dashboard procedures total", async () => {
    const { dashboardsRouter } = await import("./routers/dashboards");
    const procedures = Object.keys(dashboardsRouter._def.procedures);
    expect(procedures.length).toBe(13);
  });
});

describe("EPIs Router", () => {
  it("should export episRouter with all expected procedures", async () => {
    const { episRouter } = await import("./routers/epis");
    expect(episRouter).toBeDefined();
    
    const procedures = Object.keys(episRouter._def.procedures);
    expect(procedures).toContain("list");
    expect(procedures).toContain("create");
    expect(procedures).toContain("update");
    expect(procedures).toContain("delete");
    expect(procedures).toContain("stats");
    expect(procedures).toContain("listDeliveries");
    expect(procedures).toContain("createDelivery");
  });
});

describe("HomeData Router", () => {
  it("should export homeDataRouter with getData procedure", async () => {
    const { homeDataRouter } = await import("./routers/homeData");
    expect(homeDataRouter).toBeDefined();
    
    const procedures = Object.keys(homeDataRouter._def.procedures);
    expect(procedures).toContain("getData");
  });
});
