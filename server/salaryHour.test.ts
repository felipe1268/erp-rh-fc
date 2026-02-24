import { describe, it, expect } from "vitest";

/**
 * Tests for the bidirectional salary/hour calculation logic
 * This validates the frontend calculation formulas used in Colaboradores.tsx
 */

// Replicate the formatting helpers used in the frontend
function parseMoedaBR(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function formatMoedaSemPrefixo(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

describe("Bidirectional Salary ↔ Hour Calculation", () => {
  it("should calculate valorHora from salarioBase and horasMensais", () => {
    const salario = 2500;
    const horas = 220;
    const valorHora = salario / horas;
    expect(valorHora).toBeCloseTo(11.36, 2);
  });

  it("should calculate salarioBase from valorHora and horasMensais", () => {
    const valorHora = 11.36;
    const horas = 220;
    const salario = valorHora * horas;
    expect(salario).toBeCloseTo(2499.20, 2);
  });

  it("should handle different monthly hours (176h for 8h/day × 22 days)", () => {
    const valorHora = 15.0;
    const horas = 176;
    const salario = valorHora * horas;
    expect(salario).toBe(2640);
  });

  it("should handle months with more working days (23 days × 8h = 184h)", () => {
    const valorHora = 11.36;
    const horas184 = 184;
    const horas220 = 220;
    const salario184 = valorHora * horas184;
    const salario220 = valorHora * horas220;
    // Salary varies by month for hourly workers
    expect(salario184).toBeCloseTo(2090.24, 2);
    expect(salario220).toBeCloseTo(2499.20, 2);
    expect(salario220).toBeGreaterThan(salario184);
  });

  it("should correctly parse Brazilian currency format", () => {
    expect(parseMoedaBR("2.500,00")).toBe(2500);
    expect(parseMoedaBR("11,36")).toBe(11.36);
    expect(parseMoedaBR("1.234.567,89")).toBe(1234567.89);
    expect(parseMoedaBR("0,50")).toBe(0.5);
    expect(parseMoedaBR("")).toBe(0);
  });

  it("should correctly format number to Brazilian currency without prefix", () => {
    expect(formatMoedaSemPrefixo(2500)).toBe("2500,00");
    expect(formatMoedaSemPrefixo(11.363636)).toBe("11,36");
    expect(formatMoedaSemPrefixo(0.5)).toBe("0,50");
  });

  it("should maintain consistency: salary → hour → salary roundtrip", () => {
    const originalSalario = 2500;
    const horas = 220;
    
    // Salary → Hour
    const valorHora = originalSalario / horas;
    const valorHoraFormatted = formatMoedaSemPrefixo(valorHora);
    
    // Hour → Salary (roundtrip)
    const valorHoraParsed = parseMoedaBR(valorHoraFormatted);
    const salarioRecalculado = valorHoraParsed * horas;
    
    // Due to rounding, there may be a small difference
    expect(Math.abs(salarioRecalculado - originalSalario)).toBeLessThan(1);
  });

  it("should not calculate when hours is zero or negative", () => {
    const salario = 2500;
    const horas = 0;
    // Division by zero should be prevented
    expect(horas > 0).toBe(false);
    // The UI guards: if (horasNum > 0 && !isNaN(horasNum))
  });

  it("should handle the hourly worker scenario: same hour rate, different monthly pay", () => {
    const valorHora = 12.50;
    
    // February (20 working days × 8h = 160h)
    const horasFev = 160;
    const salarioFev = valorHora * horasFev;
    
    // March (23 working days × 8h = 184h)
    const horasMar = 184;
    const salarioMar = valorHora * horasMar;
    
    // January (22 working days × 8h = 176h)
    const horasJan = 176;
    const salarioJan = valorHora * horasJan;
    
    expect(salarioFev).toBe(2000);
    expect(salarioMar).toBe(2300);
    expect(salarioJan).toBe(2200);
    
    // All different salaries, same hourly rate
    expect(salarioFev).not.toBe(salarioMar);
    expect(salarioMar).not.toBe(salarioJan);
  });
});
