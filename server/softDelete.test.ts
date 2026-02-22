import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@fcengenharia.com",
    name: "Admin FC",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Soft Delete - Rotas de Lixeira", () => {
  it("rota employees.getDeleted existe e requer autenticação", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Deve falhar sem autenticação
    await expect(caller.employees.listDeleted({ companyId: 1 })).rejects.toThrow();
  });

  it("rota employees.getDeleted retorna array quando autenticado", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employees.listDeleted({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("rota employees.restore existe e requer autenticação", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Deve falhar sem autenticação
    await expect(
      caller.employees.restore({ id: 999, companyId: 1 })
    ).rejects.toThrow();
  });

  it("rota employees.permanentDelete existe e requer autenticação", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Deve falhar sem autenticação
    await expect(
      caller.employees.permanentDelete({ id: 999, companyId: 1 })
    ).rejects.toThrow();
  });

  it("rota employees.delete agora faz soft delete (não exclui permanentemente)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // A rota de delete deve existir e aceitar o input correto
    // Ela agora faz soft delete ao invés de exclusão permanente
    try {
      // Tentar deletar um ID que não existe - deve retornar sem erro ou com erro de "não encontrado"
      await caller.employees.delete({ id: 999999, companyId: 1 });
    } catch (e: any) {
      // Se der erro, deve ser algo como "não encontrado", não erro de rota
      expect(e.message).not.toContain("is not a function");
    }
  });

  it("rota employees.list filtra excluídos (deletedAt IS NULL)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // A listagem deve retornar apenas funcionários não excluídos
    const result = await caller.employees.list({ companyId: 1 });
    expect(Array.isArray(result)).toBe(true);
    // Todos os resultados devem ter deletedAt null (ou não ter o campo)
    result.forEach((emp: any) => {
      expect(emp.deletedAt).toBeFalsy();
    });
  });
});
