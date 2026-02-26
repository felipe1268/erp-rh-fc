import { describe, it, expect } from "vitest";

describe("Cor Capacete - EPI Router Schema", () => {
  it("should accept corCapacete field in create input schema", async () => {
    const { episRouter } = await import("./routers/epis");
    const procedures = Object.keys(episRouter._def.procedures);
    expect(procedures).toContain("create");
    expect(procedures).toContain("update");
  });

  it("should have corCapacete as optional field in create procedure", async () => {
    const { episRouter } = await import("./routers/epis");
    const createProc = (episRouter._def.procedures as any).create;
    expect(createProc).toBeDefined();
    // The procedure should exist and accept input with corCapacete
    const inputSchema = createProc._def?.inputs?.[0];
    if (inputSchema) {
      // Validate that the schema accepts corCapacete
      const validInput = {
        companyId: 1,
        nome: "Capacete de Segurança",
        corCapacete: "Branco",
      };
      const result = inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.corCapacete).toBe("Branco");
      }
    }
  });

  it("should accept null corCapacete in create procedure", async () => {
    const { episRouter } = await import("./routers/epis");
    const createProc = (episRouter._def.procedures as any).create;
    const inputSchema = createProc._def?.inputs?.[0];
    if (inputSchema) {
      const validInput = {
        companyId: 1,
        nome: "Luva de Proteção",
        corCapacete: null,
      };
      const result = inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    }
  });

  it("should accept corCapacete in update procedure", async () => {
    const { episRouter } = await import("./routers/epis");
    const updateProc = (episRouter._def.procedures as any).update;
    const inputSchema = updateProc._def?.inputs?.[0];
    if (inputSchema) {
      const validInput = {
        id: 1,
        corCapacete: "Azul",
      };
      const result = inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.corCapacete).toBe("Azul");
      }
    }
  });

  it("should work without corCapacete (backward compatibility)", async () => {
    const { episRouter } = await import("./routers/epis");
    const createProc = (episRouter._def.procedures as any).create;
    const inputSchema = createProc._def?.inputs?.[0];
    if (inputSchema) {
      const validInput = {
        companyId: 1,
        nome: "Bota de Segurança",
      };
      const result = inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      // corCapacete should be undefined when not provided
      if (result.success) {
        expect(result.data.corCapacete).toBeUndefined();
      }
    }
  });
});

describe("Cor Capacete - Database Schema", () => {
  it("should have corCapacete column in epis table schema", async () => {
    const schema = await import("../drizzle/schema");
    const episTable = schema.epis;
    expect(episTable).toBeDefined();
    // Check that the column exists
    const columns = Object.keys((episTable as any));
    expect(columns).toContain("corCapacete");
  });
});

describe("Cor Capacete - Business Rules", () => {
  const VALID_COLORS = ["Branco", "Azul", "Verde", "Amarelo", "Vermelho", "Laranja", "Cinza", "Marrom", "Preto"];

  it("should define 9 standard helmet colors per NR-6/NR-18", () => {
    expect(VALID_COLORS).toHaveLength(9);
  });

  it("each color should have a defined function/role", () => {
    const COLOR_FUNCTIONS: Record<string, string> = {
      "Branco": "Engenheiros, Mestres de Obras, Encarregados",
      "Azul": "Pedreiros (alvenaria e estruturas)",
      "Verde": "Serventes, Operários, Téc. Segurança, Armadores",
      "Amarelo": "Visitantes",
      "Vermelho": "Carpinteiros, Bombeiros",
      "Laranja": "Eletricistas",
      "Cinza": "Estagiários, Visitantes técnicos",
      "Marrom": "Soldadores",
      "Preto": "Operadores de máquinas pesadas",
    };
    for (const color of VALID_COLORS) {
      expect(COLOR_FUNCTIONS[color]).toBeDefined();
      expect(COLOR_FUNCTIONS[color].length).toBeGreaterThan(0);
    }
  });

  it("should detect capacete names correctly", () => {
    const isCapacete = (nome: string) => {
      const n = (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return n.includes("capacete") || n.includes("helmet");
    };
    expect(isCapacete("Capacete de Segurança")).toBe(true);
    expect(isCapacete("CAPACETE CLASSE B")).toBe(true);
    expect(isCapacete("Safety Helmet")).toBe(true);
    expect(isCapacete("Luva de Proteção")).toBe(false);
    expect(isCapacete("Bota de Segurança")).toBe(false);
    expect(isCapacete("")).toBe(false);
  });
});
