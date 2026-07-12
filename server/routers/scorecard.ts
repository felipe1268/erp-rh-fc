import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql, eq, and, isNull, desc } from "drizzle-orm";
import { accidents, orcamentos } from "../../drizzle/schema";

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
      aliquotaImpostos: z.number().min(0).max(100).default(0),
      pctCustosFixos: z.number().min(0).max(100).default(0),
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
          aliquota_impostos, pct_custos_fixos,
          criado_em, atualizado_em
        ) VALUES (
          ${input.companyId}, ${input.obraId}, ${input.bonusTipo}, ${input.bonusValor},
          ${input.pesoSeguranca}, ${input.pesoPlanejamento}, ${input.pesoCompras},
          ${input.pesoAlmox}, ${input.pesoQualidade},
          ${input.metaSpi}, ${input.metaCpi}, ${input.maxAcidentesGraves},
          ${input.maxEmergenciaisPct}, ${input.aliquotaImpostos}, ${input.pctCustosFixos},
          NOW(), NOW()
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
          aliquota_impostos      = EXCLUDED.aliquota_impostos,
          pct_custos_fixos       = EXCLUDED.pct_custos_fixos,
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

      // Drizzle ORM para orcamentos (colunas camelCase sem mapeamento explícito)
      // Pega o mais recente não-excluído
      const orcRow = await db
        .select({
          id:             orcamentos.id,
          codigo:         orcamentos.codigo,
          status:         orcamentos.status,
          totalVenda:     orcamentos.totalVenda,
          totalCusto:     orcamentos.totalCusto,
          valorNegociado: orcamentos.valorNegociado,
        })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, companyId), eq(orcamentos.obraId, obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.id))
        .limit(1)
        .catch(() => [] as any[]);

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
        custoCategoriaRows,
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
        safeExec(db.execute(sql`
          SELECT
            COALESCE(origem_modulo, 'financeiro') AS origem,
            COALESCE(conta_nome, 'Sem conta classificada') AS conta,
            SUM(COALESCE(valor_realizado, valor_previsto))::numeric AS total
          FROM financial_entries
          WHERE company_id = ${companyId} AND obra_id = ${obraId}
          AND natureza = 'despesa'
          AND status IN ('pago','pago_parcial','liquidado','baixado')
          GROUP BY COALESCE(origem_modulo, 'financeiro'), COALESCE(conta_nome, 'Sem conta classificada')
          ORDER BY total DESC
          LIMIT 20
        `)),
      ]);

      // Normalizar para o formato usado pelo resto da função
      const acidentes       = { rows: acidentesRows.map((a: any) => ({ gravidade: a.gravidade, dias_afastamento: a.diasAfastamento ?? 0, data_acidente: a.dataAcidente })) };
      const custoPorCategoria = custoCategoriaRows as any[];
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
        aliquota_impostos: 0,
        pct_custos_fixos: 0,
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
      const orc = (orcRow as any[])[0] ?? {};
      const orcUsouNegociado = !!(orc.valorNegociado && parseFloat(String(orc.valorNegociado)) > 0);
      const valorContrato  = parseFloat(String(orc.valorNegociado || orc.totalVenda || "0"));
      const custoPrevisto  = parseFloat(String(orc.totalCusto ?? "0"));

      // Alíquotas configuradas no Scorecard
      const aliquotaImpostos = parseFloat(String(config.aliquota_impostos ?? "0"));
      const pctCustosFixos   = parseFloat(String(config.pct_custos_fixos  ?? "0"));

      // PREVISTO — Lucro Bruto → deduz impostos e custos fixos → Lucro Líquido
      const lucroBrutoPrevisto    = valorContrato - custoPrevisto;
      const impostosPrevistos     = valorContrato * (aliquotaImpostos / 100);
      const custosFixosPrevistos  = valorContrato * (pctCustosFixos   / 100);
      const lucroLiquidoPrevisto  = lucroBrutoPrevisto - impostosPrevistos - custosFixosPrevistos;
      const margemPrevista = valorContrato > 0 ? (lucroLiquidoPrevisto / valorContrato) * 100 : 0;

      const receitaRealizada  = parseFloat(String((receitaReal.rows as any[])[0]?.total ?? "0"));
      const custoRealizado    = parseFloat(String((custoReal.rows as any[])[0]?.total ?? "0"));

      // REALIZADO — mesma estrutura, com custo real e mesmas alíquotas sobre o valor do contrato
      const baseRef = valorContrato > 0 ? valorContrato : receitaRealizada;
      const lucroBrutoRealizado   = baseRef - custoRealizado;
      const impostosRealizados    = baseRef * (aliquotaImpostos / 100);
      const custosFixosRealizados = baseRef * (pctCustosFixos   / 100);
      const lucroLiquidoRealizado = lucroBrutoRealizado - impostosRealizados - custosFixosRealizados;
      const margemRealizada = baseRef > 0 ? (lucroLiquidoRealizado / baseRef) * 100 : 0;

      // Aliases para compatibilidade com resto do código que usa "lucroRealizado"
      const lucroPrevisto  = lucroLiquidoPrevisto;
      const lucroRealizado = lucroLiquidoRealizado;

      // ── BÔNUS (calculado sobre o Lucro Líquido Realizado) ────────────────────
      const fatorBonus   = getBonusFator(scoreTotal);
      const bonusValor   = parseFloat(String(config.bonus_valor ?? "5"));
      const bonusTipo    = String(config.bonus_tipo ?? "percentual_lucro");
      let bonusMaximo = 0;
      if (bonusTipo === "percentual_lucro") {
        bonusMaximo = Math.max(0, lucroLiquidoRealizado) * (bonusValor / 100);
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
          orcamentoInfo: orc.id ? {
            id:     orc.id,
            codigo: orc.codigo ?? "—",
            status: orc.status ?? "—",
            fonteContrato: orcUsouNegociado ? "valorNegociado" : "totalVenda",
          } : null,
          // Config de alíquotas
          aliquotaImpostos,
          pctCustosFixos,
          // PREVISTO
          valorContrato,
          custoPrevisto,
          lucroBrutoPrevisto,
          impostosPrevistos,
          custosFixosPrevistos,
          lucroLiquidoPrevisto,
          margemPrevista,
          // REALIZADO
          receitaRealizada,
          custoRealizado,
          lucroBrutoRealizado,
          impostosRealizados,
          custosFixosRealizados,
          lucroLiquidoRealizado,
          margemRealizada,
          custoPorCategoria: custoPorCategoria.map((r: any) => ({
            origem: String(r.origem ?? "financeiro"),
            conta:  String(r.conta  ?? "Sem conta"),
            total:  parseFloat(String(r.total ?? "0")),
          })),
          // aliases (usados nos alias-dependentes: lucroRealizado, lucroPrevisto)
          lucroPrevisto,
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

  getAnalise: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const safe = async (label: string, fn: () => Promise<any[]>) => {
        try { return await fn(); } catch (e: any) {
          console.warn(`[Scorecard.getAnalise] ${label}:`, e?.message);
          return [];
        }
      };

      const [curvaMat, recorrencia, mensal, ferramentasAlmox, ocsSemAlmox, locacoes] = await Promise.all([
        // ── 1. CURVA ABC DE MATERIAIS ────────────────────────────────────────
        safe("curvaABC", async () => {
          const r = await db.execute(sql`
            WITH totais AS (
              SELECT
                TRIM(coi.descricao)          AS item,
                SUM(coi.total)               AS total_valor,
                SUM(coi.quantidade)          AS total_qtd,
                COUNT(DISTINCT co.id)        AS num_ocs,
                MIN(co.created_at)           AS primeira_compra,
                MAX(co.created_at)           AS ultima_compra
              FROM compras_ordens co
              JOIN compras_ordens_itens coi ON coi.ordem_id = co.id
              WHERE co.obra_id    = ${input.obraId}
                AND co.company_id = ${input.companyId}
                AND co.status NOT IN ('cancelado')
              GROUP BY TRIM(coi.descricao)
            ),
            soma AS (SELECT SUM(total_valor) AS total_geral FROM totais),
            ranked AS (
              SELECT t.*, s.total_geral,
                SUM(t.total_valor) OVER (ORDER BY t.total_valor DESC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum_valor
              FROM totais t, soma s
            )
            SELECT
              item, total_valor, total_qtd, num_ocs, primeira_compra, ultima_compra,
              total_geral,
              ROUND((total_valor / NULLIF(total_geral, 0) * 100)::numeric, 2) AS pct,
              ROUND((acum_valor  / NULLIF(total_geral, 0) * 100)::numeric, 2) AS pct_acum,
              CASE
                WHEN (acum_valor - total_valor) / NULLIF(total_geral, 0) < 0.80 THEN 'A'
                WHEN (acum_valor - total_valor) / NULLIF(total_geral, 0) < 0.95 THEN 'B'
                ELSE 'C'
              END AS classe_abc
            FROM ranked
            ORDER BY total_valor DESC
            LIMIT 40
          `);
          return r.rows as any[];
        }),

        // ── 2. ALERTAS DE RECORRÊNCIA ────────────────────────────────────────
        safe("recorrencia", async () => {
          const r = await db.execute(sql`
            SELECT
              TRIM(coi.descricao) AS item,
              TO_CHAR(DATE_TRUNC('month', co.created_at), 'MM/YYYY') AS mes,
              DATE_TRUNC('month', co.created_at)                     AS mes_sort,
              COUNT(DISTINCT co.id)                                  AS num_ocs,
              SUM(coi.total)                                         AS total_mes
            FROM compras_ordens co
            JOIN compras_ordens_itens coi ON coi.ordem_id = co.id
            WHERE co.obra_id    = ${input.obraId}
              AND co.company_id = ${input.companyId}
              AND co.status NOT IN ('cancelado')
            GROUP BY TRIM(coi.descricao), DATE_TRUNC('month', co.created_at)
            HAVING COUNT(DISTINCT co.id) >= 3
            ORDER BY num_ocs DESC, total_mes DESC
            LIMIT 15
          `);
          return r.rows as any[];
        }),

        // ── 3. GASTOS MENSAIS DE COMPRAS ─────────────────────────────────────
        safe("mensal", async () => {
          const r = await db.execute(sql`
            SELECT
              TO_CHAR(DATE_TRUNC('month', co.created_at), 'MM/YYYY') AS mes,
              DATE_TRUNC('month', co.created_at)                     AS mes_sort,
              SUM(co.total)                                          AS total_compras,
              COUNT(*)                                               AS num_ocs,
              COUNT(DISTINCT co.fornecedor_id)                       AS num_fornecedores
            FROM compras_ordens co
            WHERE co.obra_id    = ${input.obraId}
              AND co.company_id = ${input.companyId}
              AND co.status NOT IN ('cancelado')
            GROUP BY DATE_TRUNC('month', co.created_at)
            ORDER BY mes_sort
          `);
          return r.rows as any[];
        }),

        // ── 4. FERRAMENTAS NO ALMOX ───────────────────────────────────────────
        safe("ferramentasAlmox", async () => {
          const r = await db.execute(sql`
            SELECT
              ai.id, ai.nome, ai.categoria, ai.quantidade_atual, ai.valor_unitario,
              ai.equipamento_vinculado_tipo, ai.equipamento_vinculado_id,
              ai.criado_em,
              COALESCE(emp.cnt, 0)    AS em_uso_cnt,
              COALESCE(emp.pessoas,'') AS em_uso_pessoas,
              COALESCE(dev.total_dev, 0) AS total_devolvidos,
              -- Alerta: comprado mas nunca deu entrada no almox (qtd=0 e nenhum empréstimo)
              CASE WHEN ai.quantidade_atual <= 0 AND COALESCE(emp.cnt, 0) = 0
                        AND COALESCE(dev.total_dev, 0) = 0 THEN true ELSE false
              END AS suspeita_desvio
            FROM almoxarifado_itens ai
            LEFT JOIN (
              SELECT item_id,
                COUNT(*)                                         AS cnt,
                STRING_AGG(DISTINCT funcionario_nome, ', ')     AS pessoas
              FROM warehouse_loans
              WHERE obra_id = ${input.obraId}
                AND status  = 'emprestado'
              GROUP BY item_id
            ) emp ON emp.item_id = ai.id
            LEFT JOIN (
              SELECT item_id, COUNT(*) AS total_dev
              FROM warehouse_loans
              WHERE obra_id = ${input.obraId}
                AND status  = 'devolvido'
              GROUP BY item_id
            ) dev ON dev.item_id = ai.id
            WHERE ai.obra_id    = ${input.obraId}
              AND ai.company_id = ${input.companyId}
              AND ai.ativo      = true
              AND (
                ai.categoria ILIKE '%ferramenta%'
                OR ai.categoria ILIKE '%equipamento%'
                OR ai.categoria ILIKE '%EPI%'
                OR ai.equipamento_vinculado_tipo IS NOT NULL
              )
            ORDER BY ai.nome
          `);
          return r.rows as any[];
        }),

        // ── 5. OCs ENTREGUES SEM ENTRADA NO ALMOX (possível desvio) ──────────
        safe("ocsSemAlmox", async () => {
          const r = await db.execute(sql`
            SELECT
              co.id, co.numero_oc, co.created_at, co.fornecedor_nome, co.total,
              COUNT(DISTINCT coi.id) AS num_itens
            FROM compras_ordens co
            JOIN compras_ordens_itens coi ON coi.ordem_id = co.id
            WHERE co.obra_id    = ${input.obraId}
              AND co.company_id = ${input.companyId}
              AND co.status IN ('entregue', 'entregue_parcial')
              AND co.is_locacao = false
              AND NOT EXISTS (
                SELECT 1 FROM almoxarifado_movimentacoes am
                WHERE am.obra_id       = ${input.obraId}
                  AND am.tipo          = 'entrada'
                  AND am.estornada_em  IS NULL
                  AND am.motivo        ILIKE '%' || co.numero_oc || '%'
              )
            GROUP BY co.id
            ORDER BY co.created_at DESC
            LIMIT 20
          `);
          return r.rows as any[];
        }),

        // ── 6. EQUIPAMENTOS LOCADOS ───────────────────────────────────────────
        safe("locacoes", async () => {
          const r = await db.execute(sql`
            SELECT
              el.id, el.descricao, el.categoria, el.status,
              el.data_inicio, el.data_fim_prevista, el.data_fim_real,
              el.valor_mensal, el.valor_diario,
              el.funcionario_responsavel_nome,
              el.numero_contrato_fornecedor,
              el.fornecedor_nome,
              CASE
                WHEN el.data_fim_real IS NOT NULL
                THEN (el.data_fim_real::date - el.data_inicio::date)
                ELSE (CURRENT_DATE  - el.data_inicio::date)
              END AS dias_locado,
              CASE
                WHEN el.valor_mensal IS NOT NULL AND el.valor_mensal > 0
                THEN ROUND(
                  el.valor_mensal *
                  EXTRACT(days FROM (
                    COALESCE(el.data_fim_real::date, CURRENT_DATE) - el.data_inicio::date
                  )) / 30.0, 2)
                ELSE NULL
              END AS custo_estimado
            FROM equipamentos_locados el
            WHERE el.obra_id    = ${input.obraId}
              AND el.company_id = ${input.companyId}
            ORDER BY
              CASE el.status WHEN 'em_uso' THEN 0 WHEN 'atrasado' THEN 1 ELSE 2 END,
              el.data_inicio DESC
            LIMIT 60
          `);
          return r.rows as any[];
        }),
      ]);

      // Totais agregados
      const totalGastoCompras = curvaMat.reduce((s: number, r: any) => s + parseFloat(String(r.total_valor ?? 0)), 0);
      const totalLocacoes = locacoes.reduce((s: number, r: any) => s + parseFloat(String(r.custo_estimado ?? 0)), 0);
      const totalFerramentasEmUso = ferramentasAlmox.filter((f: any) => parseInt(String(f.em_uso_cnt)) > 0).length;
      const alertasDesvio = ocsSemAlmox.length;
      const alertasRecorrencia = recorrencia.length;

      return {
        curvaMat,
        recorrencia,
        mensal,
        ferramentasAlmox,
        ocsSemAlmox,
        locacoes,
        resumo: {
          totalGastoCompras,
          totalLocacoes,
          totalFerramentasEmUso,
          alertasDesvio,
          alertasRecorrencia,
          numItensAlmox: ferramentasAlmox.length,
          numLocacoesAtivas: locacoes.filter((l: any) => l.status === 'em_uso').length,
        },
      };
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
