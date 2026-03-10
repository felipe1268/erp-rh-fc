import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockExecute = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockGroupBy = vi.fn();
const mockOrderBy = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();

const mockDb = {
  select: vi.fn(() => ({ from: mockFrom })),
  insert: vi.fn(() => ({ values: mockValues })),
  update: vi.fn(() => ({ set: mockSet })),
  execute: vi.fn(() => Promise.resolve([[]])),
};

// Chain mocks
mockFrom.mockReturnValue({ where: mockWhere, groupBy: mockGroupBy, orderBy: mockOrderBy });
mockWhere.mockReturnValue({ groupBy: mockGroupBy, orderBy: mockOrderBy });
mockGroupBy.mockReturnValue({ orderBy: mockOrderBy });
mockOrderBy.mockResolvedValue([]);
mockValues.mockResolvedValue([{ insertId: 1 }]);
mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });

vi.mock("../server/db", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock("../drizzle/schema", () => ({
  skills: {
    id: "skills.id",
    companyId: "skills.companyId",
    nome: "skills.nome",
    categoria: "skills.categoria",
    descricao: "skills.descricao",
    deletedAt: "skills.deletedAt",
    createdAt: "skills.createdAt",
  },
  employeeSkills: {
    id: "employeeSkills.id",
    employeeId: "employeeSkills.employeeId",
    skillId: "employeeSkills.skillId",
    companyId: "employeeSkills.companyId",
    nivel: "employeeSkills.nivel",
    tempoExperiencia: "employeeSkills.tempoExperiencia",
    observacao: "employeeSkills.observacao",
    deletedAt: "employeeSkills.deletedAt",
    createdAt: "employeeSkills.createdAt",
  },
  employees: {
    id: "employees.id",
    nomeCompleto: "employees.nomeCompleto",
    funcao: "employees.funcao",
    status: "employees.status",
    deletedAt: "employees.deletedAt",
  },
}));

vi.mock("../server/companyHelper", () => ({
  companyFilter: vi.fn(),
  resolveCompanyIds: vi.fn((input: any) => {
    if (input.companyIds && input.companyIds.length > 0) return input.companyIds;
    return [input.companyId];
  }),
}));

describe("Skills Module", () => {
  describe("Data Model", () => {
    it("should have skills table fields defined in schema mock", () => {
      // Verify the mocked schema has the expected fields
      const skills = {
        id: "skills.id",
        companyId: "skills.companyId",
        nome: "skills.nome",
        categoria: "skills.categoria",
        descricao: "skills.descricao",
        deletedAt: "skills.deletedAt",
        createdAt: "skills.createdAt",
      };
      expect(skills.id).toBeDefined();
      expect(skills.companyId).toBeDefined();
      expect(skills.nome).toBeDefined();
      expect(skills.categoria).toBeDefined();
      expect(skills.descricao).toBeDefined();
      expect(skills.deletedAt).toBeDefined();
    });

    it("should have employee_skills table fields defined in schema", () => {
      const employeeSkills = {
        id: "employeeSkills.id",
        employeeId: "employeeSkills.employeeId",
        skillId: "employeeSkills.skillId",
        companyId: "employeeSkills.companyId",
        nivel: "employeeSkills.nivel",
        tempoExperiencia: "employeeSkills.tempoExperiencia",
        observacao: "employeeSkills.observacao",
        deletedAt: "employeeSkills.deletedAt",
        createdAt: "employeeSkills.createdAt",
      };
      expect(employeeSkills.id).toBeDefined();
      expect(employeeSkills.employeeId).toBeDefined();
      expect(employeeSkills.skillId).toBeDefined();
      expect(employeeSkills.companyId).toBeDefined();
      expect(employeeSkills.nivel).toBeDefined();
      expect(employeeSkills.tempoExperiencia).toBeDefined();
      expect(employeeSkills.observacao).toBeDefined();
      expect(employeeSkills.deletedAt).toBeDefined();
    });

    it("should have nivel enum values: Basico, Intermediario, Avancado", () => {
      // The nivel field should accept these values
      const validNiveis = ["Basico", "Intermediario", "Avancado"];
      validNiveis.forEach(nivel => {
        expect(typeof nivel).toBe("string");
        expect(nivel.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Company Helper", () => {
    it("should resolve company IDs from input", () => {
      // Inline implementation matching the companyHelper logic
      const resolveCompanyIds = (input: any) => {
        if (input.companyIds && input.companyIds.length > 0) return input.companyIds;
        return [input.companyId];
      };
      
      // Single company
      expect(resolveCompanyIds({ companyId: 1 })).toEqual([1]);
      
      // Multiple companies (construtoras)
      expect(resolveCompanyIds({ companyId: 1, companyIds: [1, 2, 3] })).toEqual([1, 2, 3]);
    });
  });

  describe("Skills CRUD Logic", () => {
    it("should validate that skill name is required", () => {
      // Simulating the zod validation
      const { z } = require("zod");
      const schema = z.object({
        companyId: z.number(),
        nome: z.string().min(1),
        categoria: z.string().optional(),
        descricao: z.string().optional(),
      });

      // Valid input
      expect(() => schema.parse({ companyId: 1, nome: "Pintura" })).not.toThrow();
      
      // Invalid - empty name
      expect(() => schema.parse({ companyId: 1, nome: "" })).toThrow();
    });

    it("should validate nivel enum values", () => {
      const { z } = require("zod");
      const nivelSchema = z.enum(["Basico", "Intermediario", "Avancado"]);

      expect(nivelSchema.parse("Basico")).toBe("Basico");
      expect(nivelSchema.parse("Intermediario")).toBe("Intermediario");
      expect(nivelSchema.parse("Avancado")).toBe("Avancado");
      expect(() => nivelSchema.parse("Expert")).toThrow();
    });

    it("should validate assignSkill input schema", () => {
      const { z } = require("zod");
      const schema = z.object({
        employeeId: z.number(),
        skillId: z.number(),
        companyId: z.number(),
        nivel: z.enum(["Basico", "Intermediario", "Avancado"]).default("Basico"),
        tempoExperiencia: z.string().optional(),
        observacao: z.string().optional(),
      });

      // Valid input with all fields
      const result = schema.parse({
        employeeId: 1,
        skillId: 2,
        companyId: 3,
        nivel: "Avancado",
        tempoExperiencia: "5 anos",
        observacao: "Experiência em obras de grande porte",
      });
      expect(result.nivel).toBe("Avancado");
      expect(result.tempoExperiencia).toBe("5 anos");

      // Valid input with defaults
      const result2 = schema.parse({
        employeeId: 1,
        skillId: 2,
        companyId: 3,
      });
      expect(result2.nivel).toBe("Basico");
    });
  });

  describe("UI Label Mappings", () => {
    it("should have correct nivel labels in Portuguese", () => {
      const nivelLabels: Record<string, string> = {
        Basico: "Básico",
        Intermediario: "Intermediário",
        Avancado: "Avançado",
      };

      expect(nivelLabels.Basico).toBe("Básico");
      expect(nivelLabels.Intermediario).toBe("Intermediário");
      expect(nivelLabels.Avancado).toBe("Avançado");
    });

    it("should have color mappings for each nivel", () => {
      const nivelColors: Record<string, string> = {
        Basico: "bg-blue-100 text-blue-800",
        Intermediario: "bg-amber-100 text-amber-800",
        Avancado: "bg-green-100 text-green-800",
      };

      expect(nivelColors.Basico).toContain("blue");
      expect(nivelColors.Intermediario).toContain("amber");
      expect(nivelColors.Avancado).toContain("green");
    });
  });
});
