import { describe, it, expect } from "vitest";

describe("Convenção Coletiva - listGlobal", () => {
  it("should have the listGlobal procedure defined on the sprint1.convencao router", async () => {
    const { appRouter } = await import("./routers");
    // Verify the sprint1.convencao.listGlobal procedure exists
    const sprint1 = (appRouter as any)._def.procedures;
    // The tRPC router flattens nested routers with dot notation
    const procedureKeys = Object.keys(sprint1);
    expect(procedureKeys).toContain("sprint1.convencao.listGlobal");
  });

  it("should have the listAll procedure defined on the sprint1.convencao router", async () => {
    const { appRouter } = await import("./routers");
    const sprint1 = (appRouter as any)._def.procedures;
    const procedureKeys = Object.keys(sprint1);
    expect(procedureKeys).toContain("sprint1.convencao.listAll");
  });

  it("should have create and update procedures for convencao", async () => {
    const { appRouter } = await import("./routers");
    const sprint1 = (appRouter as any)._def.procedures;
    const procedureKeys = Object.keys(sprint1);
    expect(procedureKeys).toContain("sprint1.convencao.create");
    expect(procedureKeys).toContain("sprint1.convencao.update");
  });
});
