/**
 * Rev. 2478 — Helper batched para status CIPA por colaborador.
 *
 * Retorna Map<employeeId, CipaStatus> com:
 *   - ativo: membro atualmente vigente (mandato em curso E statusMembro='Ativo')
 *   - estabilidade: NÃO é mais membro ativo, mas tem imunidade pós-mandato
 *     vigente (CF Art. 10 II 'a' ADCT + CLT Art. 165 — só representação
 *     "Empregados"; representantes do empregador NÃO têm estabilidade).
 *   - fim: data fim da estabilidade (YYYY-MM-DD) quando aplicável.
 *   - cargo: cargo na CIPA (Presidente, Vice_Presidente, etc.).
 *
 * Uma única query batched via `inArray` — custo O(1) independente do tamanho
 * da lista. Quando `employeeIds` é vazio, retorna Map vazio sem ir ao DB.
 *
 * Convenção (alinhada com o pattern já em uso em dashboards.ts e
 * fechamentoPonto.ts):
 *   - "ativo" tem prioridade sobre "estabilidade" — se a pessoa está em
 *     mandato corrente, mostra CIPA ativo (não estabilidade).
 *   - hoje = YYYY-MM-DD em timezone Brasília.
 */
import { sql, and, eq, inArray, isNull } from "drizzle-orm";
import { cipaMembers, cipaElections } from "../../drizzle/schema";

/**
 * Rev. 2478.1 — Resolve uma lista de companyIds aceitando tanto o input
 * "single-company" (`{ companyId }`) quanto o input "multi-empresa modo
 * construtoras" (`{ companyId, companyIds?: number[] }`). Quando
 * `companyIds` está presente, ele tem prioridade — alinhado com o
 * comportamento de `companyFilter` em `server/companyHelper.ts`.
 */
function resolveCompanyScope(
  scope: number | number[] | { companyId: number; companyIds?: number[] }
): number[] {
  if (typeof scope === "number") return [scope];
  if (Array.isArray(scope)) return scope.filter((x) => Number.isFinite(x));
  if (scope && typeof scope === "object") {
    if (Array.isArray(scope.companyIds) && scope.companyIds.length > 0) {
      return scope.companyIds.filter((x) => Number.isFinite(x));
    }
    return [scope.companyId];
  }
  return [];
}

export type CipaStatus = {
  ativo: boolean;
  estabilidade: boolean;
  fim: string | null;
  cargo: string | null;
  representacao: string | null;
};

function hojeBrasiliaStr(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export async function getCipaStatusByEmployeeIds(
  db: any,
  companyScope:
    | number
    | number[]
    | { companyId: number; companyIds?: number[] },
  employeeIds: number[]
): Promise<Map<number, CipaStatus>> {
  const out = new Map<number, CipaStatus>();
  if (!employeeIds || employeeIds.length === 0) return out;

  const ids = Array.from(new Set(employeeIds.filter((x) => Number.isFinite(x))));
  if (ids.length === 0) return out;

  const companyIds = resolveCompanyScope(companyScope);
  if (companyIds.length === 0) return out;

  const hoje = hojeBrasiliaStr();

  try {
    const rows = await db
      .select({
        employeeId: cipaMembers.employeeId,
        cargoCipa: cipaMembers.cargoCipa,
        representacao: cipaMembers.representacao,
        statusMembro: cipaMembers.statusMembro,
        fimEstabilidade: cipaMembers.fimEstabilidade,
        mandatoInicio: cipaElections.mandatoInicio,
        mandatoFim: cipaElections.mandatoFim,
      })
      .from(cipaMembers)
      .innerJoin(cipaElections, eq(cipaMembers.electionId, cipaElections.id))
      .where(
        and(
          inArray(cipaMembers.companyId, companyIds),
          inArray(cipaMembers.employeeId, ids)
        )
      );

    type Row = {
      employeeId: number;
      cargoCipa: string | null;
      representacao: string | null;
      statusMembro: string | null;
      fimEstabilidade: string | null;
      mandatoInicio: string | null;
      mandatoFim: string | null;
    };

    const byEmp = new Map<number, Row[]>();
    for (const r of rows as Row[]) {
      const arr = byEmp.get(r.employeeId) || [];
      arr.push(r);
      byEmp.set(r.employeeId, arr);
    }

    for (const [empId, group] of byEmp) {
      const ativoRow = group.find(
        (r) =>
          r.statusMembro === "Ativo" &&
          !!r.mandatoFim &&
          String(r.mandatoFim).slice(0, 10) >= hoje &&
          (!r.mandatoInicio || String(r.mandatoInicio).slice(0, 10) <= hoje)
      );
      if (ativoRow) {
        out.set(empId, {
          ativo: true,
          estabilidade: false,
          fim:
            ativoRow.fimEstabilidade != null
              ? String(ativoRow.fimEstabilidade).slice(0, 10)
              : null,
          cargo: ativoRow.cargoCipa,
          representacao: ativoRow.representacao,
        });
        continue;
      }

      // Estabilidade pós-mandato: só representação "Empregados",
      // fim de estabilidade ainda vigente.
      const estabRows = group.filter(
        (r) =>
          r.representacao === "Empregados" &&
          !!r.fimEstabilidade &&
          String(r.fimEstabilidade).slice(0, 10) >= hoje
      );
      if (estabRows.length > 0) {
        estabRows.sort((a, b) =>
          String(b.fimEstabilidade).localeCompare(String(a.fimEstabilidade))
        );
        const best = estabRows[0];
        out.set(empId, {
          ativo: false,
          estabilidade: true,
          fim: String(best.fimEstabilidade).slice(0, 10),
          cargo: best.cargoCipa,
          representacao: best.representacao,
        });
      }
    }
  } catch (e) {
    console.error(
      "[cipaStatus] falha ao buscar status CIPA (assumindo vazio):",
      (e as any)?.message ?? e
    );
  }

  return out;
}

/**
 * Helper conveniente para projetar 3 campos flat num row qualquer:
 *   `{ cipaAtivo, cipaEstabilidade, cipaFimEstabilidade, cipaCargo }`.
 *
 * Use junto com `getCipaStatusByEmployeeIds` para enriquecer arrays de saída
 * de routers que devolvem listas de colaboradores. Quando o employeeId não
 * tem entrada na CIPA, retorna 4 nulls/false — render no front fica trivial.
 */
export function projectCipaFields(
  map: Map<number, CipaStatus>,
  employeeId: number
): {
  cipaAtivo: boolean;
  cipaEstabilidade: boolean;
  cipaFimEstabilidade: string | null;
  cipaCargo: string | null;
} {
  const s = map.get(employeeId);
  return {
    cipaAtivo: !!s?.ativo,
    cipaEstabilidade: !!s?.estabilidade,
    cipaFimEstabilidade: s?.fim ?? null,
    cipaCargo: s?.cargo ?? null,
  };
}
