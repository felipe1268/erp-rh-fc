/**
 * Rev. 1820 — Recálculo de pesos financeiros (FONTE ÚNICA, EVM clássico)
 *
 * Padrão alinhado a:
 *   - PMI EVM Practice Standard §3.2 (peso = BAC do pacote / BAC do projeto)
 *   - ANSI/EIA-748 §2.b (peso definido na folha = work package)
 *   - Mattos §7.4 / Vargas §10.3 (proporcional ao custo orçado)
 *
 * Item 4 (corrigido nesta revisão): RATEIO por duração quando MÚLTIPLAS folhas
 * compartilham a mesma EAP. Antes a procedure replicava o peso integral em cada
 * folha → soma estourava 100%. Agora rateia proporcional a `duracaoDias` (fallback:
 * rateio uniforme entre as folhas da mesma EAP).
 *
 * Item 10: helper invocável on-demand (botão) e AUTOMATICAMENTE em:
 *   - planejamento.salvarAtividades (após import MS Project / save manual)
 *   - orcamento.importar (após criar itens da planilha)
 *   - orcamento.reimportar (após substituir itens)
 */
import { eq, and } from "drizzle-orm";
import {
  planejamentoProjetos,
  planejamentoRevisoes,
  planejamentoAtividades,
  orcamentoItens,
} from "../../drizzle/schema";
// Rev. 1821 — Normalização canônica do EAP (sem zero à esquerda em cada
// segmento). Aplicada SÓ na chave de comparação; o `eap_codigo` literal
// (vindo do Excel/MSP) permanece intacto no banco.
import { eapCanonico } from "./normalizarEap";

export type RecalcularPesosResult = {
  ok: boolean;
  msg?: string;
  metodo?: "orcamento" | "duracao";
  totalAtividades?: number;
  vinculados?: number;
  semVinculo?: number;
};

/**
 * Recalcula pesos financeiros de UMA revisão específica.
 * NUNCA lança — sempre devolve {ok:false} em caso de erro (defensivo: roda
 * dentro de imports/saves longos onde uma falha aqui não pode quebrar tudo).
 */
