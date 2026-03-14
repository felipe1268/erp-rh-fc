import { ENV } from "./env";

export async function initSetup() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminName = process.env.ADMIN_NAME || "Admin";

  if (!adminEmail || !adminPassword) {
    console.log("[InitSetup] ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin bootstrap");
    return;
  }

  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) {
      console.warn("[InitSetup] Database not available — skipping setup");
      return;
    }

    const { companies, users, userCompanies } = await import("../../drizzle/schema");
    const { eq, or, sql } = await import("drizzle-orm");
    const bcrypt = await import("bcryptjs");

    // ── 1. Ensure at least one company exists ────────────────────────────────
    const existingCompanies = await db.select({ id: companies.id }).from(companies).limit(1);
    let companyId: number;

    if (existingCompanies.length === 0) {
      console.log("[InitSetup] No companies found — creating default 'FC Engenharia'");
      const inserted = await db.insert(companies).values({
        cnpj: "00.000.000/0001-00",
        razaoSocial: "FC Engenharia Civil Ltda",
        nomeFantasia: "FC Engenharia",
        isActive: 1,
      }).returning({ id: companies.id });
      companyId = inserted[0].id;
      console.log(`[InitSetup] Company created with id=${companyId}`);
    } else {
      companyId = existingCompanies[0].id;
      console.log(`[InitSetup] Using existing company id=${companyId}`);
    }

    // ── 2. Ensure admin_master user exists ───────────────────────────────────
    const existingUser = await db.select({ id: users.id, openId: users.openId })
      .from(users)
      .where(
        or(
          sql`LOWER(${users.email}) = LOWER(${adminEmail})`,
          sql`LOWER(${users.username}) = LOWER(${adminUsername})`
        )
      )
      .limit(1);

    let userId: number;
    let userOpenId: string;

    if (existingUser.length === 0) {
      console.log(`[InitSetup] Admin user not found — creating '${adminUsername}'`);
      const hashed = bcrypt.hashSync(adminPassword, 10);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      const inserted = await db.insert(users).values({
        openId,
        name: adminName,
        email: adminEmail,
        username: adminUsername,
        password: hashed,
        role: "admin_master",
        loginMethod: "local",
        mustChangePassword: 0,
      }).returning({ id: users.id, openId: users.openId });
      userId = inserted[0].id;
      userOpenId = inserted[0].openId;
      console.log(`[InitSetup] Admin user created with id=${userId} openId=${userOpenId}`);
    } else {
      userId = existingUser[0].id;
      userOpenId = existingUser[0].openId;
      console.log(`[InitSetup] Admin user already exists with id=${userId}`);

      // Ensure role is admin_master and password is up to date
      const existingFull = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const u = existingFull[0];

      const updates: Record<string, any> = {};
      if (u.role !== "admin_master") updates.role = "admin_master";
      if (u.name !== adminName && (!u.name || u.name.trim() === "")) updates.name = adminName;
      if (!u.password) {
        updates.password = bcrypt.hashSync(adminPassword, 10);
        updates.mustChangePassword = 0;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, userId));
        console.log(`[InitSetup] Admin user updated:`, Object.keys(updates));
      }
    }

    // ── 3. Link admin user to company if not already linked ─────────────────
    const existingLink = await db.select({ id: userCompanies.id })
      .from(userCompanies)
      .where(
        sql`${userCompanies.userId} = ${userId} AND ${userCompanies.companyId} = ${companyId}`
      )
      .limit(1);

    if (existingLink.length === 0) {
      await db.insert(userCompanies).values({ userId, companyId });
      console.log(`[InitSetup] Linked user ${userId} to company ${companyId}`);
    }

    console.log("[InitSetup] Bootstrap complete");
  } catch (error) {
    console.error("[InitSetup] Error during setup:", error);
  }
}
