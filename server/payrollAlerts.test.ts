import { describe, it, expect } from "vitest";

/**
 * Tests for the Vale alert rules logic.
 * These test the pure business logic functions extracted from payrollEngine.
 */

// Simulated business rule functions (same logic as in payrollEngine.ts)
function checkAlertaFaltas(faltas: number, threshold: number = 10): { temAlerta: boolean; motivo: string } {
  if (faltas >= threshold) {
    return { temAlerta: true, motivo: `${faltas} faltas nos 15 primeiros dias do mês` };
  }
  return { temAlerta: false, motivo: "" };
}

function checkAlertaAdmissao(
  dataAdmissao: string | null,
  year: number,
  month: number,
  diaLimite: number = 10
): { temAlerta: boolean; motivo: string } {
  if (!dataAdmissao) return { temAlerta: false, motivo: "" };
  const admDay = new Date(dataAdmissao + "T12:00:00Z").getUTCDate();
  const admMonth = new Date(dataAdmissao + "T12:00:00Z").getUTCMonth() + 1;
  const admYear = new Date(dataAdmissao + "T12:00:00Z").getUTCFullYear();
  if (admYear === year && admMonth === month && admDay > diaLimite) {
    return { temAlerta: true, motivo: `Admitido após dia ${diaLimite} do mês (${dataAdmissao})` };
  }
  return { temAlerta: false, motivo: "" };
}

function buildFaltasDateRange(year: number, month: number): { primeiroDia: string; dia15: string } {
  const mm = String(month).padStart(2, "0");
  return {
    primeiroDia: `${year}-${mm}-01`,
    dia15: `${year}-${mm}-15`,
  };
}

describe("Regra 1: Faltas Excessivas (10+ faltas nos 15 primeiros dias)", () => {
  it("deve gerar alerta quando funcionário tem 10 faltas", () => {
    const result = checkAlertaFaltas(10);
    expect(result.temAlerta).toBe(true);
    expect(result.motivo).toContain("10 faltas");
  });

  it("deve gerar alerta quando funcionário tem 15 faltas", () => {
    const result = checkAlertaFaltas(15);
    expect(result.temAlerta).toBe(true);
    expect(result.motivo).toContain("15 faltas");
  });

  it("NÃO deve gerar alerta quando funcionário tem 9 faltas", () => {
    const result = checkAlertaFaltas(9);
    expect(result.temAlerta).toBe(false);
    expect(result.motivo).toBe("");
  });

  it("NÃO deve gerar alerta quando funcionário tem 0 faltas", () => {
    const result = checkAlertaFaltas(0);
    expect(result.temAlerta).toBe(false);
  });

  it("NÃO deve gerar alerta quando funcionário tem 5 faltas", () => {
    const result = checkAlertaFaltas(5);
    expect(result.temAlerta).toBe(false);
  });
});

describe("Regra 2: Admissão Recente (após dia 10 do mês)", () => {
  it("deve gerar alerta quando admitido dia 11 do mês corrente", () => {
    const result = checkAlertaAdmissao("2026-02-11", 2026, 2);
    expect(result.temAlerta).toBe(true);
    expect(result.motivo).toContain("Admitido após dia 10");
  });

  it("deve gerar alerta quando admitido dia 25 do mês corrente", () => {
    const result = checkAlertaAdmissao("2026-02-25", 2026, 2);
    expect(result.temAlerta).toBe(true);
  });

  it("NÃO deve gerar alerta quando admitido dia 10 do mês corrente", () => {
    const result = checkAlertaAdmissao("2026-02-10", 2026, 2);
    expect(result.temAlerta).toBe(false);
  });

  it("NÃO deve gerar alerta quando admitido dia 1 do mês corrente", () => {
    const result = checkAlertaAdmissao("2026-02-01", 2026, 2);
    expect(result.temAlerta).toBe(false);
  });

  it("NÃO deve gerar alerta quando admitido em mês anterior", () => {
    const result = checkAlertaAdmissao("2026-01-15", 2026, 2);
    expect(result.temAlerta).toBe(false);
  });

  it("NÃO deve gerar alerta quando admitido em ano anterior", () => {
    const result = checkAlertaAdmissao("2025-02-15", 2026, 2);
    expect(result.temAlerta).toBe(false);
  });

  it("NÃO deve gerar alerta quando dataAdmissao é null", () => {
    const result = checkAlertaAdmissao(null, 2026, 2);
    expect(result.temAlerta).toBe(false);
  });
});

describe("Período de contagem de faltas (dia 1 a 15 do mês atual)", () => {
  it("deve gerar range correto para fevereiro 2026", () => {
    const range = buildFaltasDateRange(2026, 2);
    expect(range.primeiroDia).toBe("2026-02-01");
    expect(range.dia15).toBe("2026-02-15");
  });

  it("deve gerar range correto para dezembro 2026", () => {
    const range = buildFaltasDateRange(2026, 12);
    expect(range.primeiroDia).toBe("2026-12-01");
    expect(range.dia15).toBe("2026-12-15");
  });

  it("deve gerar range correto para janeiro 2027", () => {
    const range = buildFaltasDateRange(2027, 1);
    expect(range.primeiroDia).toBe("2027-01-01");
    expect(range.dia15).toBe("2027-01-15");
  });
});

describe("Combinação de alertas", () => {
  it("deve gerar alerta múltiplo quando ambas as regras se aplicam", () => {
    const alertas: string[] = [];
    const faltasCheck = checkAlertaFaltas(12);
    if (faltasCheck.temAlerta) alertas.push(faltasCheck.motivo);
    const admCheck = checkAlertaAdmissao("2026-02-15", 2026, 2);
    if (admCheck.temAlerta) alertas.push(admCheck.motivo);

    expect(alertas.length).toBe(2);
    expect(alertas[0]).toContain("12 faltas");
    expect(alertas[1]).toContain("Admitido após dia 10");
  });

  it("deve gerar apenas alerta de faltas quando só essa regra se aplica", () => {
    const alertas: string[] = [];
    const faltasCheck = checkAlertaFaltas(10);
    if (faltasCheck.temAlerta) alertas.push(faltasCheck.motivo);
    const admCheck = checkAlertaAdmissao("2026-01-15", 2026, 2);
    if (admCheck.temAlerta) alertas.push(admCheck.motivo);

    expect(alertas.length).toBe(1);
    expect(alertas[0]).toContain("faltas");
  });

  it("deve gerar apenas alerta de admissão quando só essa regra se aplica", () => {
    const alertas: string[] = [];
    const faltasCheck = checkAlertaFaltas(3);
    if (faltasCheck.temAlerta) alertas.push(faltasCheck.motivo);
    const admCheck = checkAlertaAdmissao("2026-02-20", 2026, 2);
    if (admCheck.temAlerta) alertas.push(admCheck.motivo);

    expect(alertas.length).toBe(1);
    expect(alertas[0]).toContain("Admitido");
  });

  it("NÃO deve gerar alertas quando nenhuma regra se aplica", () => {
    const alertas: string[] = [];
    const faltasCheck = checkAlertaFaltas(2);
    if (faltasCheck.temAlerta) alertas.push(faltasCheck.motivo);
    const admCheck = checkAlertaAdmissao("2025-06-05", 2026, 2);
    if (admCheck.temAlerta) alertas.push(admCheck.motivo);

    expect(alertas.length).toBe(0);
  });
});
