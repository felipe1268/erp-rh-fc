// Rev. 2805 — Enforcement do liga/desliga de IA por módulo/empresa.
// Default PERMISSIVO: sem companyId resolvível ou sem linha gravada => HABILITADO.
// Só bloqueia quando existe uma linha com enabled = 0 para (company_id, modulo).
import { getDb } from "../db";
import { aiModuleConfig } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { AiModuleKey } from "../../shared/aiModules";

export async function isAiModuleEnabled(
  companyId: number | null | undefined,
  modulo: AiModuleKey,
): Promise<boolean> {
  if (!companyId) return true; // sem empresa resolvível: não bloqueia (ex.: ferramenta global)
  const db = await getDb();
  if (!db) return true;
  try {
    const [row] = await db
      .select({ enabled: aiModuleConfig.enabled })
      .from(aiModuleConfig)
      .where(and(eq(aiModuleConfig.companyId, companyId), eq(aiModuleConfig.modulo, modulo)))
      .limit(1);
    if (!row) return true; // ausência de config = habilitado
    return Number(row.enabled) !== 0;
  } catch {
    // Tabela ainda não materializada (self-heal pendente) — não bloquear.
    return true;
  }
}

export async function assertAiModuleEnabled(
  companyId: number | null | undefined,
  modulo: AiModuleKey,
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
