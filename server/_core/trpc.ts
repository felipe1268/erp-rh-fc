import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ROUTER_MODULE_MAP, isModuleAccessibleForUser } from "./moduleGating";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Rev. 4045 — T005: gate global de módulos contratados (SaaS). Roda em toda
// protectedProcedure; namespaces fora de ROUTER_MODULE_MAP nunca são
// afetados. Ver server/_core/moduleGating.ts para a regra de compatibilidade
// com empresas legadas (sem subscription).
const requireModuleGate = t.middleware(async opts => {
  const { ctx, next, path } = opts;
  const namespace = path.split(".")[0];
  const moduleId = ROUTER_MODULE_MAP[namespace];
  if (!moduleId || !ctx.user) return next();

  const allowed = await isModuleAccessibleForUser(ctx.user.id, ctx.user.role, moduleId);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Este módulo não está incluído no plano contratado pela sua empresa. Fale com o administrador para contratá-lo.`,
    });
  }
  return next();
});

export const protectedProcedure = t.procedure.use(requireUser).use(requireModuleGate);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'admin_master')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
