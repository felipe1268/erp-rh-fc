import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module
vi.mock("./db", () => ({
  checkDuplicateCpf: vi.fn(),
  deleteEmployee: vi.fn(),
  createAuditLog: vi.fn(),
}));

import { checkDuplicateCpf, deleteEmployee, createAuditLog } from "./db";

describe("Employee CPF Duplicate Check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty array when CPF has less than 11 digits", async () => {
    (checkDuplicateCpf as any).mockResolvedValue([]);
    const result = await checkDuplicateCpf("123.456.78");
    expect(result).toEqual([]);
  });

  it("should return employee data when CPF is found", async () => {
    const mockResult = [
      {
        id: 1,
        nomeCompleto: "João Silva",
        cpf: "12345678901",
        companyId: 1,
        status: "Ativo",
        empresa: "FC Engenharia",
      },
    ];
    (checkDuplicateCpf as any).mockResolvedValue(mockResult);
    const result = await checkDuplicateCpf("12345678901");
    expect(result).toHaveLength(1);
    expect(result[0].nomeCompleto).toBe("João Silva");
    expect(result[0].empresa).toBe("FC Engenharia");
  });

  it("should exclude employee by ID when editing", async () => {
    (checkDuplicateCpf as any).mockResolvedValue([]);
    const result = await checkDuplicateCpf("12345678901", 5);
    expect(checkDuplicateCpf).toHaveBeenCalledWith("12345678901", 5);
    expect(result).toEqual([]);
  });
});

describe("Bulk Delete Employees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call deleteEmployee for each ID", async () => {
    (deleteEmployee as any).mockResolvedValue(undefined);
    (createAuditLog as any).mockResolvedValue(undefined);

    const ids = [1, 2, 3];
    const companyId = 1;

    for (const id of ids) {
      await deleteEmployee(id, companyId);
    }

    expect(deleteEmployee).toHaveBeenCalledTimes(3);
    expect(deleteEmployee).toHaveBeenCalledWith(1, 1);
    expect(deleteEmployee).toHaveBeenCalledWith(2, 1);
    expect(deleteEmployee).toHaveBeenCalledWith(3, 1);
  });

  it("should create audit log after bulk delete", async () => {
    (deleteEmployee as any).mockResolvedValue(undefined);
    (createAuditLog as any).mockResolvedValue(undefined);

    const ids = [1, 2, 3];
    for (const id of ids) {
      await deleteEmployee(id, 1);
    }
    await createAuditLog({
      userId: 1,
      userName: "Admin",
      companyId: 1,
      action: "DELETE",
      module: "core_rh",
      entityType: "employee",
      entityId: ids[0],
      details: `Exclusão em massa: ${ids.length} colaboradores`,
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        module: "core_rh",
        entityType: "employee",
        details: "Exclusão em massa: 3 colaboradores",
      })
    );
  });
});
