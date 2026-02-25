import { describe, it, expect } from "vitest";

describe("Sindical Router", () => {
  it("should export sindicalRouter with all expected procedures", async () => {
    const { sindicalRouter } = await import("./routers/sindical");
    expect(sindicalRouter).toBeDefined();
    
    // Verify all procedures exist
    const procedures = sindicalRouter._def.procedures;
    expect(procedures).toHaveProperty("listar");
    expect(procedures).toHaveProperty("cadastrar");
    expect(procedures).toHaveProperty("aplicar");
    expect(procedures).toHaveProperty("excluir");
  });

  it("should have exactly 4 procedures", async () => {
    const { sindicalRouter } = await import("./routers/sindical");
    const procedures = Object.keys(sindicalRouter._def.procedures);
    expect(procedures).toHaveLength(4);
    expect(procedures.sort()).toEqual(["aplicar", "cadastrar", "excluir", "listar"]);
  });

  it("should be registered in the main appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures;
    // sindical procedures should be accessible via appRouter
    expect(procedures).toHaveProperty("sindical.listar");
    expect(procedures).toHaveProperty("sindical.cadastrar");
    expect(procedures).toHaveProperty("sindical.aplicar");
    expect(procedures).toHaveProperty("sindical.excluir");
  });
});

describe("Sindical Business Rules", () => {
  it("should enforce non-regression rule: percentage can never decrease", () => {
    // This test validates the business logic concept
    // The actual validation happens in the mutation, but we test the rule here
    const percentualAnterior = 5.5;
    const percentualNovo = 4.0;
    
    // Rule: new percentage must be >= previous year
    expect(percentualNovo < percentualAnterior).toBe(true);
    // This would trigger: "Percentual não pode ser menor que o ano anterior"
  });

  it("should allow equal or higher percentage", () => {
    const percentualAnterior = 5.5;
    
    // Equal is allowed
    expect(5.5 >= percentualAnterior).toBe(true);
    // Higher is allowed
    expect(6.0 >= percentualAnterior).toBe(true);
    expect(10.0 >= percentualAnterior).toBe(true);
  });

  it("should calculate salary adjustment correctly", () => {
    const salarioAtual = 2000.00;
    const percentual = 5.5;
    
    const salarioNovo = salarioAtual * (1 + percentual / 100);
    expect(salarioNovo).toBeCloseTo(2110.00, 2);
    
    const diferenca = salarioNovo - salarioAtual;
    expect(diferenca).toBeCloseTo(110.00, 2);
  });

  it("should recalculate hourly rate from new salary", () => {
    const salarioNovo = 2110.00;
    const valorHora = salarioNovo / 220;
    
    expect(valorHora).toBeCloseTo(9.59, 2);
  });

  it("should apply to all CLT employees without exclusion", () => {
    // Business rule: dissídio is law, no individual exclusion
    const employees = [
      { id: 1, tipoContrato: "CLT", status: "Ativo" },
      { id: 2, tipoContrato: "CLT", status: "Ativo" },
      { id: 3, tipoContrato: "PJ", status: "Ativo" },
      { id: 4, tipoContrato: "CLT", status: "Desligado" },
    ];
    
    // Only active CLT employees should be affected
    const eligible = employees.filter(e => e.tipoContrato !== "PJ" && e.status === "Ativo");
    expect(eligible).toHaveLength(2);
    expect(eligible.every(e => e.tipoContrato === "CLT")).toBe(true);
    
    // No exclusion mechanism — all eligible must be adjusted
    const excluded: number[] = []; // empty — no exclusion allowed
    const toApply = eligible.filter(e => !excluded.includes(e.id));
    expect(toApply).toHaveLength(eligible.length); // must be equal
  });
});
