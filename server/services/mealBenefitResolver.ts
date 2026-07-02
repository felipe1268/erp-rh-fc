import { sql } from "drizzle-orm";

/**
 * Rev. 3985 — Resolve a configuração de Benefícios de Alimentação (meal_benefit_configs)
 * VIGENTE numa data de referência, para uma obra específica (com fallback para a config
 * "Todas as Obras" da empresa).
 *
 * Regra de vigência:
 *  1) Tenta a config da OBRA específica que estava vigente em `refDate`
 *     (vigenciaInicio <= refDate AND (vigenciaFim IS NULL OR vigenciaFim >= refDate)),
 *     pegando a de vigenciaInicio mais recente em caso de sobreposição.
 *  2) Se não achar, cai para a config "Todas as Obras" (obraId IS NULL) vigente na mesma data.
 *  3) Se ainda assim nada estiver vigente na data exata (ex.: dado histórico sem vigência
 *     bem definida), usa a config mais próxima por vigenciaInicio (a mais recente que já
 *     tinha começado até `refDate`; na ausência de qualquer uma anterior, a mais antiga
 *     disponível) — para nunca deixar o cálculo sem VR só por causa de um gap de dados.
 */
export async function resolveMealBenefitConfig(
  db: any,
  companyId: number,
  obraId: number | null | undefined,
  refDate: string, // 'YYYY-MM-DD'
): Promise<any | null> {
  async function tryTier(obraFilter: "obra" | "padrao"): Promise<any | null> {
    const obraCondition = obraFilter === "obra"
      ? sql`"obraId" = ${obraId}`
      : sql`"obraId" IS NULL`;

    const vigente = await db.execute(sql`
      SELECT * FROM meal_benefit_configs
      WHERE "companyId" = ${companyId} AND ${obraCondition} AND ativo = 1
        AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${refDate}::date)
        AND (vigencia_fim IS NULL OR vigencia_fim >= ${refDate}::date)
      ORDER BY vigencia_inicio DESC NULLS LAST, "createdAt" DESC
      LIMIT 1
    `);
    if (vigente.rows?.length) return vigente.rows[0];

    // Fallback: nada vigente exatamente na data — pega a mais recente que já tinha começado
    const anterior = await db.execute(sql`
      SELECT * FROM meal_benefit_configs
      WHERE "companyId" = ${companyId} AND ${obraCondition} AND ativo = 1
        AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${refDate}::date)
      ORDER BY vigencia_inicio DESC NULLS LAST, "createdAt" DESC
      LIMIT 1
    `);
    if (anterior.rows?.length) return anterior.rows[0];

    // Último recurso: nenhuma config começou antes da data de referência (dado futuro/atípico) —
    // usa a mais antiga disponível para não deixar o cálculo zerado.
    const maisAntiga = await db.execute(sql`
      SELECT * FROM meal_benefit_configs
      WHERE "companyId" = ${companyId} AND ${obraCondition} AND ativo = 1
      ORDER BY vigencia_inicio ASC NULLS LAST, "createdAt" ASC
      LIMIT 1
    `);
    return maisAntiga.rows?.length ? maisAntiga.rows[0] : null;
  }

  if (obraId) {
    const cfg = await tryTier("obra");
    if (cfg) return cfg;
  }
  return tryTier("padrao");
}
