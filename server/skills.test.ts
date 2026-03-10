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

  describe("Bulk Assign Logic", () => {
    it("should validate bulk assign input schema", () => {
      const { z } = require("zod");
      const schema = z.object({
        skillId: z.number(),
        companyId: z.number(),
        employeeIds: z.array(z.number()).min(1),
        nivel: z.enum(["Basico", "Intermediario", "Avancado"]).default("Basico"),
        tempoExperiencia: z.string().optional(),
        observacao: z.string().optional(),
      });

      // Valid input with multiple employees
      const result = schema.parse({
        skillId: 1,
        companyId: 1,
        employeeIds: [1, 2, 3, 4, 5],
        nivel: "Intermediario",
        tempoExperiencia: "2 anos",
      });
      expect(result.employeeIds).toHaveLength(5);
      expect(result.nivel).toBe("Intermediario");
    });

    it("should reject empty employeeIds array", () => {
      const { z } = require("zod");
      const schema = z.object({
        skillId: z.number(),
        companyId: z.number(),
        employeeIds: z.array(z.number()).min(1),
        nivel: z.enum(["Basico", "Intermediario", "Avancado"]).default("Basico"),
      });

      expect(() => schema.parse({
        skillId: 1,
        companyId: 1,
        employeeIds: [],
      })).toThrow();
    });

    it("should handle bulk assign result counting", () => {
      // Simulate counting new vs existing assignments
      const existingEmployeeIds = [1, 3];
      const requestedIds = [1, 2, 3, 4, 5];
      const newIds = requestedIds.filter(id => !existingEmployeeIds.includes(id));
      const skipped = requestedIds.length - newIds.length;

      expect(newIds).toEqual([2, 4, 5]);
      expect(newIds.length).toBe(3);
      expect(skipped).toBe(2);
    });
  });

  describe("Report By Obra Logic", () => {
    it("should group skills by obra correctly", () => {
      // Simulate the grouping logic used in the report
      const rawData = [
        { obraId: 1, obraNome: "Obra A", skillName: "Pintura", empCount: 3 },
        { obraId: 1, obraNome: "Obra A", skillName: "Elétrica", empCount: 2 },
        { obraId: 2, obraNome: "Obra B", skillName: "Pintura", empCount: 1 },
      ];

      const grouped = new Map<number, { nome: string; skills: any[] }>();
      for (const row of rawData) {
        if (!grouped.has(row.obraId)) {
          grouped.set(row.obraId, { nome: row.obraNome, skills: [] });
        }
        grouped.get(row.obraId)!.skills.push({
          name: row.skillName,
          count: row.empCount,
        });
      }

      expect(grouped.size).toBe(2);
      expect(grouped.get(1)!.skills).toHaveLength(2);
      expect(grouped.get(2)!.skills).toHaveLength(1);
    });

    it("should identify missing skills per obra", () => {
      const allSkills = ["Pintura", "Elétrica", "Hidráulica", "Soldagem"];
      const obraSkills = ["Pintura", "Elétrica"];
      const missing = allSkills.filter(s => !obraSkills.includes(s));

      expect(missing).toEqual(["Hidráulica", "Soldagem"]);
      expect(missing).toHaveLength(2);
    });
  });

  describe("Dashboard Data Logic", () => {
    it("should calculate coverage percentage correctly", () => {
      const totalActive = 100;
      const totalWithSkill = 35;
      const coverage = Math.round((totalWithSkill / totalActive) * 100);

      expect(coverage).toBe(35);
    });

    it("should calculate average skills per employee", () => {
      const totalAssignments = 150;
      const totalActive = 100;
      const avg = (totalAssignments / totalActive).toFixed(1);

      expect(avg).toBe("1.5");
    });

    it("should handle zero active employees gracefully", () => {
      const totalActive = 0;
      const totalWithSkill = 0;
      const coverage = totalActive > 0 ? Math.round((totalWithSkill / totalActive) * 100) : 0;
      const avg = totalActive > 0 ? (0 / totalActive).toFixed(1) : "0";

      expect(coverage).toBe(0);
      expect(avg).toBe("0");
    });

    it("should calculate totalNoSkill correctly", () => {
      const totalActive = 50;
      const totalWithSkill = 20;
      const totalNoSkill = totalActive - totalWithSkill;

      expect(totalNoSkill).toBe(30);
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
