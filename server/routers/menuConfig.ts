import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { menuConfig } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const menuConfigRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(menuConfig).where(eq(menuConfig.userId, ctx.user.id)).limit(1);
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].configJson);
    } catch {
      return null;
    }
  }),

  save: protectedProcedure.input(z.object({
    config: z.any(),
  })).mutation(async ({ input, ctx }) => {
    const json = JSON.stringify(input.config);
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const existing = await db.select().from(menuConfig).where(eq(menuConfig.userId, ctx.user.id)).limit(1);
    if (existing.length > 0) {
      await db.update(menuConfig).set({ configJson: json }).where(eq(menuConfig.userId, ctx.user.id));
    } else {
      await db.insert(menuConfig).values({ userId: ctx.user.id, configJson: json });
    }
    return { success: true };
  }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(menuConfig).where(eq(menuConfig.userId, ctx.user.id));
    return { success: true };
  }),
});
