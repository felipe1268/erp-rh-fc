import { describe, it, expect } from "vitest";

/**
 * Tests for the transfer detection logic in conflict analysis.
 * The backend analyzes records from different obras on the same day and determines:
 * 1. If there's a real overlap (same time range) → hasOverlap = true
 * 2. If there's a transfer (different times, gap between them) → transferAnalysis populated
 * 3. Suggested exit time for the first obra = entry time of the second obra minus a small buffer
 */

// Simulate the transfer analysis logic from the backend
function analyzeTransfers(records: Array<{
  obraId: number;
  obraNome: string;
  entrada1: string | null;
  saida2: string | null;
}>) {
  const transfers: Array<{
    fromObraId: number;
    fromObraNome: string;
    fromEntrada: string;
    toObraId: number;
    toObraNome: string;
    toEntrada: string;
    gapMinutes: number;
    suggestedExit: string;
  }> = [];

  // Sort by entry time
  const sorted = [...records]
    .filter(r => r.entrada1)
    .sort((a, b) => (a.entrada1! > b.entrada1! ? 1 : -1));

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (!current.entrada1 || !next.entrada1) continue;
    if (current.obraId === next.obraId) continue;

    const [ch, cm] = current.entrada1.split(":").map(Number);
    const [nh, nm] = next.entrada1.split(":").map(Number);
    const currentMin = ch * 60 + cm;
    const nextMin = nh * 60 + nm;
    const gap = nextMin - currentMin;

    if (gap > 5) {
      // Suggest exit = next entry - 5 min buffer
      const suggestedMin = Math.max(currentMin, nextMin - 5);
      const sugH = Math.floor(suggestedMin / 60);
      const sugM = suggestedMin % 60;
      transfers.push({
        fromObraId: current.obraId,
        fromObraNome: current.obraNome,
        fromEntrada: current.entrada1,
        toObraId: next.obraId,
        toObraNome: next.obraNome,
        toEntrada: next.entrada1,
        gapMinutes: gap,
        suggestedExit: `${String(sugH).padStart(2, "0")}:${String(sugM).padStart(2, "0")}`,
      });
    }
  }

  return transfers;
}

// Simulate overlap detection
function hasOverlap(records: Array<{
  entrada1: string | null;
  saida2: string | null;
  obraId: number;
}>) {
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      if (records[i].obraId === records[j].obraId) continue;
      const a = records[i];
      const b = records[j];
      if (!a.entrada1 || !b.entrada1) continue;
      
      const aStart = a.entrada1;
      const aEnd = a.saida2 || "23:59";
      const bStart = b.entrada1;
      const bEnd = b.saida2 || "23:59";
      
      // Check if ranges overlap
      if (aStart < bEnd && bStart < aEnd) {
        // Check if the gap is <= 5 minutes (considered overlap)
        const [ah, am] = aStart.split(":").map(Number);
        const [bh, bm] = bStart.split(":").map(Number);
        const diff = Math.abs((ah * 60 + am) - (bh * 60 + bm));
        if (diff <= 5) return true;
      }
    }
  }
  return false;
}

describe("Transfer Detection Logic", () => {
  it("should detect a transfer when employee has entries at different times in different obras", () => {
    const records = [
      { obraId: 1, obraNome: "QIU 2 - FASE 4", entrada1: "06:50", saida2: null },
      { obraId: 2, obraNome: "UTC - UNIDADE DE COMPOSTAGEM", entrada1: "09:12", saida2: null },
    ];

    const transfers = analyzeTransfers(records);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].fromObraNome).toBe("QIU 2 - FASE 4");
    expect(transfers[0].toObraNome).toBe("UTC - UNIDADE DE COMPOSTAGEM");
    expect(transfers[0].fromEntrada).toBe("06:50");
    expect(transfers[0].toEntrada).toBe("09:12");
    expect(transfers[0].gapMinutes).toBe(142); // 9:12 - 6:50 = 142 min
    expect(transfers[0].suggestedExit).toBe("09:07"); // 9:12 - 5 = 9:07
  });

  it("should NOT detect transfer when entries are at the same time (overlap)", () => {
    const records = [
      { obraId: 1, obraNome: "QIU 2 - FASE 4", entrada1: "09:14", saida2: null },
      { obraId: 2, obraNome: "UTC - UNIDADE DE COMPOSTAGEM", entrada1: "09:12", saida2: null },
    ];

    const transfers = analyzeTransfers(records);
    // Gap is only 2 minutes, should not be considered a transfer
    expect(transfers).toHaveLength(0);
  });

  it("should detect overlap when entries are within 5 minutes of each other", () => {
    const records = [
      { obraId: 1, entrada1: "09:14", saida2: null },
      { obraId: 2, entrada1: "09:12", saida2: null },
    ];

    const overlap = hasOverlap(records);
    expect(overlap).toBe(true);
  });

  it("should NOT detect overlap when entries are far apart (transfer scenario)", () => {
    const records = [
      { obraId: 1, entrada1: "06:50", saida2: "09:00" },
      { obraId: 2, entrada1: "09:12", saida2: "17:00" },
    ];

    const overlap = hasOverlap(records);
    expect(overlap).toBe(false);
  });

  it("should suggest correct exit time with 5-minute buffer", () => {
    const records = [
      { obraId: 1, obraNome: "Obra A", entrada1: "07:00", saida2: null },
      { obraId: 2, obraNome: "Obra B", entrada1: "10:30", saida2: null },
    ];

    const transfers = analyzeTransfers(records);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].suggestedExit).toBe("10:25"); // 10:30 - 5 = 10:25
    expect(transfers[0].gapMinutes).toBe(210); // 10:30 - 7:00 = 210 min
  });

  it("should handle multiple transfers in a day (3 obras)", () => {
    const records = [
      { obraId: 1, obraNome: "Obra A", entrada1: "06:00", saida2: null },
      { obraId: 2, obraNome: "Obra B", entrada1: "09:00", saida2: null },
      { obraId: 3, obraNome: "Obra C", entrada1: "14:00", saida2: null },
    ];

    const transfers = analyzeTransfers(records);
    expect(transfers).toHaveLength(2);
    expect(transfers[0].fromObraNome).toBe("Obra A");
    expect(transfers[0].toObraNome).toBe("Obra B");
    expect(transfers[1].fromObraNome).toBe("Obra B");
    expect(transfers[1].toObraNome).toBe("Obra C");
  });

  it("should format gap time correctly for display", () => {
    const records = [
      { obraId: 1, obraNome: "Obra A", entrada1: "06:00", saida2: null },
      { obraId: 2, obraNome: "Obra B", entrada1: "08:30", saida2: null },
    ];

    const transfers = analyzeTransfers(records);
    expect(transfers[0].gapMinutes).toBe(150);
    
    // Frontend formats: >= 60 min shows as Xh:MM
    const gap = transfers[0].gapMinutes;
    const formatted = gap >= 60
      ? `${Math.floor(gap / 60)}h${gap % 60 > 0 ? String(gap % 60).padStart(2, "0") : ""}`
      : `${gap}min`;
    expect(formatted).toBe("2h30");
  });
});
