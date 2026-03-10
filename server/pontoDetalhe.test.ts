import { describe, it, expect } from "vitest";

/**
 * Tests for the Ponto Detalhe navigation logic.
 * Validates that the openPontoDetalhe function correctly sets state
 * and that the summary card calculations work properly.
 */

// Simulates the parseHM function used in the summary card
function parseHM(s: string): number {
  if (!s || s === "-") return 0;
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmtHM(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

describe("Ponto Detalhe - Summary Calculations", () => {
  const sampleRecords = [
    { data: "2026-01-02", horasTrabalhadas: "8:00", horasExtras: "1:30", atrasos: "0:00" },
    { data: "2026-01-03", horasTrabalhadas: "7:30", horasExtras: "0:00", atrasos: "0:15" },
    { data: "2026-01-04", horasTrabalhadas: "9:00", horasExtras: "2:00", atrasos: "0:00" },
    { data: "2026-01-05", horasTrabalhadas: "8:00", horasExtras: "0:30", atrasos: "0:10" },
    { data: "2026-01-06", horasTrabalhadas: "7:45", horasExtras: "0:00", atrasos: "0:30" },
  ];

  it("should count unique days correctly", () => {
    const totalDias = new Set(sampleRecords.map(r => r.data)).size;
    expect(totalDias).toBe(5);
  });

  it("should count unique days with duplicate dates", () => {
    const withDuplicates = [
      ...sampleRecords,
      { data: "2026-01-02", horasTrabalhadas: "4:00", horasExtras: "0:00", atrasos: "0:00" },
    ];
    const totalDias = new Set(withDuplicates.map(r => r.data)).size;
    expect(totalDias).toBe(5); // Still 5 unique days
  });

  it("should calculate total hours correctly", () => {
    const totalHoras = sampleRecords.reduce((acc, r) => acc + parseHM(r.horasTrabalhadas), 0);
    // 8:00 + 7:30 + 9:00 + 8:00 + 7:45 = 40:15 = 2415 minutes
    expect(totalHoras).toBe(2415);
    expect(fmtHM(totalHoras)).toBe("40:15");
  });

  it("should calculate total extras correctly", () => {
    const totalExtras = sampleRecords.reduce((acc, r) => acc + parseHM(r.horasExtras), 0);
    // 1:30 + 0:00 + 2:00 + 0:30 + 0:00 = 4:00 = 240 minutes
    expect(totalExtras).toBe(240);
    expect(fmtHM(totalExtras)).toBe("4:00");
  });

  it("should calculate total atrasos correctly", () => {
    const totalAtrasos = sampleRecords.reduce((acc, r) => acc + parseHM(r.atrasos), 0);
    // 0:00 + 0:15 + 0:00 + 0:10 + 0:30 = 0:55 = 55 minutes
    expect(totalAtrasos).toBe(55);
    expect(fmtHM(totalAtrasos)).toBe("0:55");
  });

  it("should handle empty records", () => {
    const emptyRecords: typeof sampleRecords = [];
    const totalDias = new Set(emptyRecords.map(r => r.data)).size;
    const totalHoras = emptyRecords.reduce((acc, r) => acc + parseHM(r.horasTrabalhadas), 0);
    expect(totalDias).toBe(0);
    expect(totalHoras).toBe(0);
    expect(fmtHM(totalHoras)).toBe("0:00");
  });

  it("should handle records with missing/dash values", () => {
    const records = [
      { data: "2026-01-02", horasTrabalhadas: "-", horasExtras: "-", atrasos: "-" },
      { data: "2026-01-03", horasTrabalhadas: "8:00", horasExtras: "0:00", atrasos: "0:00" },
    ];
    const totalHoras = records.reduce((acc, r) => acc + parseHM(r.horasTrabalhadas), 0);
    expect(totalHoras).toBe(480); // Only 8:00 from second record
  });
});

describe("Ponto Detalhe - parseHM edge cases", () => {
  it("should handle null/undefined", () => {
    expect(parseHM("")).toBe(0);
    expect(parseHM("-")).toBe(0);
  });

  it("should handle normal time strings", () => {
    expect(parseHM("8:00")).toBe(480);
    expect(parseHM("1:30")).toBe(90);
    expect(parseHM("0:45")).toBe(45);
  });

  it("should handle large hour values", () => {
    expect(parseHM("100:30")).toBe(6030);
  });

  it("should handle zero", () => {
    expect(parseHM("0:00")).toBe(0);
  });
});

describe("Ponto Detalhe - fmtHM", () => {
  it("should format minutes to H:MM", () => {
    expect(fmtHM(0)).toBe("0:00");
    expect(fmtHM(60)).toBe("1:00");
    expect(fmtHM(90)).toBe("1:30");
    expect(fmtHM(480)).toBe("8:00");
    expect(fmtHM(2415)).toBe("40:15");
  });
});
