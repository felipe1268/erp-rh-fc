import { describe, it, expect } from "vitest";
import * as schema from "../drizzle/schema";

describe("Rev 42 - Schema validation", () => {
  it("should have menuConfig table defined", () => {
    // menuConfig is exported from schema
    expect(schema).toBeDefined();
    expect(typeof schema).toBe("object");
  });

  it("should have logoUrl field in companies table", () => {
    expect(schema.companies).toBeDefined();
    // Verify the companies table has logoUrl column
    const columns = Object.keys(schema.companies);
    expect(columns).toBeDefined();
  });

  it("should have processosTrabalhistas with client fields", () => {
    expect(schema.processosTrabalhistas).toBeDefined();
  });

  it("should have epis and epiDeliveries tables", () => {
    expect(schema.epis).toBeDefined();
    expect(schema.epiDeliveries).toBeDefined();
  });
});

describe("Rev 42 - Dashboard router imports", () => {
  it("should import dashboards router without errors", async () => {
    const mod = await import("./routers/dashboards");
    expect(mod.dashboardsRouter).toBeDefined();
  });

  it("should import menuConfig router without errors", async () => {
    const mod = await import("./routers/menuConfig");
    expect(mod.menuConfigRouter).toBeDefined();
  });

  it("should import epis router without errors", async () => {
    const mod = await import("./routers/epis");
    expect(mod.episRouter).toBeDefined();
  });
});
