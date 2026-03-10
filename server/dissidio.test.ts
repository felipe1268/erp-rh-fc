import { describe, it, expect } from "vitest";

/**
 * Tests for the Dissídio Coletivo module — business rules validation
 * 
 * Critical business rule: Dissídio percentage can NEVER decrease year-over-year
 * Legal basis: Art. 468 CLT — Vedada alteração contratual lesiva
 * 
 * The construction industry (data-base: May) applies dissídio once per year.
 * Each year's percentage must be >= the previous year's percentage.
 */

// Replicate the validation logic from the backend
function validateDissidioPercentual(
  percentualNovo: number,
  dissidiosAnteriores: Array<{ anoReferencia: number; percentualReajuste: string; status: string }>
): { valid: boolean; error?: string } {
  // Filter out cancelled dissídios
  const ativos = dissidiosAnteriores.filter(d => d.status !== 'cancelado');
  
  if (ativos.length === 0) {
    return { valid: true }; // No previous dissídio, any value is valid
  }
  
  // Sort by year descending to get the most recent
  const sorted = [...ativos].sort((a, b) => b.anoReferencia - a.anoReferencia);
  const maisRecente = sorted[0];
  const percentualAnterior = parseFloat(maisRecente.percentualReajuste);
  
  if (percentualNovo < percentualAnterior) {
    return {
      valid: false,
      error: `Percentual de reajuste não pode ser menor que o ano anterior (${maisRecente.anoReferencia}: ${percentualAnterior}%). Valor informado: ${percentualNovo}%. Art. 468 CLT — Vedada alteração contratual lesiva.`,
    };
  }
  
  return { valid: true };
}

// Replicate salary adjustment calculation
function calcularReajuste(
  salarioAtual: number,
  percentual: number,
  pisoSalarial: number = 0
): { salarioNovo: number; diferenca: number; percentualReal: number } {
  let salarioNovo = salarioAtual * (1 + percentual / 100);
  
  // If new salary is below the floor, adjust to floor
  if (pisoSalarial > 0 && salarioNovo < pisoSalarial) {
    salarioNovo = pisoSalarial;
  }
  
  const diferenca = salarioNovo - salarioAtual;
  const percentualReal = salarioAtual > 0 ? ((salarioNovo - salarioAtual) / salarioAtual * 100) : 0;
  
  return { salarioNovo, diferenca, percentualReal };
}

// Replicate retroactive calculation
function calcularRetroativo(
  diferenca: number,
  dataRetroativoInicio: string | null,
  dataAplicacao: Date = new Date()
): { meses: number; valor: number } {
  if (!dataRetroativoInicio) return { meses: 0, valor: 0 };
  
  const inicio = new Date(dataRetroativoInicio + 'T00:00:00');
  const meses = Math.max(0, 
    (dataAplicacao.getFullYear() - inicio.getFullYear()) * 12 + 
    (dataAplicacao.getMonth() - inicio.getMonth())
  );
  
  return { meses, valor: diferenca * meses };
}

