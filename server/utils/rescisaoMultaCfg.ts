import { sql } from "drizzle-orm";

/**
 * Rev. 3036 — Carregador do critério LIGA/DESLIGA da Multa de 40% do FGTS na
 * rescisão. Lê `system_criteria` chave `rescisao_aplicar_multa_fgts` por empresa.
 *
 * AUSÊNCIA do critério (XML antigo / empresa que ainda não rodou o seed) = `true`
 * (inclui a multa = comportamento CLT padrão), preservando o cálculo legado.
 * Desligado ("0"/"false"/"nao"/"n") = `false` (zera a multa).
 *
 * O cálculo da multa em si segue em `calcularRescisaoCompleta` (param
 * `incluirMultaFgts`); estes helpers só resolvem o valor do critério por empresa.
 */

function interpretarValor(valor: unknown): boolean {
  const v = String(valor ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "nao" || v === "não" || v === "n");
}

/** Versão em lote — devolve um Map<companyId, incluirMultaFgts> p/ uso em `.map`
 * SÍNCRONO (dashboards) e em loops que percorrem várias empresas. Empresas sem
 * registro NÃO entram no Map → o chamador deve usar `?? true`. */
export async function carregarMultaFgtsPorEmpresa(
  db: any,
  companyIds: Array<number | null | undefined>,
): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  const ids = [...new Set((companyIds || []).map((c) => Number(c)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return map;
  try {
    const rows =
      ((await db.execute(sql`
        SELECT "companyId", valor FROM system_criteria
        WHERE chave = 'rescisao_aplicar_multa_fgts'
          AND "companyId" IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      `)) as any).rows || [];
    for (const r of rows) {
      map.set(Number(r.companyId), interpretarValor(r.valor));
    }
  } catch {
    /* ausência → default true via `?? true` no chamador */
  }
  return map;
}

/** Versão one-shot p/ chamadas únicas (getById, gerar, update, create…). */
export async function getIncluirMultaFgts(
  db: any,
  companyId: number | null | undefined,
): Promise<boolean> {
  const cid = Number(companyId) || 0;
  if (!cid) return true;
  const map = await carregarMultaFgtsPorEmpresa(db, [cid]);
  return map.get(cid) ?? true;
}
