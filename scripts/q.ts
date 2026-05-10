import { getDb } from "../server/db";
import { sql } from "drizzle-orm";
const db = await getDb();

const users = await db.execute(sql`
  SELECT id, email, name, role, allowed_obra_ids
  FROM users
  ORDER BY id
`);
console.log("USUÁRIOS:", JSON.stringify(users.rows, null, 2));

const groups = await db.execute(sql`
  SELECT id, nome, acesso_todas_obras, ativo
  FROM user_groups
  ORDER BY id
`);
console.log("\nGRUPOS:", JSON.stringify(groups.rows, null, 2));

const members = await db.execute(sql`
  SELECT ugm."userId", ugm."groupId", ug.nome AS grupo_nome, ug.acesso_todas_obras, ug.ativo
  FROM user_group_members ugm
  JOIN user_groups ug ON ug.id = ugm."groupId"
  ORDER BY ugm."userId"
`);
console.log("\nMEMBROS DE GRUPOS:", JSON.stringify(members.rows, null, 2));

process.exit(0);
