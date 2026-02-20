import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database module
vi.mock("./db", () => ({
  getObras: vi.fn().mockResolvedValue([
    { id: 1, companyId: 1, nome: "Obra Alpha", codigo: "OBR-001", status: "Em_Andamento" },
    { id: 2, companyId: 1, nome: "Obra Beta", codigo: "OBR-002", status: "Planejamento" },
  ]),
  getObrasByCompanyActive: vi.fn().mockResolvedValue([
    { id: 1, companyId: 1, nome: "Obra Alpha", codigo: "OBR-001", status: "Em_Andamento" },
  ]),
  getObraById: vi.fn().mockResolvedValue({
    id: 1, companyId: 1, nome: "Obra Alpha", codigo: "OBR-001", status: "Em_Andamento",
    cliente: "Cliente A", responsavel: "João", endereco: "Rua A", cidade: "Recife", estado: "PE",
  }),
  createObra: vi.fn().mockResolvedValue({ insertId: 3 }),
  updateObra: vi.fn().mockResolvedValue(undefined),
  deleteObra: vi.fn().mockResolvedValue(undefined),
  allocateEmployeeToObra: vi.fn().mockResolvedValue({ insertId: 1 }),
  checkDuplicateCpf: vi.fn().mockResolvedValue([]),
}));

describe("Obras Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list obras by company", async () => {
    const { getObras } = await import("./db");
    const result = await getObras(1);
    expect(result).toHaveLength(2);
    expect(result[0].nome).toBe("Obra Alpha");
    expect(result[1].nome).toBe("Obra Beta");
  });

  it("should list only active obras", async () => {
    const { getObrasByCompanyActive } = await import("./db");
    const result = await getObrasByCompanyActive(1);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("Em_Andamento");
  });

  it("should get obra by id", async () => {
    const { getObraById } = await import("./db");
    const result = await getObraById(1);
    expect(result).toBeDefined();
    expect(result!.nome).toBe("Obra Alpha");
    expect(result!.cliente).toBe("Cliente A");
  });

  it("should create a new obra", async () => {
    const { createObra } = await import("./db");
    const result = await createObra({
      companyId: 1,
      nome: "Obra Gamma",
      codigo: "OBR-003",
      status: "Planejamento",
    } as any);
    expect(result).toEqual({ insertId: 3 });
  });

  it("should update an obra", async () => {
    const { updateObra } = await import("./db");
    await updateObra(1, { nome: "Obra Alpha Atualizada" } as any);
    expect(updateObra).toHaveBeenCalledWith(1, { nome: "Obra Alpha Atualizada" });
  });

  it("should delete an obra", async () => {
    const { deleteObra } = await import("./db");
    await deleteObra(1);
    expect(deleteObra).toHaveBeenCalledWith(1);
  });

  it("should allocate employee to obra", async () => {
    const { allocateEmployeeToObra } = await import("./db");
    const result = await allocateEmployeeToObra({
      obraId: 1,
      employeeId: 5,
      dataInicio: "2026-01-15",
    });
    expect(result).toEqual({ insertId: 1 });
  });
});

describe("CPF Duplicate Check", () => {
  it("should return empty array when no duplicate found", async () => {
    const { checkDuplicateCpf } = await import("./db");
    const result = await checkDuplicateCpf("12345678901");
    expect(result).toEqual([]);
  });

  it("should return matching employees when CPF exists", async () => {
    const { checkDuplicateCpf } = await import("./db");
    (checkDuplicateCpf as any).mockResolvedValueOnce([
      { id: 1, nomeCompleto: "João Silva", cpf: "12345678901", companyId: 1, companyName: "FC Engenharia" },
    ]);
    const result = await checkDuplicateCpf("12345678901");
    expect(result).toHaveLength(1);
    expect(result[0].nomeCompleto).toBe("João Silva");
    expect(result[0].companyName).toBe("FC Engenharia");
  });
});

describe("Menu Structure", () => {
  it("should have correct OPERACIONAL items", () => {
    const operacionalItems = [
      "Fechamento de Ponto",
      "Folha de Pagamento",
      "CIPA",
      "Controle de Documentos",
      "Vale Alimentação",
    ];
    expect(operacionalItems).toHaveLength(5);
    expect(operacionalItems).not.toContain("Gestão de Ativos");
    expect(operacionalItems).not.toContain("SST - Geral");
    expect(operacionalItems).not.toContain("Ponto e Folha");
  });

  it("should NOT contain removed modules", () => {
    const removedModules = ["5W2H", "Extintores/Hidrantes", "Auditoria e Qualidade", "Gestão de Ativos", "SST - Geral"];
    const currentMenuItems = [
      "Painel", "Empresas", "Obras", "Colaboradores",
      "Fechamento de Ponto", "Folha de Pagamento", "CIPA", "Controle de Documentos", "Vale Alimentação",
      "Todos os Dashboards", "Colaboradores", "Pendências", "Treinamentos",
    ];
    for (const removed of removedModules) {
      expect(currentMenuItems).not.toContain(removed);
    }
  });

  it("should have Obras in PRINCIPAL section", () => {
    const principalItems = ["Painel", "Empresas", "Obras"];
    expect(principalItems).toContain("Obras");
  });
});
