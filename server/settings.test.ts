import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  value?: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext; cookies: CookieCall[] } {
  const cookies: CookieCall[] = [];

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

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cookies.push({ name, options });
      },
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, cookies };
}

function createUserContext(): { ctx: TrpcContext; cookies: CookieCall[] } {
  const cookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 2,
    openId: "normal-user",
    email: "user@fcengenharia.com",
    name: "User Normal",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cookies.push({ name, options });
      },
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, cookies };
}

describe("settings.cleanDatabase", () => {
  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.settings.cleanDatabase({
        confirmPassword: "LIMPAR2026",
        modules: ["colaboradores"],
      })
    ).rejects.toThrow("Apenas admin pode limpar o banco");
  });

  it("rejects wrong confirmation password", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.settings.cleanDatabase({
        confirmPassword: "wrong-password",
        modules: ["colaboradores"],
      })
    ).rejects.toThrow("Senha de confirmação incorreta");
  });

  it("requires at least one module", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.settings.cleanDatabase({
        confirmPassword: "LIMPAR2026",
        modules: [],
      })
    ).rejects.toThrow();
  });
});

describe("userManagement.resetPassword", () => {
  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.resetPassword({ userId: 1 })
    ).rejects.toThrow("Apenas admin pode resetar senhas");
  });
});
