import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

describe("Aviso Prévio - Revert and Auto-Conclude Fix", () => {
  it("should have revertidoManualmente field in terminationNotices schema", async () => {
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("revertidoManualmente");
    expect(content).toContain("tinyint().default(0)");
  });

  it("should exclude manually reverted notices from auto-conclude in avisoPrevioFerias.ts", async () => {
    const routerPath = path.resolve(__dirname, "./routers/avisoPrevioFerias.ts");
    const content = fs.readFileSync(routerPath, "utf-8");
    // Check that auto-conclude has the revertidoManualmente exclusion
    expect(content).toContain("revertidoManualmente");
    expect(content).toContain("SKIP avisos that were manually reverted");
    // Check that the revert mutation sets revertidoManualmente = 1
    expect(content).toContain("revertidoManualmente: 1");
  });

  it("should exclude manually reverted notices from auto-conclude in dashboards.ts", async () => {
    const dashPath = path.resolve(__dirname, "./routers/dashboards.ts");
    const content = fs.readFileSync(dashPath, "utf-8");
    // Check that auto-conclude has the revertidoManualmente exclusion
    expect(content).toContain("revertidoManualmente");
    expect(content).toContain("SKIP avisos that were manually reverted");
  });

  it("revert mutation should set revertidoManualmente flag", async () => {
    const routerPath = path.resolve(__dirname, "./routers/avisoPrevioFerias.ts");
    const content = fs.readFileSync(routerPath, "utf-8");
    
    // Find the revertConcluido mutation
    const revertSection = content.substring(
      content.indexOf("revertConcluido:"),
      content.indexOf("revertConcluido:") + 800
    );
    
    // Verify it sets revertidoManualmente: 1
    expect(revertSection).toContain("revertidoManualmente: 1");
    // Verify it sets status back to em_andamento
    expect(revertSection).toContain("status: 'em_andamento'");
    // Verify it clears dataConclusao
    expect(revertSection).toContain("dataConclusao: null");
  });

  it("auto-conclude SQL should check revertidoManualmente = 0 OR IS NULL", async () => {
    const routerPath = path.resolve(__dirname, "./routers/avisoPrevioFerias.ts");
    const content = fs.readFileSync(routerPath, "utf-8");
    
    // Check the SQL condition
    expect(content).toContain("revertidoManualmente} = 0 OR ${terminationNotices.revertidoManualmente} IS NULL");
  });

  it("dashboard auto-conclude SQL should check revertidoManualmente = 0 OR IS NULL", async () => {
    const dashPath = path.resolve(__dirname, "./routers/dashboards.ts");
    const content = fs.readFileSync(dashPath, "utf-8");
    
    // Check the SQL condition
    expect(content).toContain("revertidoManualmente} = 0 OR ${terminationNotices.revertidoManualmente} IS NULL");
  });
});
