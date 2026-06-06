// Rev. 2805 — Enforcement do liga/desliga de IA por módulo/empresa.
// Default PERMISSIVO: sem companyId resolvível ou sem linha gravada => HABILITADO.
// Só bloqueia quando existe uma linha com enabled = 0 para (company_id, modulo).
import { getDb } from "../db";
import { aiModuleConfig } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { AiModuleKey, QaChatModuleKey } from "../../shared/aiModules";

// Sentinela de configuração GLOBAL (vale p/ TODAS as empresas). Rev. 2809 —
// necessária porque o admin-master frequentemente opera SEM empresa resolvível
// (companyId = 0); sem este fallback o liga/desliga do chat Q&A nunca surtiria
// efeito p/ ele. Precedência: linha da empresa > linha global > habilitado.
const GLOBAL_COMPANY_ID = 0;

async function lerEnabled(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  modulo: string,
): Promise<boolean | null> {
  const [row] = await db
    .select({ enabled: aiModuleConfig.enabled })
    .from(aiModuleConfig)
    .where(and(eq(aiModuleConfig.companyId, companyId), eq(aiModuleConfig.modulo, modulo)))
    .limit(1);
  if (!row) return null; // ausência de linha nesse escopo
  return Number(row.enabled) !== 0;
}

export async function isAiModuleEnabled(
  companyId: number | null | undefined,
  modulo: AiModuleKey | QaChatModuleKey | string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  try {
    // 1) Config específica da empresa (quando há empresa resolvível).
    if (companyId) {
      const empresa = await lerEnabled(db, companyId, modulo);
      if (empresa !== null) return empresa;
    }
    // 2) Fallback GLOBAL (companyId = 0) — vale p/ todas as empresas.
    const global = await lerEnabled(db, GLOBAL_COMPANY_ID, modulo);
    if (global !== null) return global;
    // 3) Sem nenhuma config = habilitado (default permissivo).
    return true;
  } catch {
    // Tabela ainda não materializada (self-heal pendente) — não bloquear.
    return true;
  }
}

export async function assertAiModuleEnabled(
  companyId: number | null | undefined,
  modulo: AiModuleKey | QaChatModuleKey | string,
): Promise<void> {
  const ok = await isAiModuleEnabled(companyId, modulo);
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "A IA deste módulo está desativada. Ative em Configurações › Inteligência Artificial.",
    });
  }
}
