import { describe, it, expect, vi } from "vitest";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe("Aviso Prévio & Férias Router", () => {
  it("should export avisoPrevioFeriasRouter with expected procedures", async () => {
    const { avisoPrevioFeriasRouter } = await import("./routers/avisoPrevioFerias");
    expect(avisoPrevioFeriasRouter).toBeDefined();

    const procedures = Object.keys(avisoPrevioFeriasRouter._def.procedures);
    // Aviso Prévio procedures
    expect(procedures).toContain("avisoPrevio.list");
    expect(procedures).toContain("avisoPrevio.create");
    expect(procedures).toContain("avisoPrevio.update");
    expect(procedures).toContain("avisoPrevio.delete");
    expect(procedures).toContain("avisoPrevio.calcular");
    // Férias procedures
    expect(procedures).toContain("ferias.list");
    expect(procedures).toContain("ferias.create");
    expect(procedures).toContain("ferias.update");
    expect(procedures).toContain("ferias.delete");
    expect(procedures).toContain("ferias.alertas");
  });
});

describe("CIPA Router", () => {
  it("should export cipaRouter with expected procedures", async () => {
    const { cipaRouter } = await import("./routers/cipa");
    expect(cipaRouter).toBeDefined();

    const procedures = Object.keys(cipaRouter._def.procedures);
    // Elections
    expect(procedures).toContain("eleicoes.list");
    expect(procedures).toContain("eleicoes.create");
    // Members
    expect(procedures).toContain("membros.list");
    expect(procedures).toContain("membros.create");
    // Meetings
    expect(procedures).toContain("reunioes.list");
    expect(procedures).toContain("reunioes.create");
    // Extras
    expect(procedures).toContain("verificarNecessidade");
    expect(procedures).toContain("cronograma");
  });
});

describe("PJ Contracts Router", () => {
  it("should export pjContractsRouter with expected procedures", async () => {
    const { pjContractsRouter } = await import("./routers/pjContracts");
    expect(pjContractsRouter).toBeDefined();

    const procedures = Object.keys(pjContractsRouter._def.procedures);
    // Contracts
    expect(procedures).toContain("contratos.list");
    expect(procedures).toContain("contratos.create");
    expect(procedures).toContain("contratos.update");
    expect(procedures).toContain("contratos.delete");
    expect(procedures).toContain("contratos.alertas");
    expect(procedures).toContain("contratos.gerarTexto");
    // Payments
    expect(procedures).toContain("pagamentos.list");
    expect(procedures).toContain("pagamentos.create");
    // Model
    expect(procedures).toContain("modeloContrato");
  });
});

describe("AppRouter integration", () => {
  it("should include all new routers in appRouter", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter).toBeDefined();

    const topLevelProcedures = Object.keys(appRouter._def.procedures);
    // Check new routers are registered with correct prefixes
    expect(topLevelProcedures.some(p => p.startsWith("avisoPrevio."))).toBe(true);
    expect(topLevelProcedures.some(p => p.startsWith("cipa."))).toBe(true);
    expect(topLevelProcedures.some(p => p.startsWith("pj."))).toBe(true);
  });

  it("should have aviso prévio procedures accessible via avisoPrevio prefix", async () => {
    const { appRouter } = await import("./routers");
    const procs = Object.keys(appRouter._def.procedures);
    expect(procs).toContain("avisoPrevio.avisoPrevio.list");
    expect(procs).toContain("avisoPrevio.ferias.list");
  });

  it("should have CIPA procedures accessible via cipa prefix", async () => {
    const { appRouter } = await import("./routers");
    const procs = Object.keys(appRouter._def.procedures);
    expect(procs).toContain("cipa.eleicoes.list");
    expect(procs).toContain("cipa.membros.list");
    expect(procs).toContain("cipa.reunioes.list");
  });

  it("should have PJ procedures accessible via pj prefix", async () => {
    const { appRouter } = await import("./routers");
    const procs = Object.keys(appRouter._def.procedures);
    expect(procs).toContain("pj.contratos.list");
    expect(procs).toContain("pj.pagamentos.list");
    expect(procs).toContain("pj.modeloContrato");
  });
});
