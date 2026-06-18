// ════════════════════════════════════════════════════════════════════════════
// Rev. 3288 — Helper PURO compartilhado da curva "% Previsto" (Caminho B).
//
// Replica FIELMENTE o hook `previstoCurva`/`raizAt` do módulo interno
// (client/src/pages/planejamento/PlanejamentoDetalhe.tsx) para que o Portal do
// Cliente leia o "% Previsto" da MESMA fonte única que o engenheiro vê:
//   • `previsto_semanas_json`  → snapshot do motor MSP (raiz = rollup por duração)
//   • `previsto_literal_json`  → override LITERAL (Texto10) por semana já enviada
//
// REGRA DE OURO (replit.md): o Portal só REPLICA o snapshot do MS Project, NUNCA
// recalcula. Mantém a mesma lógica de `idxAt` (maior cutoff <= alvo), `valAt`
// (antes do 1º cutoff → 0%) e do override literal por semana.
// ════════════════════════════════════════════════════════════════════════════

export interface PrevistoCurva {
  semanas: string[];
  raiz: number[];
  revisaoId: number | null;
  /** "% Previsto" acumulado na data-alvo (cutoff/Quinta). null = sem dado. */
  raizAt: (alvo: string) => number | null;
  /** "% Previsto" por atividade-folha na data-alvo. null = sem dado. */
  ativAt: (id: number | string, alvo: string) => number | null;
}

/**
 * Constrói o leitor da curva "% Previsto" a partir dos JSONs persistidos.
 * Retorna `null` quando o snapshot está ausente/malformado OU pertence a uma
 * revisão diferente da ativa (mesma guarda do hook do módulo) — nesse caso o
 * chamador deve cair no seu fallback.
 */
export function parsePrevistoCurva(
  rawSemanasJson: unknown,
  rawLiteralJson: unknown,
  revisaoAtivaId?: number | null,
): PrevistoCurva | null {
  if (!rawSemanasJson) return null;
  let snap: any;
  try {
    snap = typeof rawSemanasJson === "string" ? JSON.parse(rawSemanasJson) : rawSemanasJson;
  } catch {
    return null;
  }
  const semanas: string[] = Array.isArray(snap?.semanas) ? snap.semanas : [];
  const raiz: number[] = Array.isArray(snap?.raiz) ? snap.raiz : [];
  if (semanas.length === 0 || raiz.length === 0) return null;

  // Guarda de revisão: a curva é específica de UMA revisão. Quando a coluna
  // guarda a curva de outra revisão, descartamos (cai no fallback uniforme).
  const revId = snap?.revisaoId ?? null;
  if (revId != null && revisaoAtivaId != null && revId !== revisaoAtivaId) return null;

  const porAtividadeId: Record<string, number[]> = snap?.porAtividadeId ?? {};

  // Índice do degrau acumulado: maior cutoff <= alvo. Antes do 1º cutoff = -1.
  const idxAt = (alvo: string): number => {
    if (!alvo || alvo < semanas[0]) return -1;
    let idx = -1;
    for (let i = 0; i < semanas.length; i++) {
      if (semanas[i] <= alvo) idx = i;
      else break;
    }
    return idx;
  };
  const valAt = (arr: number[] | undefined, alvo: string): number | null => {
    if (!arr) return null;
    const i = idxAt(alvo);
    if (i < 0) return alvo && alvo < semanas[0] ? 0 : null; // antes do início → 0%
    return arr[i] ?? null;
  };

  // Override "% Previsto" LITERAL por semana (Texto10 capturado em cada upload).
  // Para as semanas JÁ enviadas, o número que o MSP já calculou VENCE o motor.
  let literalMap: Record<string, number> | null = null;
  try {
    if (rawLiteralJson) {
      const lit = typeof rawLiteralJson === "string" ? JSON.parse(rawLiteralJson) : rawLiteralJson;
      const litRev = lit?.revisaoId ?? null;
      const revOk = revisaoAtivaId == null ? true : litRev === revisaoAtivaId;
      if (revOk && lit?.valores && typeof lit.valores === "object") literalMap = lit.valores;
    }
  } catch {
    literalMap = null;
  }

  const raizAt = (alvo: string): number | null => {
    if (literalMap) {
      const i = idxAt(alvo);
      if (i >= 0) {
        const litv = literalMap[semanas[i]];
        if (typeof litv === "number" && Number.isFinite(litv)) return litv;
      }
    }
    return valAt(raiz, alvo);
  };

  return {
    semanas,
    raiz,
    revisaoId: revId,
    raizAt,
    ativAt: (id: number | string, alvo: string) => valAt(porAtividadeId[String(id)], alvo),
  };
}
