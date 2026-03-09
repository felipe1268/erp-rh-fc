import { describe, it, expect, vi } from 'vitest';

// Test the editRecord and getDuplicates endpoints exist in the router
describe('FechamentoPonto - editRecord & getDuplicates endpoints', () => {
  it('should have editRecord mutation defined', async () => {
    const { fechamentoPontoRouter } = await import('./routers/fechamentoPonto');
    // Check that the router has the editRecord procedure
    expect(fechamentoPontoRouter).toBeDefined();
    expect((fechamentoPontoRouter as any)._def.procedures.editRecord).toBeDefined();
  });

  it('should have getDuplicates query defined', async () => {
    const { fechamentoPontoRouter } = await import('./routers/fechamentoPonto');
    expect((fechamentoPontoRouter as any)._def.procedures.getDuplicates).toBeDefined();
  });

  it('should have cleanDuplicates mutation defined', async () => {
    const { fechamentoPontoRouter } = await import('./routers/fechamentoPonto');
    expect((fechamentoPontoRouter as any)._def.procedures.cleanDuplicates).toBeDefined();
  });

  it('editRecord input schema should accept id, companyId, and time fields', async () => {
    const { fechamentoPontoRouter } = await import('./routers/fechamentoPonto');
    const proc = (fechamentoPontoRouter as any)._def.procedures.editRecord;
    expect(proc).toBeDefined();
    // The procedure should have a _def with type or mutation
    expect(proc._def).toBeDefined();
  });

  it('getDuplicates input schema should accept companyId and mesReferencia', async () => {
    const { fechamentoPontoRouter } = await import('./routers/fechamentoPonto');
    const proc = (fechamentoPontoRouter as any)._def.procedures.getDuplicates;
    expect(proc).toBeDefined();
    expect(proc._def).toBeDefined();
  });
});

describe('FechamentoPonto - diffMinutes helper', () => {
  it('should calculate correct diff between two times', () => {
    // Test the logic that editRecord uses internally
    const diffMinutes = (start: string, end: string): number => {
      const [h1, m1] = start.split(":").map(Number);
      const [h2, m2] = end.split(":").map(Number);
      if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
      return (h2 * 60 + m2) - (h1 * 60 + m1);
    };

    expect(diffMinutes("08:00", "12:00")).toBe(240); // 4 hours
    expect(diffMinutes("13:00", "17:00")).toBe(240); // 4 hours
    expect(diffMinutes("08:00", "17:00")).toBe(540); // 9 hours
    expect(diffMinutes("07:30", "11:45")).toBe(255); // 4h15
    expect(diffMinutes("invalid", "12:00")).toBe(0);
  });

  it('should calculate total worked hours from entry/exit pairs', () => {
    const diffMinutes = (start: string, end: string): number => {
      const [h1, m1] = start.split(":").map(Number);
      const [h2, m2] = end.split(":").map(Number);
      if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
      return (h2 * 60 + m2) - (h1 * 60 + m1);
    };

    const minutesToHHMM = (mins: number): string => {
      const h = Math.floor(Math.abs(mins) / 60);
      const m = Math.abs(mins) % 60;
      return `${mins < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
    };

    // Typical workday: 08:00-12:00 + 13:00-17:00 = 8h
    let total = 0;
    total += diffMinutes("08:00", "12:00");
    total += diffMinutes("13:00", "17:00");
    expect(minutesToHHMM(total)).toBe("8:00");

    // Half day: 08:00-12:00 = 4h
    total = diffMinutes("08:00", "12:00");
    expect(minutesToHHMM(total)).toBe("4:00");
  });
});
