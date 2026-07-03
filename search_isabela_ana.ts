import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  const db = await getDb();
  
  // Find users
  const users = await db.execute(sql`
    SELECT id, name, role, allowed_obra_ids, "modulesAccess", status, email
    FROM users
    WHERE name ILIKE '%Isabela%' OR name ILIKE '%Ana%'
  `);
  
  console.log("--- USERS ---");
  console.log(JSON.stringify(users.rows, null, 2));
  
  if (users.rows.length === 0) {
    console.log("No users found.");
    process.exit(0);
  }
  
  const userIds = users.rows.map(u => u.id);
  const userIdsStr = userIds.join(',');

  // Related companies
  const companies = await db.execute(sql`
    SELECT uc."userId", uc."companyId", c."razaoSocial" as company_name
    FROM user_companies uc
    JOIN companies c ON c.id = uc."companyId"
    WHERE uc."userId" IN (${sql.raw(userIdsStr)})
  `);
  console.log("\n--- USER COMPANIES ---");
  console.log(JSON.stringify(companies.rows, null, 2));

  // Employee info - searching by name components to catch partial matches
  const employees = await db.execute(sql`
    SELECT id, "companyId", "nomeCompleto", status, cargo, funcao, email
    FROM employees
    WHERE "nomeCompleto" ILIKE '%Isabela%' OR "nomeCompleto" ILIKE '%Ana%'
  `);
  console.log("\n--- EMPLOYEES ---");
  console.log(JSON.stringify(employees.rows, null, 2));

  // Permissions
  const permissions = await db.execute(sql`
    SELECT "userId", "module_id", "feature_key", "canAccess"
    FROM user_permissions
    WHERE "userId" IN (${sql.raw(userIdsStr)})
  `);
  console.log("\n--- USER PERMISSIONS ---");
  console.log(JSON.stringify(permissions.rows, null, 2));

  // Group membership
  const groupMembers = await db.execute(sql`
    SELECT ugm."userId", ugm."groupId", ug.nome as group_name, ug.acesso_todas_obras
    FROM user_group_members ugm
    JOIN user_groups ug ON ug.id = ugm."groupId"
    WHERE ugm."userId" IN (${sql.raw(userIdsStr)})
  `);
  console.log("\n--- GROUP MEMBERS ---");
  console.log(JSON.stringify(groupMembers.rows, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
