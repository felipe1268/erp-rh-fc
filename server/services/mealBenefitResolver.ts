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
  const cond = (obraFilter: "obra" | "padrao") => obraFilter === "obra"
    ? sql`"obraId" = ${obraId}`
    : sql`"obraId" IS NULL`;

  async function vigente(obraFilter: "obra" | "padrao"): Promise<any | null> {
    const r = await db.execute(sql`
      SELECT * FROM meal_benefit_configs
      WHERE "companyId" = ${companyId} AND ${cond(obraFilter)} AND ativo = 1
        AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${refDate}::date)
        AND (vigencia_fim IS NULL OR vigencia_fim >= ${refDate}::date)
      ORDER BY vigencia_inicio DESC NULLS LAST, "createdAt" DESC
      LIMIT 1
    `);
    return r.rows?.length ? r.rows[0] : null;
  }

  async function fallback(obraFilter: "obra" | "padrao"): Promise<any | null> {
    // Nada vigente exatamente na data — pega a mais recente que já tinha começado
    const anterior = await db.execute(sql`
      SELECT * FROM meal_benefit_configs
      WHERE "companyId" = ${companyId} AND ${cond(obraFilter)} AND ativo = 1
        AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${refDate}::date)
      ORDER BY vigencia_inicio DESC NULLS LAST, "createdAt" DESC
      LIMIT 1
    `);
    if (anterior.rows?.length) return anterior.rows[0];

    // Último recurso: nenhuma config começou antes da data de referência (dado futuro/atípico) —
    // usa a mais antiga disponível para não deixar o cálculo zerado.
    const maisAntiga = await db.execute(sql`
      SELECT * FROM meal_benefit_configs
      WHERE "companyId" = ${companyId} AND ${cond(obraFilter)} AND ativo = 1
      ORDER BY vigencia_inicio ASC NULLS LAST, "createdAt" ASC
      LIMIT 1
    `);
    return maisAntiga.rows?.length ? maisAntiga.rows[0] : null;
  }

  // Rev. 5049 — config VIGENTE (em qualquer nível) tem prioridade sobre config
  // VENCIDA: antes, uma config da obra já expirada (ou com vigência inválida)
  // "ressuscitava" pelo fallback e ganhava da config padrão vigente da empresa,
  // saindo com valores defasados nos termos/rescisões.
  if (obraId) {
    const cfgObra = await vigente("obra");
    if (cfgObra) return cfgObra;
  }
  const cfgPadrao = await vigente("padrao");
  if (cfgPadrao) return cfgPadrao;
  if (obraId) {
    const fbObra = await fallback("obra");
    if (fbObra) return fbObra;
  }
  return fallback("padrao");
}
