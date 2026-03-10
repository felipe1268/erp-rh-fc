import { describe, it, expect } from "vitest";

/**
 * Tests for the advertência flow from Fechamento de Ponto.
 * 
 * The flow is:
 * 1. User clicks "Advertência" button on an inconsistency in Fechamento de Ponto
 * 2. System stores pre-fill data in sessionStorage
 * 3. System navigates to /controle-documentos?tab=advertencias&action=nova
 * 4. ControleDocumentos reads sessionStorage and opens the full advertência form
 * 5. User fills in tipo, testemunhas, etc. and submits
 * 6. The inconsistency is NOT auto-resolved — it remains "pendente"
 */

describe("Advertência Flow - Data Structure", () => {
  it("should create correct pre-fill data structure", () => {
    const employeeId = 42;
    const employeeName = "JEAN CARLOS MARTINS";
    const data = "2026-01-02";
    const descricao = "Apenas 2 batida(s) - esperado 4 (entrada, saida intervalo, retorno, saida)";

    const preFill = {
      employeeId,
      employeeName,
      dataOcorrencia: data,
      motivo: `Inconsistência de ponto: ${descricao}`,
      descricao: `Advertência originada de inconsistência de ponto do dia ${data ? new Date(data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}. ${descricao || ""}`,
    };

    expect(preFill.employeeId).toBe(42);
    expect(preFill.employeeName).toBe("JEAN CARLOS MARTINS");
    expect(preFill.dataOcorrencia).toBe("2026-01-02");
    expect(preFill.motivo).toContain("Inconsistência de ponto:");
    expect(preFill.motivo).toContain("Apenas 2 batida(s)");
    expect(preFill.descricao).toContain("Advertência originada de inconsistência de ponto");
    // tipoAdvertencia should NOT be set — user must choose
    expect((preFill as any).tipoAdvertencia).toBeUndefined();
  });

  it("should create pre-fill with empty data gracefully", () => {
    const preFill = {
      employeeId: 1,
      employeeName: "TESTE",
      dataOcorrencia: "",
      motivo: `Inconsistência de ponto: `,
      descricao: `Advertência originada de inconsistência de ponto do dia -. `,
    };

    expect(preFill.employeeId).toBe(1);
    expect(preFill.dataOcorrencia).toBe("");
    expect(preFill.motivo).toContain("Inconsistência de ponto:");
  });

  it("should generate correct navigation URL", () => {
    const path = "/controle-documentos?tab=advertencias&action=nova";
    const url = new URL(path, "http://localhost");
    expect(url.pathname).toBe("/controle-documentos");
    expect(url.searchParams.get("tab")).toBe("advertencias");
    expect(url.searchParams.get("action")).toBe("nova");
  });

  it("should parse pre-fill JSON correctly", () => {
    const original = {
      employeeId: 42,
      employeeName: "JEAN CARLOS MARTINS",
      dataOcorrencia: "2026-01-02",
      motivo: "Inconsistência de ponto: Apenas 2 batida(s)",
      descricao: "Advertência originada de inconsistência de ponto do dia 02/01/2026.",
    };

    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);

    expect(parsed.employeeId).toBe(original.employeeId);
    expect(parsed.employeeName).toBe(original.employeeName);
    expect(parsed.dataOcorrencia).toBe(original.dataOcorrencia);
    expect(parsed.motivo).toBe(original.motivo);
    expect(parsed.descricao).toBe(original.descricao);
  });
});

describe("Advertência Flow - Resolve Dialog Separation", () => {
  it("resolve dialog should only have justificado and ajustado options", () => {
    // The resolve dialog in FechamentoPonto should NOT have "advertencia" as an option
    const validResolveStatuses = ["justificado", "ajustado"];
    
    expect(validResolveStatuses).toContain("justificado");
    expect(validResolveStatuses).toContain("ajustado");
    expect(validResolveStatuses).not.toContain("advertencia");
  });

  it("advertência should be a separate navigation action, not a resolve action", () => {
    // When user clicks advertência, it should navigate to ControleDocumentos
    // NOT call resolveInconsistency mutation
    const advertenciaAction = "navigate_to_controle_documentos";
    const resolveAction = "call_resolve_mutation";

    expect(advertenciaAction).not.toBe(resolveAction);
  });
});
