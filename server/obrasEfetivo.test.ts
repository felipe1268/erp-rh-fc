import { describe, it, expect } from "vitest";

describe("Obras Efetivo - Router & Schema", () => {
  it("should have employee_site_history table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.employeeSiteHistory).toBeDefined();
    expect(schema.employeeSiteHistory.employeeId).toBeDefined();
    expect(schema.employeeSiteHistory.obraId).toBeDefined();
    expect(schema.employeeSiteHistory.tipo).toBeDefined();
    expect(schema.employeeSiteHistory.dataInicio).toBeDefined();
  });

  it("should have obra_ponto_inconsistencies table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.obraPontoInconsistencies).toBeDefined();
    expect(schema.obraPontoInconsistencies.employeeId).toBeDefined();
    expect(schema.obraPontoInconsistencies.obraPontoId).toBeDefined();
    expect(schema.obraPontoInconsistencies.obraAlocadaId).toBeDefined();
    expect(schema.obraPontoInconsistencies.dataPonto).toBeDefined();
    expect(schema.obraPontoInconsistencies.status).toBeDefined();
  });

  it("should export all new db functions for efetivo management", async () => {
    const db = await import("./db");
    expect(typeof db.getEmployeeSiteHistory).toBe("function");
    expect(typeof db.getEfetivoPorObra).toBe("function");
    expect(typeof db.getFuncionariosSemObra).toBe("function");
    expect(typeof db.getEfetivoHistorico).toBe("function");
    expect(typeof db.detectarInconsistenciaPonto).toBe("function");
    expect(typeof db.getInconsistenciasPendentes).toBe("function");
    expect(typeof db.resolverInconsistenciaEsporadico).toBe("function");
    expect(typeof db.resolverInconsistenciaTransferir).toBe("function");
    expect(typeof db.getOndeTrabalhouNoMes).toBe("function");
  });

  it("should have obras router with efetivo endpoints in appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    // Check for efetivo-related endpoints
    expect(procedures).toContain("obras.efetivoPorObra");
    expect(procedures).toContain("obras.semObra");
    expect(procedures).toContain("obras.efetivoHistorico");
    expect(procedures).toContain("obras.inconsistencias");
    expect(procedures).toContain("obras.resolverEsporadico");
    expect(procedures).toContain("obras.resolverTransferir");
    expect(procedures).toContain("obras.employeeHistory");
    expect(procedures).toContain("obras.ondeTrabalhou");
    expect(procedures).toContain("obras.transferirEmLote");
  });

  it("should have obras router with existing CRUD endpoints", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("obras.listActive");
    expect(procedures).toContain("obras.create");
    expect(procedures).toContain("obras.update");
    expect(procedures).toContain("obras.allocateEmployee");
    expect(procedures).toContain("obras.removeEmployee");
  });
});
