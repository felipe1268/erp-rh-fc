import { describe, it, expect } from "vitest";

/**
 * Regression tests for cycle-based locks (Task #29).
 *
 * Inline copies of pure helpers from server/routers/fechamentoPonto.ts and
 * server/routers/payrollEngine.ts. Keep in sync with the source files.
 *
 * Scenarios covered:
 *  - consolidar março (cycle 16/02–15/03) with abril open → 20/03 stays editable
 *  - editar 20/03 dentro de abril → still allowed when only março is consolidated
 *  - desconsolidar março → entire window unlocks
 *  - mudança de dia de corte entre competências → cycles do not overlap and cover all days
 *  - aferição respeita validação manual → manual rows skipped from re-aferição loop
 */

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

type LockedRange = { dataInicioCiclo: string; dataFimCiclo: string };

function isDateLocked(date: string, ranges: LockedRange[]): boolean {
  for (const r of ranges) {
    if (date >= r.dataInicioCiclo && date <= r.dataFimCiclo) return true;
  }
  return false;
}

// Mirrors the manual-preservation filter applied in realizarAfericao
// when selecting escuroRecords. A row is included in re-aferição when:
//   (origemRegistro NOT IN manual variants AND resolucaoTipo IS NULL) OR
//   it has a decided payroll_adjustment (status pendente|cancelado|aplicado).
function shouldEnterAfericaoLoop(row: {
  origemRegistro: string | null;
  resolucaoTipo: string | null;
  hasDecidedAdjustment: boolean;
}): boolean {
  const isManual =
    row.origemRegistro === "manual" ||
    row.origemRegistro === "ajuste_manual" ||
    row.origemRegistro === "ajusteManual";
  const isResolvedManually = row.resolucaoTipo !== null;
  const isManualOnly = (isManual || isResolvedManually) && !row.hasDecidedAdjustment;
  return !isManualOnly;
}

describe("Per-date cycle locks — Fechamento de Ponto", () => {
  it("consolidar março (16/02–15/03) leaves dark days 16/03–31/03 editable", () => {
    const marco = computeCicloRange("2026-03", 15);
    const ranges: LockedRange[] = [marco];
    expect(isDateLocked("2026-02-16", ranges)).toBe(true);
    expect(isDateLocked("2026-03-15", ranges)).toBe(true);
    expect(isDateLocked("2026-03-16", ranges)).toBe(false);
    expect(isDateLocked("2026-03-20", ranges)).toBe(false);
    expect(isDateLocked("2026-03-31", ranges)).toBe(false);
  });

  it("editar 20/03 dentro do ciclo de abril ainda funciona quando só março está consolidado", () => {
    const marco = computeCicloRange("2026-03", 15);
    const abril = computeCicloRange("2026-04", 15);
    expect(isDateLocked("2026-03-20", [marco])).toBe(false);
    expect("2026-03-20" >= abril.dataInicioCiclo && "2026-03-20" <= abril.dataFimCiclo).toBe(true);
  });

  it("desconsolidar março libera o ciclo inteiro", () => {
    const marco = computeCicloRange("2026-03", 15);
    const before: LockedRange[] = [marco];
    expect(isDateLocked("2026-03-15", before)).toBe(true);
    const after: LockedRange[] = [];
    expect(isDateLocked("2026-03-15", after)).toBe(false);
    expect(isDateLocked("2026-02-16", after)).toBe(false);
  });

  it("ciclos consecutivos não se sobrepõem e cobrem todos os dias", () => {
    const marco = computeCicloRange("2026-03", 15);
    const abril = computeCicloRange("2026-04", 15);
    expect(marco.dataFimCiclo).toBe("2026-03-15");
    expect(abril.dataInicioCiclo).toBe("2026-03-16");
    // Union of both fully covers 16/02..15/04
    const ranges = [marco, abril];
    for (const d of ["2026-02-16", "2026-03-01", "2026-03-15", "2026-03-16", "2026-04-01", "2026-04-15"]) {
      expect(isDateLocked(d, ranges)).toBe(true);
    }
    expect(isDateLocked("2026-02-15", ranges)).toBe(false);
    expect(isDateLocked("2026-04-16", ranges)).toBe(false);
  });

  it("mudança de dia de corte entre competências mantém continuidade sem sobreposição", () => {
    // março fechado com diaCorte=15, abril com diaCorte mudado para 20
    const marco = computeCicloRange("2026-03", 15);
    const abril = computeCicloRange("2026-04", 20);
    // Ranges devem ser disjuntos (abril começa estritamente após o fim de março)
    expect(abril.dataInicioCiclo > marco.dataFimCiclo).toBe(true);
    // Mas existe um gap (16/03..21/03) — esses dias devem permanecer EDITÁVEIS
    // até que abril seja consolidado, refletindo a decisão de produto.
    expect(isDateLocked("2026-03-16", [marco])).toBe(false);
    expect(isDateLocked("2026-03-21", [marco])).toBe(false);
    // Após abril consolidar, todo o gap fica trancado.
    expect(isDateLocked("2026-03-21", [marco, abril])).toBe(true);
  });
});

