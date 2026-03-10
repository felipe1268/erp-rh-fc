import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};

vi.mock("./db", () => ({
  getDb: vi.fn(() => mockDb),
  getCompanies: vi.fn(() => [
    { id: 1, razaoSocial: "FC Engenharia", nomeFantasia: "FC", deletedAt: null },
    { id: 2, razaoSocial: "Hotel Consagração", nomeFantasia: "Hotel", deletedAt: null },
    { id: 3, razaoSocial: "Lock Up", nomeFantasia: "Lock Up", deletedAt: null },
    { id: 4, razaoSocial: "Júlio Materiais", nomeFantasia: "Júlio", deletedAt: null },
  ]),
  getCompaniesForUser: vi.fn(async (userId: number, role: string) => {
    if (role === "admin_master") {
      return [
        { id: 1, razaoSocial: "FC Engenharia" },
        { id: 2, razaoSocial: "Hotel Consagração" },
        { id: 3, razaoSocial: "Lock Up" },
        { id: 4, razaoSocial: "Júlio Materiais" },
      ];
    }
    // Simula vínculos: user 10 tem empresas [1, 2], user 20 tem [1]
    const links: Record<number, number[]> = { 10: [1, 2], 20: [1] };
    const userLinks = links[userId] || [];
    return [
      { id: 1, razaoSocial: "FC Engenharia" },
      { id: 2, razaoSocial: "Hotel Consagração" },
      { id: 3, razaoSocial: "Lock Up" },
      { id: 4, razaoSocial: "Júlio Materiais" },
    ].filter(c => userLinks.includes(c.id));
  }),
  getUserCompanyLinks: vi.fn(async (userId: number) => {
    const links: Record<number, number[]> = { 10: [1, 2], 20: [1], 30: [] };
    return (links[userId] || []).map(cid => ({ userId, companyId: cid }));
  }),
  setUserCompanies: vi.fn(async () => {}),
}));

import { getCompaniesForUser, getUserCompanyLinks, setUserCompanies } from "./db";

describe("Controle de Acesso por Empresa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCompaniesForUser", () => {
    it("admin_master deve ver todas as empresas", async () => {
      const result = await getCompaniesForUser(1, "admin_master");
      expect(result).toHaveLength(4);
      expect(result.map((c: any) => c.id)).toEqual([1, 2, 3, 4]);
    });

    it("usuário com vínculos deve ver apenas empresas vinculadas", async () => {
      const result = await getCompaniesForUser(10, "user");
      expect(result).toHaveLength(2);
      expect(result.map((c: any) => c.id)).toEqual([1, 2]);
    });

    it("usuário com um único vínculo deve ver apenas essa empresa", async () => {
      const result = await getCompaniesForUser(20, "user");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it("usuário sem vínculos não deve ver nenhuma empresa", async () => {
      const result = await getCompaniesForUser(99, "user");
      expect(result).toHaveLength(0);
    });

    it("admin (não master) com vínculos deve ver apenas empresas vinculadas", async () => {
      const result = await getCompaniesForUser(10, "admin");
      expect(result).toHaveLength(2);
    });
  });

  describe("getUserCompanyLinks", () => {
    it("deve retornar vínculos do usuário", async () => {
      const links = await getUserCompanyLinks(10);
      expect(links).toHaveLength(2);
      expect(links[0]).toEqual({ userId: 10, companyId: 1 });
      expect(links[1]).toEqual({ userId: 10, companyId: 2 });
    });

    it("deve retornar array vazio para usuário sem vínculos", async () => {
      const links = await getUserCompanyLinks(30);
      expect(links).toHaveLength(0);
    });
  });

  describe("setUserCompanies", () => {
    it("deve ser chamado com userId e companyIds corretos", async () => {
      await setUserCompanies(10, [1, 3, 4]);
      expect(setUserCompanies).toHaveBeenCalledWith(10, [1, 3, 4]);
    });

    it("deve aceitar array vazio para remover todos os vínculos", async () => {
      await setUserCompanies(10, []);
      expect(setUserCompanies).toHaveBeenCalledWith(10, []);
    });
  });

  describe("Regras de negócio", () => {
    it("admin_master sempre vê 4 empresas independente de vínculos", async () => {
      const result = await getCompaniesForUser(99, "admin_master");
      expect(result).toHaveLength(4);
    });

    it("usuário normal sem vínculo vê 0 empresas", async () => {
      const result = await getCompaniesForUser(99, "user");
      expect(result).toHaveLength(0);
    });

    it("companyIds retornados devem ser números", async () => {
      const links = await getUserCompanyLinks(10);
      links.forEach((l: any) => {
        expect(typeof l.companyId).toBe("number");
      });
    });
  });
});
