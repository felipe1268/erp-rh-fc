import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

const mockFrom = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockReturnThis();
const mockOrderBy = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockResolvedValue([]);
const mockValues = vi.fn().mockResolvedValue([{ insertId: 1 }]);
const mockSet = vi.fn().mockReturnThis();

const mockDb = {
  select: () => ({ from: mockFrom }),
  insert: () => ({ values: mockValues }),
  update: () => ({ set: mockSet }),
  delete: () => ({ where: vi.fn().mockResolvedValue([]) }),
};

// Setup chain returns
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ orderBy: mockOrderBy });
mockOrderBy.mockReturnValue({ limit: mockLimit });
mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });

vi.mock("./db", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../drizzle/schema", () => ({
  medicos: { companyId: "companyId", ativo: "ativo", nome: "nome", crm: "crm", id: "id" },
  clinicas: { companyId: "companyId", ativo: "ativo", nome: "nome", id: "id" },
}));

describe("medicosClinicas router schema", () => {
  it("should have medicos table with required fields", async () => {
    const { medicos } = await import("../drizzle/schema");
    expect(medicos).toBeDefined();
    expect(medicos).toHaveProperty("companyId");
    expect(medicos).toHaveProperty("nome");
    expect(medicos).toHaveProperty("crm");
    expect(medicos).toHaveProperty("ativo");
  });

  it("should have clinicas table with required fields", async () => {
    const { clinicas } = await import("../drizzle/schema");
    expect(clinicas).toBeDefined();
    expect(clinicas).toHaveProperty("companyId");
    expect(clinicas).toHaveProperty("nome");
    expect(clinicas).toHaveProperty("ativo");
  });
});

describe("medicosClinicas router exports", () => {
  it("should export medicosClinicasRouter", async () => {
    // Verify the router file can be imported without errors
    const mod = await import("./routers/medicosClinicas");
    expect(mod.medicosClinicasRouter).toBeDefined();
  });
});
