import { describe, it, expect } from "vitest";

// Test the jornada-based HE calculation logic
// These are pure function tests for the core calculation rules

function diffMinutes(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

function calcExpectedMinutes(
  jornadaJson: Record<string, { entrada?: string; intervalo?: string; saida?: string }> | null,
  dateStr: string
): { expectedMinutes: number; isDiaFolgaJornada: boolean } {
  let expectedMinutes = 480; // default 8h
  let isDiaFolgaJornada = false;

  if (jornadaJson) {
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    const dayMap: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
    const dayKey = dayMap[dayOfWeek];

    if (jornadaJson[dayKey]?.entrada && jornadaJson[dayKey]?.saida) {
      const j = jornadaJson[dayKey];
      const totalJornada = diffMinutes(j.entrada!, j.saida!);
      let intervaloMin = 60;
      if (j.intervalo) {
        const parts = j.intervalo.split(":");
        if (parts.length === 2) {
          intervaloMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }
      expectedMinutes = totalJornada - intervaloMin;
    } else {
      expectedMinutes = 0;
      isDiaFolgaJornada = true;
    }
  }

  return { expectedMinutes, isDiaFolgaJornada };
}

function calcHorasExtras(
  totalMinutes: number,
  expectedMinutes: number,
  isDiaFolgaJornada: boolean,
  tolSaida: number = 10
): number {
  if (isDiaFolgaJornada && totalMinutes > 0) {
    return totalMinutes; // ALL hours are HE on rest days
  } else if (totalMinutes - expectedMinutes > 0) {
    const diff = totalMinutes - expectedMinutes;
    return diff > tolSaida ? diff : 0;
  }
  return 0;
}

function classifyHE(dateStr: string): "50" | "100" {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 ? "100" : "50"; // domingo=100%, resto=50%
}

// Standard 44h jornada (Opção C)
// Seg-Qui: 07:00-17:00 (1h int) = 9h/dia × 4 = 36h
// Sex: 07:00-16:00 (1h int) = 8h
// Sáb/Dom: Folga (qualquer hora = HE)
// Total: 36 + 8 = 44h
const JORNADA_44H = {
  seg: { entrada: "07:00", intervalo: "01:00", saida: "17:00" },
  ter: { entrada: "07:00", intervalo: "01:00", saida: "17:00" },
  qua: { entrada: "07:00", intervalo: "01:00", saida: "17:00" },
  qui: { entrada: "07:00", intervalo: "01:00", saida: "17:00" },
  sex: { entrada: "07:00", intervalo: "01:00", saida: "16:00" },
  // sab: not defined = folga (HE 50%)
  // dom: not defined = folga (HE 100%)
};

describe("Jornada 44h semanais - cálculo de horas esperadas", () => {
  it("Segunda a Quinta: 8h de jornada (10h - 2h intervalo? não, 10h - 1h = 9h... wait)", () => {
    // Seg: 07:00-17:00 = 10h - 1h intervalo = 9h? No!
    // Actually: 07:00-17:00 = 600min, -60min intervalo = 540min = 9h
    // Hmm, 44h = Seg-Qui 9h*4=36 + Sex 8h + Sab 4h = 48h. That's too much.
    // Actually the standard 44h is:
    // Seg-Qui: 07:00-17:00 (10h) - 1h intervalo = 9h * 4 = 36h? No...
    // Wait, let me recalculate. The CLT 44h standard is typically:
    // Seg-Sex: 8h48min/dia * 5 = 44h (sem sábado)
    // OR: Seg-Qui 8h/dia + Sex 8h + Sab 4h = 44h
    // With the config: Seg-Qui 07:00-17:00 (1h intervalo) = 9h/dia
    // Sex: 07:00-16:00 (1h intervalo) = 8h
    // Sab: 07:00-11:00 (sem intervalo) = 4h
    // Total: 9*4 + 8 + 4 = 48h. That's not 44h!
    // 
    // The correct 44h is:
    // Seg-Qui: 07:00-17:00 (1h intervalo) = 9h * 4 = 36h
    // Sex: 07:00-16:00 (1h intervalo) = 8h
    // Total: 36 + 8 = 44h (sem sábado)
    // OR with sábado:
    // Seg-Sex: 07:00-16:12 (1h intervalo) = 8h12 * 5 = 41h + Sab 3h = 44h
    //
    // Let's test what the code actually calculates
    const seg = calcExpectedMinutes(JORNADA_44H, "2026-02-23"); // Monday
    expect(seg.isDiaFolgaJornada).toBe(false);
    expect(seg.expectedMinutes).toBe(540); // 07:00-17:00 = 600 - 60 = 540min = 9h
  });

  it("Sexta: 8h de jornada", () => {
    const sex = calcExpectedMinutes(JORNADA_44H, "2026-02-27"); // Friday
    expect(sex.isDiaFolgaJornada).toBe(false);
    expect(sex.expectedMinutes).toBe(480); // 07:00-16:00 = 540 - 60 = 480min = 8h
  });

  it("Sábado sem jornada: folga (expectedMinutes=0, tudo é HE)", () => {
    const sab = calcExpectedMinutes(JORNADA_44H, "2026-02-28"); // Saturday
    expect(sab.isDiaFolgaJornada).toBe(true);
    expect(sab.expectedMinutes).toBe(0); // Folga: qualquer hora = HE
  });

  it("Domingo sem jornada: folga (expectedMinutes=0)", () => {
    const dom = calcExpectedMinutes(JORNADA_44H, "2026-03-01"); // Sunday
    expect(dom.isDiaFolgaJornada).toBe(true);
    expect(dom.expectedMinutes).toBe(0);
  });
});

describe("Cálculo de Horas Extras", () => {
  it("Dia normal: trabalhou 10h com jornada de 9h = 1h HE (acima tolerância)", () => {
    const he = calcHorasExtras(600, 540, false, 10);
    expect(he).toBe(60); // 60min = 1h HE
  });

  it("Dia normal: trabalhou dentro da tolerância = 0 HE", () => {
    const he = calcHorasExtras(545, 540, false, 10);
    expect(he).toBe(0); // 5min dentro da tolerância de 10min
  });

  it("Dia de folga: qualquer hora trabalhada = HE total", () => {
    const he = calcHorasExtras(480, 0, true, 10);
    expect(he).toBe(480); // 8h inteiras de HE
  });

  it("Dia de folga: 0 horas trabalhadas = 0 HE", () => {
    const he = calcHorasExtras(0, 0, true, 10);
    expect(he).toBe(0);
  });

  it("Dia normal: trabalhou menos que esperado = 0 HE", () => {
    const he = calcHorasExtras(400, 540, false, 10);
    expect(he).toBe(0);
  });
});

describe("Classificação de HE: 50% vs 100%", () => {
  it("Domingo = HE 100%", () => {
    expect(classifyHE("2026-03-01")).toBe("100"); // Sunday
  });

  it("Sábado = HE 50%", () => {
    expect(classifyHE("2026-02-28")).toBe("50"); // Saturday
  });

  it("Dia útil = HE 50%", () => {
    expect(classifyHE("2026-02-23")).toBe("50"); // Monday
    expect(classifyHE("2026-02-24")).toBe("50"); // Tuesday
    expect(classifyHE("2026-02-25")).toBe("50"); // Wednesday
  });
});

describe("Sem jornada definida: usa default 480min", () => {
  it("Sem jornada = 480min esperados (8h)", () => {
    const result = calcExpectedMinutes(null, "2026-02-23");
    expect(result.expectedMinutes).toBe(480);
    expect(result.isDiaFolgaJornada).toBe(false);
  });
});

describe("Total semanal da jornada 44h", () => {
  it("Calcula total semanal = exatamente 44h (2640min)", () => {
    const dias = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
    let totalMin = 0;
    for (const d of dias) {
      const j = (JORNADA_44H as any)[d];
      if (!j?.entrada || !j?.saida) continue;
      const total = diffMinutes(j.entrada, j.saida);
      let intv = 60; // default
      if (j.intervalo) {
        const parts = j.intervalo.split(":");
        if (parts.length === 2) {
          intv = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }
      totalMin += total - intv;
    }
    // Seg-Qui: (600-60)*4 = 2160min, Sex: (540-60) = 480min
    // Sáb/Dom: sem jornada = 0
    // Total: 2160 + 480 = 2640min = 44h ✅
    expect(totalMin).toBe(2640);
  });
});