export async function recalcularPesosCore(
  db: any,
  projetoId: number,
  revisaoId: number,
): Promise<RecalcularPesosResult> {
  try {
    const [proj] = await db.select({
      orcamentoId: planejamentoProjetos.orcamentoId,
    }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, projetoId)).limit(1);
    if (!proj) return { ok: false, msg: "Projeto não encontrado" };

    const [rev] = await db.select({ id: planejamentoRevisoes.id })
      .from(planejamentoRevisoes)
      .where(and(
        eq(planejamentoRevisoes.id, revisaoId),
        eq(planejamentoRevisoes.projetoId, projetoId),
      ))
      .limit(1);
    if (!rev) return { ok: false, msg: "Revisão não pertence ao projeto" };

    const ativs = await db.select({
      id: planejamentoAtividades.id,
      eapCodigo: planejamentoAtividades.eapCodigo,
      isGrupo: planejamentoAtividades.isGrupo,
      isMarco: planejamentoAtividades.isMarco,
      disabled: planejamentoAtividades.disabled,
      duracaoDias: planejamentoAtividades.duracaoDias,
    }).from(planejamentoAtividades).where(eq(planejamentoAtividades.revisaoId, revisaoId));

    if (ativs.length === 0) return { ok: false, msg: "Nenhuma atividade encontrada" };

    const folhas = ativs.filter((a: any) => !a.isGrupo && !a.isMarco && !a.disabled);
    let metodo: "orcamento" | "duracao" = "duracao";
    let vinculados = 0;
    let semVinculo = 0;
    const updates: { id: number; peso: string }[] = [];

    if (proj.orcamentoId) {
      const eapItens = await db.select({
        eapCodigo: orcamentoItens.eapCodigo,
        custoTotal: orcamentoItens.custoTotal,
      }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, proj.orcamentoId));

      if (eapItens.length > 0) {
        // Soma custoTotal por EAP (orçamento) — chave NORMALIZADA (Rev. 1821).
        // Antes a comparação era literal: "02.16.02.01" (orçamento) ≠ "2.16.2.1"
        // (cronograma) → match falhava → atividade ficava sem peso → "Sem meta"
        // em massa em obras como HOTEL DO PAPA. Agora ambos os lados normalizam
        // pra forma canônica antes de comparar (sem persistir nada no banco).
        const custoMap = new Map<string, number>();
        for (const it of eapItens) {
          const code = eapCanonico(it.eapCodigo);
          if (!code) continue;
          custoMap.set(code, (custoMap.get(code) ?? 0) + (parseFloat(it.custoTotal ?? "0") || 0));
        }

        // Rev. 1821 (fix code-review #3) — `totalCusto` deve somar cada EAP
        // ÚNICA presente nas folhas, não 1× POR FOLHA. Quando N folhas
        // compartilham a mesma EAP (caso explorado no rateio item 4 da
        // Rev. 1820), somar por folha inflava o denominador e drenava o
        // pesoEapPct — Σ pesos << 100%. Agora: set de EAPs canônicas com
        // folha vinculada → soma cada custo apenas 1×.
        const eapsComFolha = new Set<string>();
        for (const a of folhas) {
          const k = eapCanonico(a.eapCodigo);
          if (k && custoMap.has(k)) eapsComFolha.add(k);
        }
        let totalCusto = 0;
        for (const k of eapsComFolha) totalCusto += custoMap.get(k) ?? 0;

        vinculados = folhas.filter((a: any) => custoMap.has(eapCanonico(a.eapCodigo))).length;
        semVinculo = folhas.length - vinculados;

        if (totalCusto > 0) {
          metodo = "orcamento";

          // ── ITEM 4: RATEIO POR DURAÇÃO ENTRE FOLHAS DA MESMA EAP ──────────
          // Soma duração das folhas POR EAP (para ratear o custo da EAP entre elas).
          // Rev. 1821: chave normalizada (eapCanonico) — folhas "02.16.02.01" e
          // "2.16.2.1" agora são tratadas como a MESMA EAP (são, na verdade).
          const durByEap = new Map<string, number>();
          const countByEap = new Map<string, number>();
          for (const a of folhas) {
            const eap = eapCanonico(a.eapCodigo);
            if (!eap) continue;
            const dur = Number.isFinite(a.duracaoDias) ? Math.max(0, Number(a.duracaoDias)) : 0;
            durByEap.set(eap, (durByEap.get(eap) ?? 0) + dur);
            countByEap.set(eap, (countByEap.get(eap) ?? 0) + 1);
          }

          for (const a of ativs) {
            if (a.isGrupo || a.isMarco || a.disabled) {
              updates.push({ id: a.id, peso: "0" });
              continue;
            }
            const eap = eapCanonico(a.eapCodigo);
            const custoEap = custoMap.get(eap) ?? 0;
            if (custoEap <= 0 || !eap) {
              updates.push({ id: a.id, peso: "0" });
              continue;
            }
            // Peso da EAP no projeto (em %)
            const pesoEapPct = (custoEap / totalCusto) * 100;
            // Fração da folha dentro da EAP (rateio por duração; fallback uniforme)
            const totalDurEap = durByEap.get(eap) ?? 0;
            const totalFolhasEap = countByEap.get(eap) ?? 1;
            let fracao: number;
            if (totalDurEap > 0) {
              const dur = Number.isFinite(a.duracaoDias) ? Math.max(0, Number(a.duracaoDias)) : 0;
              fracao = dur / totalDurEap;
            } else {
              fracao = 1 / totalFolhasEap;
            }
            const peso = pesoEapPct * fracao;
            updates.push({ id: a.id, peso: String(+peso.toFixed(4)) });
          }
        }
      }
    }

    // Fallback: sem orçamento → peso por duração no projeto inteiro.
    if (updates.length === 0) {
      const totalDias = folhas.reduce((s: number, a: any) => {
        const d = Number.isFinite(a.duracaoDias) ? Math.max(0, Number(a.duracaoDias)) : 0;
        return s + d;
      }, 0);
      if (totalDias === 0) return { ok: false, msg: "Sem duração nas atividades para calcular pesos" };
      for (const a of ativs) {
        if (a.isGrupo || a.isMarco || a.disabled) {
          updates.push({ id: a.id, peso: "0" });
        } else {
          const dur = Number.isFinite(a.duracaoDias) ? Math.max(0, Number(a.duracaoDias)) : 0;
          updates.push({ id: a.id, peso: String(+((dur / totalDias) * 100).toFixed(4)) });
        }
      }
    }

    for (const u of updates) {
      await db.update(planejamentoAtividades)
        .set({ pesoFinanceiro: u.peso })
        .where(eq(planejamentoAtividades.id, u.id));
    }

    return { ok: true, metodo, totalAtividades: folhas.length, vinculados, semVinculo };
  } catch (e: any) {
    console.error("[recalcularPesosCore] falha", e?.message ?? e);
    return { ok: false, msg: String(e?.message ?? e) };
  }
}

/**
 * Recalcula pesos de TODOS os planejamentos vinculados a um orçamento.
 * Usado após import/reimport do orçamento (Item 10 — automação).
 * Para cada projeto, recalcula APENAS a revisão de maior número (a mais recente)
 * — revisões anteriores ficam intactas (preserva histórico de baseline).
 */
export async function recalcularPesosByOrcamento(
  db: any,
  orcamentoId: number,
): Promise<{ projetosAfetados: number; revisoesRecalculadas: number }> {
  try {
    const projs = await db.select({ id: planejamentoProjetos.id })
      .from(planejamentoProjetos)
      .where(eq(planejamentoProjetos.orcamentoId, orcamentoId));

    let revisoesRecalculadas = 0;
    for (const p of projs) {
      const revs = await db.select({
        id: planejamentoRevisoes.id,
        numero: planejamentoRevisoes.numero,
      }).from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, p.id));
      if (revs.length === 0) continue;
      // Maior número = revisão mais recente
      const ultima = revs.reduce((acc: any, r: any) =>
        (acc == null || (r.numero ?? 0) > (acc.numero ?? 0)) ? r : acc, null);
      if (!ultima) continue;
      const r = await recalcularPesosCore(db, p.id, ultima.id);
      if (r.ok) revisoesRecalculadas++;
    }
    return { projetosAfetados: projs.length, revisoesRecalculadas };
  } catch (e: any) {
    console.error("[recalcularPesosByOrcamento] falha", e?.message ?? e);
    return { projetosAfetados: 0, revisoesRecalculadas: 0 };
  }
}
