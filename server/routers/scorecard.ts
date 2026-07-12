import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql, eq, and, isNull } from "drizzle-orm";
import { accidents } from "../../drizzle/schema";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function getBonusFator(score: number): number {
  if (score >= 90) return 1.0;
  if (score >= 75) return 0.8;
  if (score >= 60) return 0.5;
  if (score >= 40) return 0.2;
  return 0;
}

function spiToScore(spi: number): number {
  if (spi >= 1.0) return 100;
  if (spi >= 0.90) return 85;
  if (spi >= 0.75) return 65;
  if (spi >= 0.60) return 40;
  return 20;
}

export const scorecardRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const r = await db.execute(sql`
        SELECT * FROM obra_scorecard_config
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
        LIMIT 1
      `);
      return (r.rows[0] as any) ?? null;
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      bonusTipo: z.enum(["percentual_lucro", "valor_fixo"]).default("percentual_lucro"),
      bonusValor: z.number().min(0).max(100000),
      pesoSeguranca: z.number().int().min(0).max(100),
      pesoPlanejamento: z.number().int().min(0).max(100),
      pesoCompras: z.number().int().min(0).max(100),
      pesoAlmox: z.number().int().min(0).max(100),
      pesoQualidade: z.number().int().min(0).max(100),
      metaSpi: z.number().min(0).max(3),
      metaCpi: z.number().min(0).max(3),
      maxAcidentesGraves: z.number().int().min(0),
      maxEmergenciaisPct: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) {
        throw new Error("Apenas administradores podem configurar o scorecard.");
      }
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.execute(sql`
        INSERT INTO obra_scorecard_config (
          company_id, obra_id, bonus_tipo, bonus_valor,
          peso_seguranca, peso_planejamento, peso_compras, peso_almox, peso_qualidade,
          meta_spi, meta_cpi, max_acidentes_graves, max_emergenciais_pct,
          criado_em, atualizado_em
        ) VALUES (
          ${input.companyId}, ${input.obraId}, ${input.bonusTipo}, ${input.bonusValor},
          ${input.pesoSeguranca}, ${input.pesoPlanejamento}, ${input.pesoCompras},
          ${input.pesoAlmox}, ${input.pesoQualidade},
          ${input.metaSpi}, ${input.metaCpi}, ${input.maxAcidentesGraves},
          ${input.maxEmergenciaisPct}, NOW(), NOW()
        )
        ON CONFLICT (obra_id) DO UPDATE SET
          bonus_tipo             = EXCLUDED.bonus_tipo,
          bonus_valor            = EXCLUDED.bonus_valor,
          peso_seguranca         = EXCLUDED.peso_seguranca,
          peso_planejamento      = EXCLUDED.peso_planejamento,
          peso_compras           = EXCLUDED.peso_compras,
          peso_almox             = EXCLUDED.peso_almox,
          peso_qualidade         = EXCLUDED.peso_qualidade,
          meta_spi               = EXCLUDED.meta_spi,
          meta_cpi               = EXCLUDED.meta_cpi,
          max_acidentes_graves   = EXCLUDED.max_acidentes_graves,
          max_emergenciais_pct   = EXCLUDED.max_emergenciais_pct,
          atualizado_em          = NOW()
      `);
      return { ok: true };
    }),

  getScore: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const { companyId, obraId } = input;

      // Drizzle ORM para accidents (colunas camelCase sem mapeamento explícito)
      const acidentesRows = await db
        .select({
          gravidade:        accidents.gravidade,
          diasAfastamento:  accidents.diasAfastamento,
          dataAcidente:     accidents.dataAcidente,
        })
        .from(accidents)
        .where(and(eq(accidents.companyId, companyId), eq(accidents.obraId, obraId), isNull(accidents.deletedAt)))
        .catch(() => [] as any[]);

      // Sub-queries restantes com try/catch individualmente para resiliência
      const safeExec = async (q: Promise<any>) => {
        try { const r = await q; return r?.rows ?? []; }
        catch (e: any) { console.warn("[Scorecard] sub-query falhou:", e?.message ?? e); return []; }
      };

      const [
        ddsSessoesRows,
        warningsTerceirosRows,
        warningsPropsRows,
        refisRowsData,
        emergRowData,
        ferramentasPerdidasRows,
        retrabalhosRows,
        avaliacoesRows,
        receitaRealRows,
        custoRealRows,
        configRowsData,
      ] = await Promise.all([
        safeExec(db.execute(sql`
          SELECT id, data FROM dds_sessoes
          WHERE company_id = ${companyId} AND obra_id = ${obraId}
          AND status != 'cancelada' AND deleted_at IS NULL
        `)),
        safeExec(db.execute(sql`
          SELECT tipo_advertencia, data_ocorrencia FROM warnings_terceiros
          WHERE company_id = ${companyId} AND obra_id = ${obraId}
          AND deleted_at IS NULL
          ORDER BY data_ocorrencia DESC
        `)),
        safeExec(db.execute(sql`
          SELECT w.tipo_advertencia, w.data_ocorrencia
          FROM warnings w
          WHERE w.company_id = ${companyId}
          AND w.deleted_at IS NULL
          AND w.employee_id IN (
            SELECT employee_id FROM obra_funcionarios
            WHERE obra_id = ${obraId} AND company_id = ${companyId}
          )
          ORDER BY w.data_ocorrencia DESC
        `)),
        safeExec(db.execute(sql`
          SELECT r.spi, r.cpi, r.avanco_realizado, r.avanco_previsto, r.semana
          FROM planejamento_refis r
          JOIN planejamento_projetos p ON p.id = r.projeto_id
          WHERE p.company_id = ${companyId} AND p.obra_id = ${obraId}
          AND r.status = 'emitido'
          ORDER BY r.semana DESC
          LIMIT 5
        `)),
        safeExec(db.execute(sql`
          SELECT
            COUNT(co.id)::int AS total_emergenciais,
            (SELECT COUNT(*)::int FROM compras_ordens
             WHERE obra_id = ${obraId} AND company_id = ${companyId}
             AND status NOT IN ('cancelada')) AS total_ocs
          FROM compras_ordens co
          JOIN purchase_requests pr ON pr.id = co.solicitacao_id
          WHERE co.obra_id = ${obraId} AND co.company_id = ${companyId}
          AND pr.emergencial = 1 AND co.status NOT IN ('cancelada')
        `)),
        safeExec(db.execute(sql`
          SELECT id, item_nome, funcionario_nome, data_emprestimo
          FROM warehouse_loans
          WHERE company_id = ${companyId} AND obra_id = ${obraId} AND status = 'perdido'
          ORDER BY data_emprestimo DESC
        `)),
        safeExec(db.execute(sql`
          SELECT id, data_ocorrencia, servico_afetado, custo_estimado, registrado_por_nome
          FROM obra_retrabalho
          WHERE company_id = ${companyId} AND obra_id = ${obraId} AND excluido_em IS NULL
          ORDER BY data_ocorrencia DESC
        `)),
        safeExec(db.execute(sql`
          SELECT nota_geral, nota_qualidade, nota_prazo, nota_gestor
          FROM cliente_avaliacoes
          WHERE company_id = ${companyId} AND obra_id = ${obraId}
          AND cancelled_at IS NULL
          ORDER BY id DESC LIMIT 10
        `)),
        safeExec(db.execute(sql`
          SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)), 0)::numeric AS total
          FROM financial_entries
          WHERE company_id = ${companyId} AND obra_id = ${obraId}
          AND natureza = 'receita' AND status IN ('pago','recebido','liquidado','baixado')
        `)),
        safeExec(db.execute(sql`
          SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)), 0)::numeric AS total
          FROM financial_entries
          WHERE company_id = ${companyId} AND obra_id = ${obraId}
          AND natureza = 'despesa' AND status IN ('pago','pago_parcial','liquidado','baixado')
        `)),
        safeExec(db.execute(sql`
          SELECT * FROM obra_scorecard_config
          WHERE company_id = ${companyId} AND obra_id = ${obraId} LIMIT 1
        `)),
      ]);

      // Normalizar para o formato usado pelo resto da função
      const acidentes       = { rows: acidentesRows.map((a: any) => ({ gravidade: a.gravidade, dias_afastamento: a.diasAfastamento ?? 0, data_acidente: a.dataAcidente })) };
      const ddsSessoes      = { rows: ddsSessoesRows };
      const warningsTerceiros = { rows: warningsTerceirosRows };
      const warningsProps   = { rows: warningsPropsRows };
      const refisRows       = { rows: refisRowsData };
      const emergRow        = { rows: emergRowData };
      const ferramentasPerdidas = { rows: ferramentasPerdidasRows };
      const retrabalhos     = { rows: retrabalhosRows };
      const avaliacoes      = { rows: avaliacoesRows };
      const receitaReal     = { rows: receitaRealRows };
      const custoReal       = { rows: custoRealRows };
      const configRows      = { rows: configRowsData };

      const config = (configRows.rows[0] as any) ?? {
        bonus_tipo: "percentual_lucro",
        bonus_valor: 5,
        peso_seguranca: 30,
        peso_planejamento: 25,
        peso_compras: 20,
        peso_almox: 15,
        peso_qualidade: 10,
        meta_spi: 0.90,
        meta_cpi: 0.90,
        max_acidentes_graves: 0,
        max_emergenciais_pct: 10,
      };

      const eventos: { tipo: string; descricao: string; pontos: number; data: string }[] = [];

      // ── SEGURANÇA ────────────────────────────────────────────────────────────
      let scoreSeguranca = 100;
      for (const a of (acidentes.rows as any[])) {
        const comAfastamento = parseInt(a.dias_afastamento) > 0 || (a.gravidade ?? "").includes("afastamento");
        const grave = ["Grave", "Gravíssimo", "Fatal"].includes(a.gravidade);
        if (a.gravidade === "Quase-acidente") {
          scoreSeguranca -= 2;
          eventos.push({ tipo: "seguranca", descricao: `Quase-acidente (${a.data_acidente})`, pontos: -2, data: a.data_acidente });
        } else if (grave || comAfastamento) {
          scoreSeguranca -= 10;
          eventos.push({ tipo: "seguranca", descricao: `Acidente grave/com afastamento (${a.data_acidente})`, pontos: -10, data: a.data_acidente });
        } else {
          scoreSeguranca -= 5;
          eventos.push({ tipo: "seguranca", descricao: `Acidente sem afastamento (${a.data_acidente})`, pontos: -5, data: a.data_acidente });
        }
      }
      for (const w of (warningsTerceiros.rows as any[])) {
        scoreSeguranca -= 3;
        eventos.push({ tipo: "seguranca", descricao: `Advertência (terceiros): ${w.tipo_advertencia} (${w.data_ocorrencia})`, pontos: -3, data: w.data_ocorrencia });
      }
      for (const w of (warningsProps.rows as any[])) {
        scoreSeguranca -= 3;
        eventos.push({ tipo: "seguranca", descricao: `Advertência: ${w.tipo_advertencia} (${w.data_ocorrencia})`, pontos: -3, data: w.data_ocorrencia });
      }
      const ddsCount = (ddsSessoes.rows as any[]).length;
      const ddsBonus = Math.min(ddsCount, 10);
      if (ddsBonus > 0) {
        scoreSeguranca = Math.min(100, scoreSeguranca + ddsBonus);
        eventos.push({ tipo: "seguranca", descricao: `DDS realizados: ${ddsCount} sessão(ões) (+${ddsBonus} pts)`, pontos: ddsBonus, data: (ddsSessoes.rows as any[])[0]?.data ?? "" });
      }
      scoreSeguranca = clamp(scoreSeguranca);

      // ── PLANEJAMENTO ─────────────────────────────────────────────────────────
      const lastRefis = (refisRows.rows as any[]);
      const lastRefi = lastRefis[0];
      const spiVal = lastRefi ? parseFloat(lastRefi.spi ?? "1") : null;
      const cpiVal = lastRefi ? parseFloat(lastRefi.cpi ?? "1") : null;
      const refisCount = lastRefis.length;
      const spiScore = spiVal !== null ? spiToScore(spiVal) : 100;
      const cpiScore = cpiVal !== null ? spiToScore(cpiVal) : 100;
      const refiPenalty = Math.min(refisCount * 2, 20);
      let scorePlanejamento = clamp(Math.round(spiScore * 0.5 + cpiScore * 0.3 + 20 - refiPenalty));
      if (lastRefi) {
        const spiDiff = spiScore - 100;
        const cpiDiff = cpiScore - 100;
        if (spiDiff < 0) eventos.push({ tipo: "planejamento", descricao: `SPI: ${spiVal!.toFixed(2)} (abaixo da meta)`, pontos: Math.round(spiDiff * 0.5), data: lastRefi.semana });
        if (cpiDiff < 0) eventos.push({ tipo: "planejamento", descricao: `CPI: ${cpiVal!.toFixed(2)} (abaixo da meta)`, pontos: Math.round(cpiDiff * 0.3), data: lastRefi.semana });
      }
      if (refisCount > 0) {
        eventos.push({ tipo: "planejamento", descricao: `${refisCount} REFI(s) emitido(s) na obra`, pontos: -refiPenalty, data: lastRefis[lastRefis.length - 1]?.semana ?? "" });
      }

      // ── COMPRAS ──────────────────────────────────────────────────────────────
      let scoreCompras = 100;
      const eRow = (emergRow.rows as any[])[0] ?? {};
      const totalEmerg = parseInt(eRow.total_emergenciais ?? "0");
      const totalOcs = parseInt(eRow.total_ocs ?? "0");
      const pctEmerg = totalOcs > 0 ? Math.round((totalEmerg / totalOcs) * 100) : 0;
      const emergPenalty = Math.min(totalEmerg * 5, 50);
      scoreCompras = clamp(scoreCompras - emergPenalty);
      if (totalEmerg > 0) {
        eventos.push({ tipo: "compras", descricao: `${totalEmerg} OC(s) emergencial(is) de ${totalOcs} (${pctEmerg}%)`, pontos: -emergPenalty, data: new Date().toISOString().slice(0, 10) });
      }

      // ── ALMOXARIFADO ─────────────────────────────────────────────────────────
      let scoreAlmox = 100;
      const perdidas = (ferramentasPerdidas.rows as any[]);
      const perdidasPenalty = Math.min(perdidas.length * 10, 50);
      scoreAlmox = clamp(scoreAlmox - perdidasPenalty);
      for (const p of perdidas) {
        eventos.push({ tipo: "almox", descricao: `Ferramenta perdida: ${p.item_nome} (${p.funcionario_nome})`, pontos: -10, data: p.data_emprestimo });
      }

      // ── QUALIDADE ────────────────────────────────────────────────────────────
      let scoreQualidade = 100;
      const retrabalhoRows = (retrabalhos.rows as any[]);
      const retrabalhoPenalty = Math.min(retrabalhoRows.length * 5, 40);
      scoreQualidade = clamp(scoreQualidade - retrabalhoPenalty);
      for (const r of retrabalhoRows) {
        eventos.push({ tipo: "qualidade", descricao: `Retrabalho: ${r.servico_afetado} (${r.data_ocorrencia})`, pontos: -5, data: r.data_ocorrencia });
      }
      const avalsRows = (avaliacoes.rows as any[]);
      let mediaAvaliacao: number | null = null;
      if (avalsRows.length > 0) {
        const somas = avalsRows.map((a: any) => {
          const ns = [a.nota_geral, a.nota_qualidade, a.nota_prazo, a.nota_gestor]
            .filter((n: any) => n != null)
            .map(Number);
          return ns.length > 0 ? ns.reduce((s: number, n: number) => s + n, 0) / ns.length : null;
        }).filter((v: any) => v !== null) as number[];
        if (somas.length > 0) {
          mediaAvaliacao = somas.reduce((s: number, n: number) => s + n, 0) / somas.length;
          const avalBonus = Math.round((mediaAvaliacao / 10) * 15);
          scoreQualidade = clamp(scoreQualidade + avalBonus);
        }
      }

      // ── TOTAL ────────────────────────────────────────────────────────────────
      const pesos = {
        seguranca:    parseInt(String(config.peso_seguranca ?? 30)) / 100,
        planejamento: parseInt(String(config.peso_planejamento ?? 25)) / 100,
        compras:      parseInt(String(config.peso_compras ?? 20)) / 100,
        almox:        parseInt(String(config.peso_almox ?? 15)) / 100,
        qualidade:    parseInt(String(config.peso_qualidade ?? 10)) / 100,
      };
      const scoreTotal = clamp(Math.round(
        scoreSeguranca    * pesos.seguranca +
        scorePlanejamento * pesos.planejamento +
        scoreCompras      * pesos.compras +
        scoreAlmox        * pesos.almox +
        scoreQualidade    * pesos.qualidade
      ));

      // ── FINANCEIRO ───────────────────────────────────────────────────────────
      const receitaRealizada  = parseFloat(String((receitaReal.rows as any[])[0]?.total ?? "0"));
      const custoRealizado    = parseFloat(String((custoReal.rows as any[])[0]?.total ?? "0"));
      const lucroRealizado    = receitaRealizada - custoRealizado;

      // ── BÔNUS ────────────────────────────────────────────────────────────────
      const fatorBonus   = getBonusFator(scoreTotal);
      const bonusValor   = parseFloat(String(config.bonus_valor ?? "5"));
      const bonusTipo    = String(config.bonus_tipo ?? "percentual_lucro");
      let bonusMaximo = 0;
      if (bonusTipo === "percentual_lucro") {
        bonusMaximo = Math.max(0, lucroRealizado) * (bonusValor / 100);
      } else {
        bonusMaximo = bonusValor;
      }
      const bonusProjetado = bonusMaximo * fatorBonus;

      eventos.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

      return {
        config,
        scores: {
          seguranca:    scoreSeguranca,
          planejamento: scorePlanejamento,
          compras:      scoreCompras,
          almox:        scoreAlmox,
          qualidade:    scoreQualidade,
          total:        scoreTotal,
        },
        detalhes: {
          ddsCount,
          acidentesCount:    (acidentes.rows as any[]).length,
          warningsCount:     (warningsTerceiros.rows as any[]).length + (warningsProps.rows as any[]).length,
          totalEmergenciais: totalEmerg,
          totalOcs,
          pctEmergencial:    pctEmerg,
          ferramentasPerdidas: perdidas.length,
          retrabalhos:       retrabalhoRows.length,
          spi:               spiVal,
          cpi:               cpiVal,
          refisCount,
          mediaAvaliacao,
        },
        financeiro: {
          receitaRealizada,
          custoRealizado,
          lucroRealizado,
        },
        bonus: {
          fatorBonus,
          bonusMaximo,
          bonusProjetado,
          bonusTipo,
          bonusValorConfig: bonusValor,
        },
        eventos,
      };
    }),

  retrabalhoList: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const r = await db.execute(sql`
        SELECT * FROM obra_retrabalho
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
        AND excluido_em IS NULL
        ORDER BY data_ocorrencia DESC
      `);
      return r.rows as any[];
    }),

  retrabalhoCreate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      dataOcorrencia: z.string(),
      servicoAfetado: z.string().min(1),
      causaRaiz: z.string().optional(),
      custoEstimado: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) {
        throw new Error("Apenas administradores podem registrar retrabalhos.");
      }
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.execute(sql`
        INSERT INTO obra_retrabalho
          (company_id, obra_id, data_ocorrencia, servico_afetado, causa_raiz, custo_estimado,
           registrado_por_id, registrado_por_nome)
        VALUES
          (${input.companyId}, ${input.obraId}, ${input.dataOcorrencia}::date,
           ${input.servicoAfetado}, ${input.causaRaiz ?? null},
           ${input.custoEstimado ?? null}, ${ctx.user.id ?? null}, ${ctx.user.name ?? null})
      `);
      return { ok: true };
    }),

  retrabalhoDelete: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "admin_master"].includes(ctx.user.role ?? "")) {
        throw new Error("Apenas administradores podem excluir retrabalhos.");
      }
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.execute(sql`
        UPDATE obra_retrabalho SET excluido_em = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  ferramentasList: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const r = await db.execute(sql`
        SELECT
          wl.id, wl.item_id, wl.item_nome, wl.quantidade, wl.status,
          wl.funcionario_nome, wl.funcionario_id,
          wl.data_emprestimo, wl.hora_emprestimo,
          wl.data_devolucao, wl.hora_devolucao,
          wl.observacoes, wl.almoxarife_nome,
          ai.categoria, ai.valor_unitario,
          co.numero_oc
        FROM warehouse_loans wl
        LEFT JOIN almoxarifado_itens ai ON ai.id = wl.item_id
        LEFT JOIN compras_ordens_itens coi ON coi.almox_item_id = wl.item_id
        LEFT JOIN compras_ordens co ON co.id = coi.ordem_id AND co.obra_id = ${input.obraId}
        WHERE wl.company_id = ${input.companyId} AND wl.obra_id = ${input.obraId}
        ORDER BY wl.data_emprestimo DESC, wl.id DESC
      `);
      return r.rows as any[];
    }),
});
