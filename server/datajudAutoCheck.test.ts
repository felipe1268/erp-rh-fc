import { describe, it, expect } from "vitest";

describe("DataJud Auto-Check Router", () => {
  it("should be registered in the main appRouter", { timeout: 15000 }, async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    // Check that datajudAutoCheck procedures exist
    const datajudProcs = procedures.filter(p => p.startsWith("datajudAutoCheck."));
    expect(datajudProcs.length).toBeGreaterThan(0);
    expect(datajudProcs).toContain("datajudAutoCheck.listarAlertas");
    expect(datajudProcs).toContain("datajudAutoCheck.contarNaoLidos");
    expect(datajudProcs).toContain("datajudAutoCheck.marcarLido");
    expect(datajudProcs).toContain("datajudAutoCheck.marcarTodosLidos");
    expect(datajudProcs).toContain("datajudAutoCheck.excluirAlerta");
    expect(datajudProcs).toContain("datajudAutoCheck.getConfig");
    expect(datajudProcs).toContain("datajudAutoCheck.saveConfig");
    expect(datajudProcs).toContain("datajudAutoCheck.executarVerificacao");
  });

  it("should export startAutoCheckJob function", async () => {
    const mod = await import("./routers/datajudAutoCheck");
    expect(mod.startAutoCheckJob).toBeDefined();
    expect(typeof mod.startAutoCheckJob).toBe("function");
  });

  it("should export datajudAutoCheckRouter", async () => {
    const mod = await import("./routers/datajudAutoCheck");
    expect(mod.datajudAutoCheckRouter).toBeDefined();
  });
});

describe("DataJud Auto-Check Config Validation", () => {
  const VALID_INTERVALS = [30, 60, 120, 360, 720, 1440];

  it("should support all expected interval options", () => {
    expect(VALID_INTERVALS).toHaveLength(6);
    expect(VALID_INTERVALS).toContain(30);   // 30 min
    expect(VALID_INTERVALS).toContain(60);   // 1 hour
    expect(VALID_INTERVALS).toContain(120);  // 2 hours
    expect(VALID_INTERVALS).toContain(360);  // 6 hours
    expect(VALID_INTERVALS).toContain(720);  // 12 hours
    expect(VALID_INTERVALS).toContain(1440); // 24 hours
  });

  it("should have correct human-readable labels for intervals", () => {
    const labels: Record<number, string> = {
      30: "30 min",
      60: "1 hora",
      120: "2 horas",
      360: "6 horas",
      720: "12 horas",
      1440: "24 horas",
    };
    for (const interval of VALID_INTERVALS) {
      expect(labels[interval]).toBeDefined();
      expect(labels[interval].length).toBeGreaterThan(0);
    }
  });
});

describe("DataJud Alert Priority Logic", () => {
  const getPriority = (tipo: string, risco: string | null) => {
    if (tipo === "audiencia_marcada") return "alta";
    if (tipo === "sentenca" || tipo === "decisao") return "critica";
    if (risco === "critico") return "critica";
    if (risco === "alto") return "alta";
    return "media";
  };

  it("should assign critical priority to sentenca", () => {
    expect(getPriority("sentenca", null)).toBe("critica");
  });

  it("should assign critical priority to decisao", () => {
    expect(getPriority("decisao", null)).toBe("critica");
  });

  it("should assign high priority to audiencia_marcada", () => {
    expect(getPriority("audiencia_marcada", null)).toBe("alta");
  });

  it("should assign critical priority when risco is critico", () => {
    expect(getPriority("movimentacao", "critico")).toBe("critica");
  });

  it("should assign high priority when risco is alto", () => {
    expect(getPriority("movimentacao", "alto")).toBe("alta");
  });

  it("should assign medium priority for regular movimentacao", () => {
    expect(getPriority("movimentacao", "baixo")).toBe("media");
    expect(getPriority("movimentacao", null)).toBe("media");
  });
});

describe("DataJud Alerts Schema", () => {
  it("should have datajudAlerts table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.datajudAlerts).toBeDefined();
    const columns = Object.keys(schema.datajudAlerts as any);
    expect(columns).toContain("id");
    expect(columns).toContain("companyId");
    expect(columns).toContain("tipo");
    expect(columns).toContain("titulo");
    expect(columns).toContain("descricao");
    expect(columns).toContain("prioridade");
    expect(columns).toContain("lido");
  });

  it("should have datajudAutoCheckConfig table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.datajudAutoCheckConfig).toBeDefined();
    const columns = Object.keys(schema.datajudAutoCheckConfig as any);
    expect(columns).toContain("id");
    expect(columns).toContain("companyId");
    expect(columns).toContain("isActive");
    expect(columns).toContain("intervaloMinutos");
  });
});