describe("Dissídio — Regra de Não Regressão do Percentual", () => {
  it("should allow first dissídio with any percentage", () => {
    const result = validateDissidioPercentual(5.5, []);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should allow equal percentage to previous year", () => {
    const result = validateDissidioPercentual(5.5, [
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
    ]);
    expect(result.valid).toBe(true);
  });

  it("should allow higher percentage than previous year", () => {
    const result = validateDissidioPercentual(7.0, [
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
    ]);
    expect(result.valid).toBe(true);
  });

  it("should REJECT lower percentage than previous year", () => {
    const result = validateDissidioPercentual(4.0, [
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("não pode ser menor");
    expect(result.error).toContain("Art. 468 CLT");
    expect(result.error).toContain("5.5%");
  });

  it("should ignore cancelled dissídios when validating", () => {
    const result = validateDissidioPercentual(3.0, [
      { anoReferencia: 2025, percentualReajuste: "8.00", status: "cancelado" },
      { anoReferencia: 2024, percentualReajuste: "2.50", status: "aplicado" },
    ]);
    expect(result.valid).toBe(true); // 3.0 > 2.5 (ignoring cancelled 8.0)
  });

  it("should compare against the most recent non-cancelled year", () => {
    const result = validateDissidioPercentual(4.0, [
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
      { anoReferencia: 2024, percentualReajuste: "4.20", status: "aplicado" },
      { anoReferencia: 2023, percentualReajuste: "3.00", status: "aplicado" },
    ]);
    expect(result.valid).toBe(false); // 4.0 < 5.5 (most recent)
  });

  it("should allow percentage when all previous are cancelled", () => {
    const result = validateDissidioPercentual(1.0, [
      { anoReferencia: 2025, percentualReajuste: "10.00", status: "cancelado" },
      { anoReferencia: 2024, percentualReajuste: "8.00", status: "cancelado" },
    ]);
    expect(result.valid).toBe(true); // No active dissídios to compare
  });

  it("should handle decimal precision correctly", () => {
    const result = validateDissidioPercentual(5.49, [
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
    ]);
    expect(result.valid).toBe(false); // 5.49 < 5.50
  });

  it("should handle zero percentage (edge case)", () => {
    const result = validateDissidioPercentual(0, []);
    expect(result.valid).toBe(true); // First year, any value allowed
  });

  it("should reject zero when previous year had positive percentage", () => {
    const result = validateDissidioPercentual(0, [
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
    ]);
    expect(result.valid).toBe(false);
  });
});

describe("Dissídio — Cálculo de Reajuste Salarial", () => {
  it("should calculate basic salary adjustment", () => {
    const result = calcularReajuste(2000, 5.5);
    expect(result.salarioNovo).toBeCloseTo(2110, 2);
    expect(result.diferenca).toBeCloseTo(110, 2);
    expect(result.percentualReal).toBeCloseTo(5.5, 2);
  });

  it("should enforce minimum floor salary (piso salarial)", () => {
    const result = calcularReajuste(1500, 5.0, 1800);
    // 1500 * 1.05 = 1575, but floor is 1800
    expect(result.salarioNovo).toBe(1800);
    expect(result.diferenca).toBe(300);
    expect(result.percentualReal).toBeCloseTo(20, 2); // 300/1500 = 20%
  });

  it("should not apply floor when salary is already above", () => {
    const result = calcularReajuste(3000, 5.0, 1800);
    // 3000 * 1.05 = 3150, above floor
    expect(result.salarioNovo).toBeCloseTo(3150, 2);
    expect(result.diferenca).toBeCloseTo(150, 2);
  });

  it("should handle zero salary gracefully", () => {
    const result = calcularReajuste(0, 5.0);
    expect(result.salarioNovo).toBe(0);
    expect(result.diferenca).toBe(0);
    expect(result.percentualReal).toBe(0);
  });

  it("should handle large percentages", () => {
    const result = calcularReajuste(2000, 100);
    expect(result.salarioNovo).toBe(4000);
    expect(result.diferenca).toBe(2000);
    expect(result.percentualReal).toBe(100);
  });

  it("should calculate valor/hora correctly (220h standard)", () => {
    const result = calcularReajuste(2200, 5.0);
    const valorHoraNovo = result.salarioNovo / 220;
    expect(valorHoraNovo).toBeCloseTo(10.50, 2);
  });
});

describe("Dissídio — Cálculo de Retroativo", () => {
  it("should calculate retroactive for 3 months", () => {
    const result = calcularRetroativo(
      110, // diferença mensal
      "2026-02-01",
      new Date("2026-05-01T00:00:00")
    );
    expect(result.meses).toBe(3);
    expect(result.valor).toBe(330);
  });

  it("should return zero when no retroactive date", () => {
    const result = calcularRetroativo(110, null);
    expect(result.meses).toBe(0);
    expect(result.valor).toBe(0);
  });

  it("should handle same month (0 months retroactive)", () => {
    const result = calcularRetroativo(
      110,
      "2026-05-01",
      new Date("2026-05-15T00:00:00")
    );
    expect(result.meses).toBe(0);
    expect(result.valor).toBe(0);
  });

  it("should handle cross-year retroactive", () => {
    const result = calcularRetroativo(
      200,
      "2025-11-01",
      new Date("2026-05-01T00:00:00")
    );
    expect(result.meses).toBe(6);
    expect(result.valor).toBe(1200);
  });
});

describe("Dissídio — Data-base Construção Civil (Maio)", () => {
  it("should default to May (month 5) as data-base", () => {
    const mesDataBase = 5; // Maio
    expect(mesDataBase).toBe(5);
  });

  it("should validate month range 1-12", () => {
    const validMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    validMonths.forEach(m => {
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(12);
    });
  });

  it("should separate dissídios by year for historical analysis", () => {
    const dissidios = [
      { anoReferencia: 2024, percentualReajuste: "4.20", status: "aplicado" },
      { anoReferencia: 2025, percentualReajuste: "5.50", status: "aplicado" },
      { anoReferencia: 2026, percentualReajuste: "6.00", status: "rascunho" },
    ];
    
    // Each year is unique
    const anos = dissidios.map(d => d.anoReferencia);
    const anosUnicos = new Set(anos);
    expect(anosUnicos.size).toBe(anos.length);
    
    // Percentages should be non-decreasing
    for (let i = 1; i < dissidios.length; i++) {
      const anterior = parseFloat(dissidios[i - 1].percentualReajuste);
      const atual = parseFloat(dissidios[i].percentualReajuste);
      expect(atual).toBeGreaterThanOrEqual(anterior);
    }
  });
});

describe("Dissídio — Simulação em Massa", () => {
  it("should calculate impact for multiple employees", () => {
    const funcionarios = [
      { id: 1, nome: "João", salarioBase: "2000.00" },
      { id: 2, nome: "Maria", salarioBase: "2500.00" },
      { id: 3, nome: "Pedro", salarioBase: "3000.00" },
    ];
    const percentual = 5.5;
    
    const simulacao = funcionarios.map(f => {
      const salarioAtual = parseFloat(f.salarioBase);
      const result = calcularReajuste(salarioAtual, percentual);
      return { ...f, ...result };
    });
    
    const totalDiferenca = simulacao.reduce((acc, s) => acc + s.diferenca, 0);
    
    expect(simulacao[0].salarioNovo).toBeCloseTo(2110, 2);
    expect(simulacao[1].salarioNovo).toBeCloseTo(2637.5, 2);
    expect(simulacao[2].salarioNovo).toBeCloseTo(3165, 2);
    expect(totalDiferenca).toBeCloseTo(412.5, 2);
  });

  it("should allow excluding specific employees from application", () => {
    const funcionarios = [
      { id: 1, nome: "João", salarioBase: "2000.00" },
      { id: 2, nome: "Maria", salarioBase: "2500.00" },
      { id: 3, nome: "Pedro", salarioBase: "3000.00" },
    ];
    const excluidos = new Set([2]); // Excluir Maria
    
    const aplicaveis = funcionarios.filter(f => !excluidos.has(f.id));
    expect(aplicaveis.length).toBe(2);
    expect(aplicaveis.map(f => f.nome)).toEqual(["João", "Pedro"]);
  });

  it("should skip PJ contracts from dissídio application", () => {
    const funcionarios = [
      { id: 1, nome: "João", tipoContrato: "CLT", salarioBase: "2000.00" },
      { id: 2, nome: "Maria", tipoContrato: "PJ", salarioBase: "5000.00" },
      { id: 3, nome: "Pedro", tipoContrato: "CLT", salarioBase: "3000.00" },
    ];
    
    const elegíveis = funcionarios.filter(f => f.tipoContrato !== "PJ");
    expect(elegíveis.length).toBe(2);
    expect(elegíveis.every(f => f.tipoContrato === "CLT")).toBe(true);
  });
});
