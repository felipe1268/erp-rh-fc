import { describe, it, expect } from "vitest";

// Inline copy of computeCicloRange from server/routers/fechamentoPonto.ts.
// Pure function; tested in isolation. Keep in sync with the source.
function computeCicloRange(mesRef: string, diaCorte: number): { dataInicioCiclo: string; dataFimCiclo: string } {
  const [y, m] = mesRef.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const inicioDate = new Date(Date.UTC(prevY, prevM - 1, diaCorte));
  inicioDate.setUTCDate(inicioDate.getUTCDate() + 1);
  const fimDate = new Date(Date.UTC(y, m - 1, diaCorte));
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { dataInicioCiclo: toIso(inicioDate), dataFimCiclo: toIso(fimDate) };
}

describe("computeCicloRange — payroll cycle bounds", () => {
  it("standard March competência with diaCorte=15 → 16/02 to 15/03", () => {
    expect(computeCicloRange("2026-03", 15)).toEqual({
      dataInicioCiclo: "2026-02-16",
      dataFimCiclo: "2026-03-15",
    });
  });

  it("January competência rolls year back for prevMonth", () => {
    expect(computeCicloRange("2026-01", 15)).toEqual({
      dataInicioCiclo: "2025-12-16",
      dataFimCiclo: "2026-01-15",
    });
  });

  it("diaCorte=28 in non-leap February rolls dataInicioCiclo to March 1st", () => {
    // prev month = Feb 2025 (28 days). diaCorte+1 = 29 ≠ valid. Should roll to 2025-03-01.
    expect(computeCicloRange("2025-03", 28)).toEqual({
      dataInicioCiclo: "2025-03-01",
      dataFimCiclo: "2025-03-28",
    });
  });

  it("diaCorte=28 in leap February yields valid Feb 29", () => {
    expect(computeCicloRange("2024-03", 28)).toEqual({
      dataInicioCiclo: "2024-02-29",
      dataFimCiclo: "2024-03-28",
    });
  });

  it("diaCorte=1 → cycle starts on day 2 of prevMonth and ends on day 1 of currentMonth", () => {
    expect(computeCicloRange("2026-04", 1)).toEqual({
      dataInicioCiclo: "2026-03-02",
      dataFimCiclo: "2026-04-01",
    });
  });

  it("diaCorte=20 in February (28 days, non-leap), competência March", () => {
    expect(computeCicloRange("2025-03", 20)).toEqual({
      dataInicioCiclo: "2025-02-21",
      dataFimCiclo: "2025-03-20",
    });
  });

  it("dark days (diaCorte+1 .. month end) belong to the NEXT competência", () => {
    // For competência March 2026, the dark days are 16/03..31/03 — they should
    // NOT be inside the March cycle, but inside the April cycle.
    const marco = computeCicloRange("2026-03", 15);
    const abril = computeCicloRange("2026-04", 15);
    const day20Mar = "2026-03-20";
    expect(day20Mar > marco.dataFimCiclo).toBe(true);
    expect(day20Mar >= abril.dataInicioCiclo && day20Mar <= abril.dataFimCiclo).toBe(true);
  });
});
