import { describe, it, expect, vi } from "vitest";

// Test the visaoPanoramica module structure
describe("visaoPanoramica router", () => {
  it("should export a visaoPanoramicaRouter with getData and analiseIA procedures", async () => {
    const { visaoPanoramicaRouter } = await import("./routers/visaoPanoramica");
    expect(visaoPanoramicaRouter).toBeDefined();
    // Check that the router has the expected procedures
    const procedures = visaoPanoramicaRouter._def.procedures;
    expect(procedures).toHaveProperty("getData");
    expect(procedures).toHaveProperty("analiseIA");
  });

  it("getData should be a query procedure", async () => {
    const { visaoPanoramicaRouter } = await import("./routers/visaoPanoramica");
    const getData = visaoPanoramicaRouter._def.procedures.getData;
    expect(getData).toBeDefined();
    expect(getData._def.type).toBe("query");
  });

  it("analiseIA should be a mutation procedure", async () => {
    const { visaoPanoramicaRouter } = await import("./routers/visaoPanoramica");
    const analiseIA = visaoPanoramicaRouter._def.procedures.analiseIA;
    expect(analiseIA).toBeDefined();
    expect(analiseIA._def.type).toBe("mutation");
  });
});

// Test helper functions
describe("formatting helpers", () => {
  it("should format money values correctly", () => {
    const fmtMoney = (v: number) =>
      v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    expect(fmtMoney(1000)).toContain("1.000");
    expect(fmtMoney(0)).toContain("0");
  });

  it("should format percentage values correctly", () => {
    const fmtPercent = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
    expect(fmtPercent(5.5)).toBe("+5.5%");
    expect(fmtPercent(-3.2)).toBe("-3.2%");
    expect(fmtPercent(0)).toBe("0.0%");
  });
});
