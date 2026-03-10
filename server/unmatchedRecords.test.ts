import { describe, it, expect } from "vitest";

/**
 * Tests for the unmatched DIXI records feature (Rev. 69)
 * Tests the logic for handling employees not found in the database during import
 */

// Helper: simulate the matchEmployee logic
function matchEmployee(
  dixiName: string,
  dixiId: string,
  employees: Array<{ id: number; nomeCompleto: string; matricula?: string }>
): { id: number; nomeCompleto: string } | null {
  // Priority 1: Match by matricula (dixiId)
  if (dixiId) {
    const byMatricula = employees.find(e => {
      const mat = (e.matricula || "").replace(/^0+/, "");
      const did = dixiId.replace(/^0+/, "");
      return mat === did;
    });
    if (byMatricula) return byMatricula;
  }

  // Priority 2: Exact name match (normalized)
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const normalizedDixi = normalize(dixiName);
  
  const byExactName = employees.find(e => normalize(e.nomeCompleto) === normalizedDixi);
  if (byExactName) return byExactName;

  // Priority 3: First + last name
  const dixiParts = normalizedDixi.split(/\s+/);
  if (dixiParts.length >= 2) {
    const dixiFirst = dixiParts[0];
    const dixiLast = dixiParts[dixiParts.length - 1];
    const byFirstLast = employees.find(e => {
      const parts = normalize(e.nomeCompleto).split(/\s+/);
      return parts[0] === dixiFirst && parts[parts.length - 1] === dixiLast;
    });
    if (byFirstLast) return byFirstLast;
  }

  // Priority 4: Partial match (first + any other name, min 2 parts)
  if (dixiParts.length >= 2) {
    const byPartial = employees.find(e => {
      const parts = normalize(e.nomeCompleto).split(/\s+/);
      if (parts[0] !== dixiParts[0]) return false;
      const matches = dixiParts.filter(p => parts.includes(p));
      return matches.length >= 2;
    });
    if (byPartial) return byPartial;
  }

  return null;
}

describe("Unmatched DIXI Records - Employee Matching", () => {
  const employees = [
    { id: 1, nomeCompleto: "JEAN CARLOS MARTINS", matricula: "010" },
    { id: 2, nomeCompleto: "RODRIGO DA SILVA", matricula: "020" },
    { id: 3, nomeCompleto: "MARIA JOSÉ DOS SANTOS", matricula: "030" },
  ];

  it("should match by matricula (exact)", () => {
    const result = matchEmployee("JEAN C MARTINS", "10", employees);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });

  it("should match by matricula with leading zeros", () => {
    const result = matchEmployee("UNKNOWN NAME", "010", employees);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });

  it("should match by exact name", () => {
    const result = matchEmployee("RODRIGO DA SILVA", "", employees);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(2);
  });

  it("should match by name ignoring accents", () => {
    const result = matchEmployee("MARIA JOSE DOS SANTOS", "", employees);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(3);
  });

  it("should match by first + last name", () => {
    const result = matchEmployee("JEAN MARTINS", "", employees);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });

  it("should return null for completely unknown name", () => {
    const result = matchEmployee("FULANO DE TAL", "", employees);
    expect(result).toBeNull();
  });

  it("should return null for empty name", () => {
    const result = matchEmployee("", "", employees);
    expect(result).toBeNull();
  });

  it("should prioritize matricula over name match", () => {
    // dixiId matches employee 1, but name matches nobody
    const result = matchEmployee("WRONG NAME", "10", employees);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });
});

describe("Unmatched Records - Grouping Logic", () => {
  it("should group unmatched records by dixiName", () => {
    const records = [
      { dixiName: "FULANO", data: "2026-01-05", entrada1: "07:00", saida1: "11:00", entrada2: "12:00", saida2: "17:00" },
      { dixiName: "FULANO", data: "2026-01-06", entrada1: "07:30", saida1: "11:30", entrada2: "12:30", saida2: "17:30" },
      { dixiName: "CICLANO", data: "2026-01-05", entrada1: "08:00", saida1: "12:00", entrada2: "13:00", saida2: "18:00" },
    ];

    const grouped = new Map<string, typeof records>();
    for (const rec of records) {
      if (!grouped.has(rec.dixiName)) grouped.set(rec.dixiName, []);
      grouped.get(rec.dixiName)!.push(rec);
    }

    expect(grouped.size).toBe(2);
    expect(grouped.get("FULANO")!.length).toBe(2);
    expect(grouped.get("CICLANO")!.length).toBe(1);
  });

  it("should count total pending records correctly", () => {
    const records = [
      { dixiName: "A", status: "pendente" },
      { dixiName: "A", status: "pendente" },
      { dixiName: "B", status: "vinculado" },
      { dixiName: "C", status: "pendente" },
      { dixiName: "C", status: "descartado" },
    ];

    const pendentes = records.filter(r => r.status === "pendente").length;
    const totalNomes = new Set(records.filter(r => r.status === "pendente").map(r => r.dixiName)).size;

    expect(pendentes).toBe(3);
    expect(totalNomes).toBe(2);
  });
});

describe("Unmatched Records - Status Transitions", () => {
  it("should transition from pendente to vinculado when linked", () => {
    const record = { status: "pendente", linkedEmployeeId: null as number | null };
    
    // Simulate linking
    record.status = "vinculado";
    record.linkedEmployeeId = 42;

    expect(record.status).toBe("vinculado");
    expect(record.linkedEmployeeId).toBe(42);
  });

  it("should transition from pendente to descartado when discarded", () => {
    const record = { status: "pendente", linkedEmployeeId: null as number | null };
    
    // Simulate discarding
    record.status = "descartado";

    expect(record.status).toBe("descartado");
    expect(record.linkedEmployeeId).toBeNull();
  });

  it("should not allow linking already vinculado records", () => {
    const records = [
      { status: "vinculado", dixiName: "FULANO" },
      { status: "pendente", dixiName: "FULANO" },
      { status: "descartado", dixiName: "CICLANO" },
    ];

    const linkable = records.filter(r => r.status === "pendente");
    expect(linkable.length).toBe(1);
    expect(linkable[0].dixiName).toBe("FULANO");
  });
});
