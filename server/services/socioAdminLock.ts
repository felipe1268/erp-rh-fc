import { sql } from "drizzle-orm";

// Rev. 5103 - Atomic company-level serialization for the socio administrador
// criterion (system_criteria key socio_administrador_employee_id).
//
// CONCURRENCY / MOTIVATION
// ------------------------------------------------------------------
// Four flows read and/or write state that depends on the current socio
// administrador:
//   (a) financial.setSocioAdministrador - CHANGES the criterion (system_criteria)
//   (b) rhDocumentos.saveEmployerSigConfig - revalidates criterion + config upsert
//   (c) rhDocumentos.assinarLoteEmpregador - revalidates criterion + document updates
//   (d) rhDocumentos.aplicarAssinaturaEmpregadorAutomatica - revalidate + document update
//
// Without serialization, a socio change (a) can interleave between the read
// (revalidation) and the write (config/doc), persisting a signature with a
// stale socio - the classic TOCTOU (read-then-update is not enough).
//
// SOLUTION
// ------------------------------------------------------------------
// A single transaction-scoped advisory lock, keyed only by companyId (same key
// across all four flows). While one flow holds the lock inside its transaction,
// the others block until COMMIT/ROLLBACK.
//
// pg_advisory_xact_lock is released automatically at transaction end - safe for
// the Neon pooler (node-postgres/pg Pool driver): the whole transaction runs on
// the SAME pooled client, so the session-scoped lock it uses stays bound to the
// same backend and is released on commit/rollback. NEVER use pg_advisory_lock
// (session) here: with a reused pool the lock would leak across requests.
//
// The text key is hashed via hashtext() (int4), accepted by
// pg_advisory_xact_lock(bigint). A dedicated prefix avoids colliding with other
// advisory locks in the system.

/** Text key prefix - do not change without invalidating serialization. */
const LOCK_PREFIX = "socio_admin";

/**
 * Acquires the TRANSACTION-SCOPED advisory lock for the company socio
 * administrador.
 *
 * MUST be called INSIDE a transaction (db.transaction(async (tx) => ...)),
 * passing the transaction handle (tx). Blocks until the lock is granted;
 * releases automatically on the transaction commit/rollback.
 *
 * The same companyId yields the SAME key across all flows, guaranteeing mutual
 * serialization between (a)/(b)/(c)/(d).
 */
export async function lockSocioAdministrador(tx: any, companyId: number): Promise<void> {
  const key = `${LOCK_PREFIX}:${companyId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}
