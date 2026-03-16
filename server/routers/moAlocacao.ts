import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  jobFunctions,
  folhaMoTransferencias,
  planejamentoCustosMo,
  folhaLancamentos,
  folhaItens,
  manualObraAssignments,
  planejamentoProjetos,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoRevisoes,
} from "../../drizzle/schema";

const n = (v: any) => parseFloat(v ?? "0") || 0;

export const moAlocacaoRouter = router({

  // ── LISTAR FUNÇÕES COM CATEGORIA MO ─────────────────────────────────

  listarCargoCategorias: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select({
        id: jobFunctions.id,
        cargo: jobFunctions.nome,
        categoria: jobFunctions.categoriaMO,
        cbo: jobFunctions.cbo,
      }).from(jobFunctions)
        .where(and(
          eq(jobFunctions.companyId, input.companyId),
          eq(jobFunctions.isActive, 1),
          isNull(jobFunctions.deletedAt),
        ))
        .orderBy(jobFunctions.nome);
    }),

  // ── SALVAR CATEGORIA MO DE UMA FUNÇÃO ───────────────────────────────

  salvarCargoCategoria: protectedProcedure
    .input(z.object({
      id: z.number(),
      categoria: z.enum(["direto", "indireta_obra", "escritorio_central"]).nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(jobFunctions)
        .set({ categoriaMO: input.categoria })
        .where(eq(jobFunctions.id, input.id));
      return { ok: true };
    }),

  // ── FECHAR FOLHA DO MÊS ─────────────────────────────────────────────

  fecharFolhaMes: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({ id: folhaLancamentos.id, status: folhaLancamentos.status })
        .from(folhaLancamentos)
        .where(and(
          eq(folhaLancamentos.companyId, input.companyId),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
        ));
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma folha encontrada para este mês." });
      }
      await db.update(folhaLancamentos)
        .set({ status: "fechado" })
        .where(and(
          eq(folhaLancamentos.companyId, input.companyId),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
        ));
      return { ok: true, count: rows.length };
    }),

  // ── VERIFICAR DISPONIBILIDADE DE TRANSFERÊNCIA ──────────────────────

  verificarTransferenciaMO: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const lancamentos = await db.select({
        id: folhaLancamentos.id,
        status: folhaLancamentos.status,
        totalLiquido: folhaLancamentos.totalLiquido,
      }).from(folhaLancamentos).where(and(
        eq(folhaLancamentos.companyId, input.companyId),
        eq(folhaLancamentos.mesReferencia, input.mesReferencia),
      ));

      const folhaFechada = lancamentos.some(l => l.status === "fechado");
      const totalFolha = lancamentos.reduce((s, l) => s + n(l.totalLiquido), 0);

      const transferencias = await db.select().from(folhaMoTransferencias).where(and(
        eq(folhaMoTransferencias.companyId, input.companyId),
        eq(folhaMoTransferencias.mesReferencia, input.mesReferencia),
      ));
      const jaTransferido = transferencias.length > 0;
      const ultimaTransferencia = transferencias[0] ?? null;

      const funcoesComCategoria = await db.select({ id: jobFunctions.id })
        .from(jobFunctions)
        .where(and(
          eq(jobFunctions.companyId, input.companyId),
          eq(jobFunctions.isActive, 1),
          isNull(jobFunctions.deletedAt),
          isNotNull(jobFunctions.categoriaMO),
        ));

      return {
        folhaFechada,
        totalFolha,
        jaTransferido,
        ultimaTransferencia,
        totalCargosConfigurados: funcoesComCategoria.length,
        lancamentos: lancamentos.map(l => ({ id: l.id, status: l.status, totalLiquido: l.totalLiquido })),
      };
    }),

  // ── EXECUTAR TRANSFERÊNCIA MO ───────────────────────────────────────

  executarTransferenciaMO: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      executadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Valida folha fechada
      const lancamentos = await db.select({
        id: folhaLancamentos.id,
        status: folhaLancamentos.status,
      }).from(folhaLancamentos).where(and(
        eq(folhaLancamentos.companyId, input.companyId),
        eq(folhaLancamentos.mesReferencia, input.mesReferencia),
        eq(folhaLancamentos.status, "fechado"),
      ));
      if (lancamentos.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A folha do mês ainda não foi fechada. Feche-a primeiro no módulo RH." });
      }

      // Verifica se já foi transferido
      const jaFeito = await db.select({ id: folhaMoTransferencias.id })
        .from(folhaMoTransferencias)
        .where(and(
          eq(folhaMoTransferencias.companyId, input.companyId),
          eq(folhaMoTransferencias.mesReferencia, input.mesReferencia),
        ));
      if (jaFeito.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Este mês já foi transferido. Para corrigir, desfaça a transferência primeiro." });
      }

      // Carrega categorias de MO de job_functions
      const funcoes = await db.select({
        nome: jobFunctions.nome,
        categoriaMO: jobFunctions.categoriaMO,
      }).from(jobFunctions).where(and(
        eq(jobFunctions.companyId, input.companyId),
        eq(jobFunctions.isActive, 1),
        isNull(jobFunctions.deletedAt),
      ));
      const catMap = new Map(funcoes.map(f => [f.nome.toLowerCase().trim(), f.categoriaMO]));

      // Carrega itens da folha
      const lancIds = lancamentos.map(l => l.id);
      const itens = await db.select().from(folhaItens)
        .where(inArray(folhaItens.folhaLancamentoId, lancIds));

      // Carrega vinculações obra-funcionário do mês
      const vinculos = await db.select().from(manualObraAssignments).where(and(
        eq(manualObraAssignments.companyId, input.companyId),
        eq(manualObraAssignments.mesReferencia, input.mesReferencia),
      ));
      const vinculoMap = new Map(vinculos.map(v => [v.employeeId, v.obraId]));

      // Carrega projetos ativos com obras
      const projetos = await db.select().from(planejamentoProjetos).where(
        eq(planejamentoProjetos.companyId, input.companyId),
      );
      const projetoByObraId = new Map(projetos.filter(p => p.obraId).map(p => [p.obraId!, p]));
      const totalContratoAtivo = projetos.reduce((s, p) => s + n(p.valorContrato), 0);

      // Classifica cada item da folha
      type BucketItem = { employeeId: number | null; funcao: string; liquido: number; categoria: string };
      const buckets: { direto: BucketItem[]; indireta: BucketItem[]; central: BucketItem[] } = {
        direto: [], indireta: [], central: [],
      };

      for (const it of itens) {
        const liquido = n(it.liquido);
        if (liquido <= 0) continue;
        const funcaoKey = (it.funcao || "").toLowerCase().trim();
        const cat = catMap.get(funcaoKey) ?? "direto";
        const obraId = it.employeeId ? vinculoMap.get(it.employeeId) : undefined;
        const item: BucketItem = { employeeId: it.employeeId, funcao: it.funcao || "", liquido, categoria: cat };
        // Sem vínculo de obra → rateio central automático, independente da função
        if (!obraId) {
          buckets.central.push(item);
        } else if (cat === "indireta_obra") {
          buckets.indireta.push(item);
        } else {
          buckets.direto.push(item);
        }
      }

      const totalDireto = buckets.direto.reduce((s, i) => s + i.liquido, 0);
      const totalIndireto = buckets.indireta.reduce((s, i) => s + i.liquido, 0);
      const totalCentral = buckets.central.reduce((s, i) => s + i.liquido, 0);

      const registros: (typeof planejamentoCustosMo.$inferInsert)[] = [];
      const detalheObras: Record<number, { totalDireto: number; totalIndireto: number; totalCentral: number }> = {};

      // ── CAMADA 1: Indireta Obra → 01.01 Equipe Técnica ─────────────
      for (const item of buckets.indireta) {
        if (!item.employeeId) continue;
        const obraId = vinculoMap.get(item.employeeId);
        if (!obraId) continue;
        const projeto = projetoByObraId.get(obraId);
        if (!projeto) continue;

        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, projeto.id))
          .orderBy(sql`${planejamentoRevisoes.id} DESC`)
          .limit(1);

        let atividadeId: number | undefined;
        if (rev) {
          const ativs = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo, nome: planejamentoAtividades.nome })
            .from(planejamentoAtividades)
            .where(eq(planejamentoAtividades.revisaoId, rev.id));
          const equipe = ativs.find(a =>
            a.eapCodigo === "01.01" ||
            (a.nome || "").toLowerCase().includes("equipe t") ||
            (a.nome || "").toLowerCase().includes("equipe tecnica") ||
            (a.nome || "").toLowerCase().includes("administração de obra")
          );
          atividadeId = equipe?.id;
        }

        detalheObras[projeto.id] = detalheObras[projeto.id] ?? { totalDireto: 0, totalIndireto: 0, totalCentral: 0 };
        detalheObras[projeto.id].totalIndireto += item.liquido;

        registros.push({
          projetoId: projeto.id,
          atividadeId: atividadeId ?? null,
          mesReferencia: input.mesReferencia,
          tipo: "indireta_01_01",
          custo: String(item.liquido.toFixed(2)),
          descricao: `MO Indireta — ${item.funcao}`,
          transferenciaId: null,
        });
      }

      // ── CAMADA 2: Escritório Central → CI-01 rateado por valorContrato ─
      if (totalCentral > 0 && totalContratoAtivo > 0) {
        for (const projeto of projetos) {
          const peso = n(projeto.valorContrato) / totalContratoAtivo;
          if (peso <= 0) continue;
          const custo = totalCentral * peso;

          detalheObras[projeto.id] = detalheObras[projeto.id] ?? { totalDireto: 0, totalIndireto: 0, totalCentral: 0 };
          detalheObras[projeto.id].totalCentral += custo;

          registros.push({
            projetoId: projeto.id,
            atividadeId: null,
            mesReferencia: input.mesReferencia,
            tipo: "ci01_central",
            custo: String(custo.toFixed(2)),
            descricao: `Rateio Adm. Central — ${(peso * 100).toFixed(1)}% do contrato`,
            transferenciaId: null,
          });
        }
      }

      // ── CAMADA 3: Direto → diluído nas atividades executadas no mês ─
      const custoDiretoByObra = new Map<number, number>();
      for (const item of buckets.direto) {
        if (!item.employeeId) continue;
        const obraId = vinculoMap.get(item.employeeId);
        if (!obraId) continue;
        custoDiretoByObra.set(obraId, (custoDiretoByObra.get(obraId) ?? 0) + item.liquido);
      }

      const [ano, mes] = input.mesReferencia.split("-").map(Number);
      const inicioMes = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
      const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

      for (const [obraId, custoDireto] of custoDiretoByObra) {
        const projeto = projetoByObraId.get(obraId);
        if (!projeto) continue;

        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, projeto.id))
          .orderBy(sql`${planejamentoRevisoes.id} DESC`)
          .limit(1);
        if (!rev) continue;

        const avancos = await db.select({
          atividadeId: planejamentoAvancos.atividadeId,
          percentualSemanal: planejamentoAvancos.percentualSemanal,
        }).from(planejamentoAvancos).where(and(
          eq(planejamentoAvancos.projetoId, projeto.id),
          eq(planejamentoAvancos.revisaoId, rev.id),
          sql`${planejamentoAvancos.semana} >= ${inicioMes}`,
          sql`${planejamentoAvancos.semana} <= ${fimMes}`,
        ));

        if (avancos.length === 0) continue;

        const avancoByAtiv = new Map<number, number>();
        for (const av of avancos) {
          if (n(av.percentualSemanal) > 0) {
            avancoByAtiv.set(av.atividadeId, (avancoByAtiv.get(av.atividadeId) ?? 0) + n(av.percentualSemanal));
          }
        }
        if (avancoByAtiv.size === 0) continue;

        const atividadeIds = Array.from(avancoByAtiv.keys());
        const atividades = await db.select({ id: planejamentoAtividades.id, pesoFinanceiro: planejamentoAtividades.pesoFinanceiro })
          .from(planejamentoAtividades)
          .where(inArray(planejamentoAtividades.id, atividadeIds));
        const pesoMap = new Map(atividades.map(a => [a.id, n(a.pesoFinanceiro)]));

        const pesosPonderados = new Map<number, number>();
        let somaTotal = 0;
        for (const [atId, avanco] of avancoByAtiv) {
          const peso = (pesoMap.get(atId) ?? 1) * avanco;
          pesosPonderados.set(atId, peso);
          somaTotal += peso;
        }
        if (somaTotal <= 0) continue;

        detalheObras[projeto.id] = detalheObras[projeto.id] ?? { totalDireto: 0, totalIndireto: 0, totalCentral: 0 };
        detalheObras[projeto.id].totalDireto += custoDireto;

        for (const [atId, peso] of pesosPonderados) {
          const custo = custoDireto * (peso / somaTotal);
          registros.push({
            projetoId: projeto.id,
            atividadeId: atId,
            mesReferencia: input.mesReferencia,
            tipo: "direto",
            custo: String(custo.toFixed(2)),
            descricao: `MO Direta — diluição proporcional`,
            transferenciaId: null,
          });
        }
      }

      // Grava transferência e registros
      const [transf] = await db.insert(folhaMoTransferencias).values({
        companyId: input.companyId,
        mesReferencia: input.mesReferencia,
        executadoPor: input.executadoPor ?? null,
        totalDireto: String(totalDireto.toFixed(2)),
        totalIndireto: String(totalIndireto.toFixed(2)),
        totalCentral: String(totalCentral.toFixed(2)),
        detalhes: detalheObras,
      }).returning({ id: folhaMoTransferencias.id });

      if (registros.length > 0) {
        const comId = registros.map(r => ({ ...r, transferenciaId: transf.id }));
        for (let i = 0; i < comId.length; i += 100) {
          await db.insert(planejamentoCustosMo).values(comId.slice(i, i + 100));
        }
      }

      return {
        ok: true,
        transferenciaId: transf.id,
        totalDireto,
        totalIndireto,
        totalCentral,
        totalRegistros: registros.length,
      };
    }),

  // ── DESFAZER TRANSFERÊNCIA ──────────────────────────────────────────

  desfazerTransferenciaMO: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [transf] = await db.select({ id: folhaMoTransferencias.id })
        .from(folhaMoTransferencias)
        .where(and(
          eq(folhaMoTransferencias.companyId, input.companyId),
          eq(folhaMoTransferencias.mesReferencia, input.mesReferencia),
        ));
      if (!transf) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma transferência encontrada para este mês." });

      await db.delete(planejamentoCustosMo)
        .where(eq(planejamentoCustosMo.transferenciaId, transf.id));
      await db.delete(folhaMoTransferencias)
        .where(eq(folhaMoTransferencias.id, transf.id));
      return { ok: true };
    }),

  // ── LISTAR CUSTOS MO POR PROJETO ────────────────────────────────────

  listarCustosMoProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number(), mesReferencia: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoCustosMo).where(and(
        eq(planejamentoCustosMo.projetoId, input.projetoId),
        input.mesReferencia ? eq(planejamentoCustosMo.mesReferencia, input.mesReferencia) : undefined,
      )).orderBy(planejamentoCustosMo.mesReferencia, planejamentoCustosMo.tipo);
      return rows;
    }),
});