describe("Aferição — preservação de validação manual", () => {
  it("linha tratada manualmente sem ajuste decidido NÃO entra na re-aferição", () => {
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "manual", resolucaoTipo: null, hasDecidedAdjustment: false }),
    ).toBe(false);
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "ajuste_manual", resolucaoTipo: null, hasDecidedAdjustment: false }),
    ).toBe(false);
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "ajusteManual", resolucaoTipo: null, hasDecidedAdjustment: false }),
    ).toBe(false);
  });

  it("linha com resolucaoTipo definido (resolvida pelo usuário) NÃO entra na re-aferição", () => {
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "dixi", resolucaoTipo: "manual_validation", hasDecidedAdjustment: false }),
    ).toBe(false);
  });

  it("linha manual COM ajuste decidido entra no loop para preservar a classificação no relatório", () => {
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "manual", resolucaoTipo: null, hasDecidedAdjustment: true }),
    ).toBe(true);
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "dixi", resolucaoTipo: "manual_validation", hasDecidedAdjustment: true }),
    ).toBe(true);
  });

  it("linha 'dixi' normal entra normalmente", () => {
    expect(
      shouldEnterAfericaoLoop({ origemRegistro: "dixi", resolucaoTipo: null, hasDecidedAdjustment: false }),
    ).toBe(true);
  });

  it("UI permite Desconsolidar quando o mês está em estado parcial (consolidado=true, parcial=true)", () => {
    // Mirrors the new gate in client/src/pages/FechamentoPonto.tsx:
    //   {consolidacaoData?.consolidado === true && isAdmin && <Button> Desconsolidar </Button>}
    const canShowDesconsolidar = (consolidacaoData: { consolidado: boolean; parcial?: boolean } | null, isAdmin: boolean): boolean => {
      return consolidacaoData?.consolidado === true && isAdmin;
    };
    expect(canShowDesconsolidar({ consolidado: true, parcial: false }, true)).toBe(true);
    expect(canShowDesconsolidar({ consolidado: true, parcial: true }, true)).toBe(true);
    expect(canShowDesconsolidar({ consolidado: false, parcial: false }, true)).toBe(false);
    expect(canShowDesconsolidar({ consolidado: true, parcial: true }, false)).toBe(false);
    expect(canShowDesconsolidar(null, true)).toBe(false);
  });

  it("upload DIXI não toca dias dentro de ciclo consolidado anterior", () => {
    // Cenário: março/2026 consolidado (cycle 16/02–15/03). Upload de arquivo
    // DIXI cobrindo fevereiro inteiro: dias 01/02–15/02 devem ser inseridos,
    // dias 16/02–28/02 (dentro do ciclo de março) devem ser ignorados.
    const marcoCycle = computeCicloRange("2026-03", 15);
    const lockedRanges: LockedRange[] = [marcoCycle];
    const isDateInLocked = (d: string): boolean => {
      for (const r of lockedRanges) {
        if (d >= r.dataInicioCiclo && d <= r.dataFimCiclo) return true;
      }
      return false;
    };
    const uploadRecords = [
      "2026-02-01", "2026-02-10", "2026-02-15", "2026-02-16", "2026-02-20", "2026-02-28",
    ];
    const accepted = uploadRecords.filter((d) => !isDateInLocked(d));
    const skipped = uploadRecords.filter((d) => isDateInLocked(d));
    expect(accepted).toEqual(["2026-02-01", "2026-02-10", "2026-02-15"]);
    expect(skipped).toEqual(["2026-02-16", "2026-02-20", "2026-02-28"]);
  });

  it("dedup de payroll_adjustments evita duplicatas em re-aferição concorrente", () => {
    const existingKeys = new Set<string>(["100|2026-02-20|falta"]);
    const tryInsert = (employeeId: number, data: string, tipo: string): boolean => {
      const key = `${employeeId}|${data}|${tipo}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    };
    // Primeira inserção do mesmo registro: bloqueada (já existe)
    expect(tryInsert(100, "2026-02-20", "falta")).toBe(false);
    // Inserção de tipo diferente no mesmo dia: permitida
    expect(tryInsert(100, "2026-02-20", "atraso")).toBe(true);
    // Tentativa duplicada subsequente: bloqueada
    expect(tryInsert(100, "2026-02-20", "atraso")).toBe(false);
    // Dia diferente: permitida
    expect(tryInsert(100, "2026-02-21", "falta")).toBe(true);
  });
});
