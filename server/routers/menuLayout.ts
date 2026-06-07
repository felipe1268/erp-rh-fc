import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { menuLayoutGlobal } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Ordem GLOBAL do menu lateral — definida pelo Admin Master e válida para
 * TODOS os usuários (Rev. 2874). Guarda APENAS a ordem (por path/título),
 * não rótulos nem visibilidade (isso continua no menuConfig por usuário).
 *
 * Estrutura do JSON:
 *   {
 *     sectionOrders: { [moduleId]: string[] },              // ordem das seções
 *     itemOrders:    { [moduleId]: { [sectionTitle]: string[] } }  // ordem dos itens
 *   }
 *
 * Linha única (id = 1). Leitura liberada a qualquer usuário autenticado;
 * gravação/reset EXCLUSIVOS do admin_master. Reset NÃO faz DELETE físico —
 * regrava `{}` (respeita R-001/R-007/R-010).
 */
export const menuLayoutRouter = router({
  getGlobal: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(menuLayoutGlobal).where(eq(menuLayoutGlobal.id, 1)).limit(1);
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].layoutJson);
    } catch {
      return null;
    }
  }),

  saveGlobal: protectedProcedure.input(z.object({
    config: z.any(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new Error("Apenas o Admin Master pode definir a ordem global do menu.");
    }
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const json = JSON.stringify(input.config ?? {});
    const nowIso = new Date().toISOString();
    const existing = await db.select().from(menuLayoutGlobal).where(eq(menuLayoutGlobal.id, 1)).limit(1);
    if (existing.length > 0) {
      await db.update(menuLayoutGlobal)
        .set({ layoutJson: json, updatedBy: ctx.user.id, updatedAt: nowIso })
        .where(eq(menuLayoutGlobal.id, 1));
    } else {
      await db.insert(menuLayoutGlobal).values({ id: 1, layoutJson: json, updatedBy: ctx.user.id, updatedAt: nowIso });
    }
    return { success: true };
  }),

  resetGlobal: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new Error("Apenas o Admin Master pode redefinir a ordem global do menu.");
    }
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const nowIso = new Date().toISOString();
    const existing = await db.select().from(menuLayoutGlobal).where(eq(menuLayoutGlobal.id, 1)).limit(1);
    if (existing.length > 0) {
      await db.update(menuLayoutGlobal)
        .set({ layoutJson: "{}", updatedBy: ctx.user.id, updatedAt: nowIso })
        .where(eq(menuLayoutGlobal.id, 1));
    }
    return { success: true };
  }),
});
