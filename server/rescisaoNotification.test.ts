import { describe, it, expect } from "vitest";

describe("Rescisão Notification Module", () => {
  it("should export startRescisaoCheckJob function", async () => {
    const mod = await import("./routers/rescisaoNotification");
    expect(mod.startRescisaoCheckJob).toBeDefined();
    expect(typeof mod.startRescisaoCheckJob).toBe("function");
  });

  it("should be imported in server startup", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const indexContent = fs.readFileSync(
      path.resolve(__dirname, "./_core/index.ts"),
      "utf-8"
    );
    expect(indexContent).toContain("rescisaoNotification");
    expect(indexContent).toContain("startRescisaoCheckJob");
  });
});

describe("Recálculo em Tempo Real", () => {
  it("should have parseBRL imported in visaoPanoramica", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "./routers/visaoPanoramica.ts"),
      "utf-8"
    );
    expect(content).toContain("parseBRL");
    // Should NOT use parseFloat for salary calculations
    expect(content).not.toMatch(/parseFloat\(.*salarioBase/);
  });

  it("should have calcularRescisaoCompleta imported in dashboards", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "./routers/dashboards.ts"),
      "utf-8"
    );
    expect(content).toContain("calcularRescisaoCompleta");
    expect(content).toContain("parseBRL");
  });

  it("should have recalculation in avisoPrevioFerias list", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "./routers/avisoPrevioFerias.ts"),
      "utf-8"
    );
    // The list procedure should recalculate values
    expect(content).toContain("calcularRescisaoCompleta");
    // The getById should include employee data
    expect(content).toContain("employeeName");
    expect(content).toContain("employeeCpf");
    expect(content).toContain("employeeCargo");
  });

  it("should have gerarPdf procedure in avisoPrevioFerias", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "./routers/avisoPrevioFerias.ts"),
      "utf-8"
    );
    expect(content).toContain("gerarPdf");
  });
});

describe("Version Update", () => {
  it("should be at revision 194", async () => {
    const { APP_VERSION_NUMBER } = await import("../shared/version");
    expect(APP_VERSION_NUMBER).toBe(194);
  });
});
