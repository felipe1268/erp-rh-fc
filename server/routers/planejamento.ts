import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, sql, isNotNull, inArray, or, ilike } from "drizzle-orm";
import {
  planejamentoProjetos,
  planejamentoRevisoes,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoRefis,
  planejamentoCompras,
  planejamentoComprasRevisoes,
  planejamentoMedicoes,
  planejamentoMedicaoConfig,
  orcamentos,
  orcamentoItens,
  composicaoInsumos,
} from "../../drizzle/schema";

const n = (v: any) => parseFloat(v || "0") || 0;

export const planejamentoRouter = router({

  // ── Projetos ──────────────────────────────────────────────────────────────
  listarProjetos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.companyId, input.companyId))
        .orderBy(desc(planejamentoProjetos.criadoEm));
    }),

  criarProjeto: protectedProcedure
    .input(z.object({
      companyId:             z.number(),
      obraId:                z.number().optional(),
      orcamentoId:           z.number().optional(),
      nome:                  z.string(),
      cliente:               z.string().optional(),
      local:                 z.string().optional(),
      responsavel:           z.string().optional(),
      dataInicio:            z.string().optional(),
      dataTerminoContratual: z.string().optional(),
      valorContrato:         z.number().optional(),
      status:                z.string().optional(),
      descricao:             z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Regra: 1 planejamento por obra
      if (input.obraId) {
        const [existe] = await db.select({ id: planejamentoProjetos.id })
          .from(planejamentoProjetos)
          .where(and(
            eq(planejamentoProjetos.companyId, input.companyId),
            eq(planejamentoProjetos.obraId, input.obraId),
          ))
          .limit(1);
        if (existe) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta obra já possui um planejamento cadastrado.",
          });
        }
      }

      const [projeto] = await db.insert(planejamentoProjetos).values({
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        orcamentoId:           input.orcamentoId ?? null,
        nome:                  input.nome,
        cliente:               input.cliente ?? null,
        local:                 input.local ?? null,
        responsavel:           input.responsavel ?? null,
        dataInicio:            input.dataInicio ?? null,
        dataTerminoContratual: input.dataTerminoContratual ?? null,
        valorContrato:         String(input.valorContrato ?? 0),
        status:                input.status ?? "Em andamento",
        descricao:             input.descricao ?? null,
      }).returning();

      // Cria baseline (Rev 00) automaticamente
      const today = new Date().toISOString().split("T")[0];
      await db.insert(planejamentoRevisoes).values({
        projetoId:   projeto.id,
        numero:      0,
        descricao:   "Baseline inicial",
        dataRevisao: today,
        motivo:      "Criação do projeto",
        isBaseline:  true,
        status:      "aprovada",
      });

      return projeto;
    }),

  atualizarProjeto: protectedProcedure
    .input(z.object({
      id:                    z.number(),
      nome:                  z.string().optional(),
      cliente:               z.string().optional(),
      local:                 z.string().optional(),
      responsavel:           z.string().optional(),
      dataInicio:            z.string().optional(),
      dataTerminoContratual: z.string().optional(),
      valorContrato:         z.number().optional(),
      status:                z.string().optional(),
      descricao:             z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const updates: any = { atualizadoEm: new Date() };
      if (data.nome !== undefined)                  updates.nome = data.nome;
      if (data.cliente !== undefined)               updates.cliente = data.cliente;
      if (data.local !== undefined)                 updates.local = data.local;
      if (data.responsavel !== undefined)           updates.responsavel = data.responsavel;
      if (data.dataInicio !== undefined)            updates.dataInicio = data.dataInicio;
      if (data.dataTerminoContratual !== undefined) updates.dataTerminoContratual = data.dataTerminoContratual;
      if (data.valorContrato !== undefined)         updates.valorContrato = String(data.valorContrato);
      if (data.status !== undefined)                updates.status = data.status;
      if (data.descricao !== undefined)             updates.descricao = data.descricao;
      await db.update(planejamentoProjetos).set(updates).where(eq(planejamentoProjetos.id, id));
      return { success: true };
    }),

  excluirProjeto: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos).where(eq(planejamentoAvancos.projetoId, input.id));
      await db.delete(planejamentoAtividades).where(eq(planejamentoAtividades.projetoId, input.id));
      await db.delete(planejamentoRevisoes).where(eq(planejamentoRevisoes.projetoId, input.id));
      await db.delete(planejamentoRefis).where(eq(planejamentoRefis.projetoId, input.id));
      await db.delete(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.id));
      return { success: true };
    }),

  // ── Limpar todas as atividades de uma revisão (excluir cronograma importado) ─
  limparCronograma: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos)
        .where(eq(planejamentoAvancos.projetoId, input.projetoId));
      await db.delete(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));
      return { success: true };
    }),

  // ── Detalhe completo do projeto ───────────────────────────────────────────
  getProjetoById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [projeto] = await db.select().from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.id));
      if (!projeto) throw new Error("Projeto não encontrado");

      const [revisoes, orcamento] = await Promise.all([
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.id))
          .orderBy(asc(planejamentoRevisoes.numero)),
        projeto.orcamentoId
          ? db.select().from(orcamentos).where(eq(orcamentos.id, projeto.orcamentoId)).then(r => r[0])
          : Promise.resolve(null),
      ]);

      return { ...projeto, revisoes, orcamento };
    }),

  // ── Revisões ──────────────────────────────────────────────────────────────
  criarRevisao: protectedProcedure
    .input(z.object({
      projetoId:        z.number(),
      motivo:           z.string(),
      responsavel:      z.string().optional(),
      dataRevisao:      z.string(),
      observacao:       z.string().optional(),
      copiarAtividades: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existentes = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.numero));
      const novoNumero = existentes.length > 0 ? (existentes[0].numero ?? 0) + 1 : 1;

      const [revisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:   input.projetoId,
        numero:      novoNumero,
        descricao:   `Rev. ${String(novoNumero).padStart(2, "0")}`,
        dataRevisao: input.dataRevisao,
        motivo:      input.motivo,
        responsavel: input.responsavel ?? null,
        observacao:  input.observacao ?? null,
        isBaseline:  false,
        status:      "pendente",
      }).returning();

      if (input.copiarAtividades) {
        const revisaoAnterior = existentes.find(r => r.status === "aprovada");
        if (revisaoAnterior) {
          const atividades = await db.select().from(planejamentoAtividades)
            .where(eq(planejamentoAtividades.revisaoId, revisaoAnterior.id));
          if (atividades.length > 0) {
            await db.insert(planejamentoAtividades).values(
              atividades.map(a => ({
                revisaoId:           revisao.id,
                projetoId:           input.projetoId,
                eapCodigo:           a.eapCodigo,
                nome:                a.nome,
                nivel:               a.nivel,
                dataInicio:          a.dataInicio,
                dataFim:             a.dataFim,
                duracaoDias:         a.duracaoDias,
                predecessora:        a.predecessora,
                pesoFinanceiro:      a.pesoFinanceiro,
                recursoPrincipal:    a.recursoPrincipal,
                quantidadePlanejada: a.quantidadePlanejada,
                unidade:             a.unidade,
                ordem:               a.ordem,
                isGrupo:             a.isGrupo,
              }))
            );
          }
        }
      }

      return revisao;
    }),

  aprovarRevisao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadoPor: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(planejamentoRevisoes)
        .set({ status: "aprovada", aprovadoPor: input.aprovadoPor ?? null })
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  // ── Atividades ────────────────────────────────────────────────────────────
  listarAtividades: protectedProcedure
    .input(z.object({ revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId))
        .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));
    }),

  salvarAtividades: protectedProcedure
    .input(z.object({
      revisaoId: z.number(),
      projetoId: z.number(),
      atividades: z.array(z.object({
        id:                  z.number().optional(),
        eapCodigo:           z.string().optional(),
        nome:                z.string(),
        nivel:               z.number().optional(),
        dataInicio:          z.string().optional(),
        dataFim:             z.string().optional(),
        duracaoDias:         z.number().optional(),
        predecessora:        z.string().optional(),
        pesoFinanceiro:      z.number().optional(),
        recursoPrincipal:    z.string().optional(),
        quantidadePlanejada: z.number().optional(),
        unidade:             z.string().optional(),
        ordem:               z.number().optional(),
        isGrupo:             z.boolean().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      if (input.atividades.length > 0) {
        await db.insert(planejamentoAtividades).values(
          input.atividades.map((a, i) => ({
            revisaoId:           input.revisaoId,
            projetoId:           input.projetoId,
            eapCodigo:           a.eapCodigo ?? null,
            nome:                a.nome,
            nivel:               a.nivel ?? 1,
            dataInicio:          a.dataInicio ?? null,
            dataFim:             a.dataFim ?? null,
            duracaoDias:         a.duracaoDias ?? 0,
            predecessora:        a.predecessora ?? null,
            pesoFinanceiro:      String(a.pesoFinanceiro ?? 0),
            recursoPrincipal:    a.recursoPrincipal ?? null,
            quantidadePlanejada: String(a.quantidadePlanejada ?? 0),
            unidade:             a.unidade ?? null,
            ordem:               a.ordem ?? i,
            isGrupo:             a.isGrupo ?? false,
          }))
        );
      }
      return { success: true };
    }),

  // ── Avanços físicos semanais ──────────────────────────────────────────────
  listarAvancos: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
        ))
        .orderBy(asc(planejamentoAvancos.semana), asc(planejamentoAvancos.atividadeId));
    }),

  salvarAvanco: protectedProcedure
    .input(z.object({
      projetoId:           z.number(),
      atividadeId:         z.number(),
      revisaoId:           z.number(),
      semana:              z.string(),
      percentualAcumulado: z.number(),
      percentualSemanal:   z.number(),
      observacao:          z.string().optional(),
      criadoPor:           z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(planejamentoAvancos).where(and(
        eq(planejamentoAvancos.atividadeId, input.atividadeId),
        eq(planejamentoAvancos.semana, input.semana),
      ));

      if (existing.length > 0) {
        await db.update(planejamentoAvancos).set({
          percentualAcumulado: String(input.percentualAcumulado),
          percentualSemanal:   String(input.percentualSemanal),
          observacao:          input.observacao ?? null,
        }).where(eq(planejamentoAvancos.id, existing[0].id));
      } else {
        await db.insert(planejamentoAvancos).values({
          projetoId:           input.projetoId,
          atividadeId:         input.atividadeId,
          revisaoId:           input.revisaoId,
          semana:              input.semana,
          percentualAcumulado: String(input.percentualAcumulado),
          percentualSemanal:   String(input.percentualSemanal),
          observacao:          input.observacao ?? null,
          criadoPor:           input.criadoPor ?? null,
        });
      }
      return { success: true };
    }),

  // ── Batch save de avanços (import MS Project) ─────────────────────────────
  salvarAvancoLote: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      revisaoId: z.number(),
      semana:    z.string(),
      itens: z.array(z.object({
        atividadeId:         z.number(),
        percentualAcumulado: z.number(),
        percentualSemanal:   z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Carrega todos os existentes da semana de uma vez
      const existentes = await db.select()
        .from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.semana, input.semana),
        ));
      const existMap = new Map(existentes.map(e => [e.atividadeId, e.id]));

      const toUpdate: typeof input.itens = [];
      const toInsert: typeof input.itens = [];
      for (const item of input.itens) {
        if (existMap.has(item.atividadeId)) toUpdate.push(item);
        else toInsert.push(item);
      }

      // Updates em paralelo (em lotes de 50)
      const chunkSize = 50;
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        await Promise.all(
          toUpdate.slice(i, i + chunkSize).map(item =>
            db.update(planejamentoAvancos)
              .set({
                percentualAcumulado: String(item.percentualAcumulado),
                percentualSemanal:   String(item.percentualSemanal),
              })
              .where(eq(planejamentoAvancos.id, existMap.get(item.atividadeId)!))
          )
        );
      }

      // Inserts em lotes
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        await db.insert(planejamentoAvancos).values(
          toInsert.slice(i, i + chunkSize).map(item => ({
            projetoId:           input.projetoId,
            revisaoId:           input.revisaoId,
            atividadeId:         item.atividadeId,
            semana:              input.semana,
            percentualAcumulado: String(item.percentualAcumulado),
            percentualSemanal:   String(item.percentualSemanal),
          }))
        );
      }

      return { success: true, total: input.itens.length };
    }),

  // ── REFIS ─────────────────────────────────────────────────────────────────
  listarRefis: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoRefis)
        .where(eq(planejamentoRefis.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRefis.semana));
    }),

  salvarRefis: protectedProcedure
    .input(z.object({
      projetoId:              z.number(),
      semana:                 z.string(),
      numero:                 z.number().optional(),
      avancoPrevisto:         z.number(),
      avancoRealizado:        z.number(),
      avancoSemanalPrevisto:  z.number(),
      avancoSemanalRealizado: z.number(),
      spi:                    z.number().optional(),
      cpi:                    z.number().optional(),
      custoPrevisto:          z.number().optional(),
      custoRealizado:         z.number().optional(),
      observacoes:            z.string().optional(),
      status:                 z.string().optional(),
      criadoPor:              z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(planejamentoRefis).where(and(
        eq(planejamentoRefis.projetoId, input.projetoId),
        eq(planejamentoRefis.semana, input.semana),
      ));

      const values = {
        avancoPrevisto:         String(input.avancoPrevisto),
        avancoRealizado:        String(input.avancoRealizado),
        avancoSemanalPrevisto:  String(input.avancoSemanalPrevisto),
        avancoSemanalRealizado: String(input.avancoSemanalRealizado),
        spi:                    String(input.spi ?? 1),
        cpi:                    String(input.cpi ?? 1),
        custoPrevisto:          String(input.custoPrevisto ?? 0),
        custoRealizado:         String(input.custoRealizado ?? 0),
        observacoes:            input.observacoes ?? null,
        status:                 input.status ?? "emitido",
      };

      if (existing.length > 0) {
        await db.update(planejamentoRefis).set(values)
          .where(eq(planejamentoRefis.id, existing[0].id));
      } else {
        const todos = await db.select().from(planejamentoRefis)
          .where(eq(planejamentoRefis.projetoId, input.projetoId));
        const numero = todos.length + 1;
        await db.insert(planejamentoRefis).values({
          projetoId:   input.projetoId,
          semana:      input.semana,
          numero,
          dataEmissao: new Date().toISOString().split("T")[0],
          ...values,
          criadoPor:   input.criadoPor ?? null,
        });
      }
      return { success: true };
    }),

  deletarRefis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  limparAvancos: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos)
        .where(eq(planejamentoAvancos.projetoId, input.projetoId));
      return { success: true };
    }),

  // ── Curva S ───────────────────────────────────────────────────────────────
  getCurvaS: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number(), baselineId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [atividades, baseline, avancos] = await Promise.all([
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId))
          .orderBy(asc(planejamentoAtividades.dataInicio)),
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.baselineId))
          .orderBy(asc(planejamentoAtividades.dataInicio)),
        db.select().from(planejamentoAvancos)
          .where(and(
            eq(planejamentoAvancos.projetoId, input.projetoId),
            eq(planejamentoAvancos.revisaoId, input.revisaoId),
          ))
          .orderBy(asc(planejamentoAvancos.semana)),
      ]);

      function gerarCurvaPlanejada(ativs: typeof atividades) {
        if (!ativs.length) return [];
        const folhas = ativs.filter(a => !a.isGrupo && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];

        const pesoBruto = folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
        const usarIgual = pesoBruto === 0;
        const pesoTotal = usarIgual ? folhas.length : pesoBruto;

        const dates: Map<string, number> = new Map();
        folhas.forEach(a => {
          const inicio   = new Date(a.dataInicio!);
          const fim      = new Date(a.dataFim!);
          const dur      = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (7 * 86400000)));
          const pesoAtiv = usarIgual ? 1 : n(a.pesoFinanceiro);
          const semPeso  = pesoAtiv / dur / pesoTotal * 100;
          let cur = new Date(inicio);
          for (let i = 0; i < dur; i++) {
            const key = cur.toISOString().split("T")[0];
            dates.set(key, (dates.get(key) ?? 0) + semPeso);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        });

        const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        let acum = 0;
        return sorted.map(([semana, val]) => {
          acum = Math.min(100, acum + val);
          return { semana, acumulado: +acum.toFixed(2) };
        });
      }

      const curvaPlanejada = gerarCurvaPlanejada(atividades);
      const curvaBaseline  = gerarCurvaPlanejada(baseline);

      // Curva realizada
      const avancoMap: Map<string, { soma: number; cont: number }> = new Map();
      avancos.forEach(av => {
        const k = av.semana;
        if (!avancoMap.has(k)) avancoMap.set(k, { soma: 0, cont: 0 });
        const entry = avancoMap.get(k)!;
        entry.soma += n(av.percentualSemanal);
        entry.cont += 1;
      });

      let acumReal = 0;
      const curvaRealizada = [...avancoMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([semana, { soma, cont }]) => {
          acumReal = Math.min(100, acumReal + soma / cont);
          return { semana, acumulado: +acumReal.toFixed(2) };
        });

      // Linha de tendência por regressão linear
      let curvaTendencia: { semana: string; acumulado: number }[] = [];
      if (curvaRealizada.length >= 2) {
        const nn = curvaRealizada.length;
        const xs = curvaRealizada.map((_, i) => i);
        const ys = curvaRealizada.map(p => p.acumulado);
        const sumX  = xs.reduce((a, b) => a + b, 0);
        const sumY  = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const slope = (nn * sumXY - sumX * sumY) / (nn * sumX2 - sumX * sumX);
        const inter = (sumY - slope * sumX) / nn;

        const lastReal = curvaRealizada[curvaRealizada.length - 1];
        const lastDate = new Date(lastReal.semana);
        curvaTendencia = curvaRealizada.map(p => ({ ...p }));

        for (let w = 1; w <= 16; w++) {
          const proj = inter + slope * (nn - 1 + w);
          if (proj >= 100) break;
          const d = new Date(lastDate.getTime() + w * 7 * 86400000);
          curvaTendencia.push({
            semana:    d.toISOString().split("T")[0],
            acumulado: Math.min(100, +proj.toFixed(2)),
          });
        }
      }

      return { curvaPlanejada, curvaBaseline, curvaRealizada, curvaTendencia };
    }),

  // ── Cronograma de Compras ──────────────────────────────────────────────────
  listarCompras: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisao: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (input.revisao !== undefined) {
        return db.select().from(planejamentoCompras)
          .where(and(
            eq(planejamentoCompras.projetoId, input.projetoId),
            eq(planejamentoCompras.revisao, input.revisao),
          ))
          .orderBy(asc(planejamentoCompras.dataNecessaria));
      }
      // Sem revisao especificada: retorna a revisão mais recente
      const maxRevRes = await db.execute(sql`
        SELECT COALESCE(MAX(revisao), 1) AS max_rev
        FROM planejamento_compras
        WHERE projeto_id = ${input.projetoId}
      `);
      const maxRev = Number((maxRevRes.rows as any[])[0]?.max_rev ?? 1);
      return db.select().from(planejamentoCompras)
        .where(and(
          eq(planejamentoCompras.projetoId, input.projetoId),
          eq(planejamentoCompras.revisao, maxRev),
        ))
        .orderBy(asc(planejamentoCompras.dataNecessaria));
    }),

  listarRevisoesCompras: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Revisões com metadados: busca da tabela de controle, complementando com contagem real
      const revisoes = await db.execute(sql`
        SELECT
          r.revisao,
          r.descricao,
          r.lead_time,
          r.total_itens,
          r.total_custo,
          r.gerado_em,
          r.gerado_por_revisao_cronograma,
          COUNT(c.id)::int                                       AS itens_reais,
          COALESCE(SUM(c.quantidade::numeric * c.custo_unitario::numeric), 0) AS custo_real
        FROM planejamento_compras_revisoes r
        LEFT JOIN planejamento_compras c
          ON c.projeto_id = r.projeto_id AND c.revisao = r.revisao
        WHERE r.projeto_id = ${input.projetoId}
        GROUP BY r.revisao, r.descricao, r.lead_time, r.total_itens, r.total_custo, r.gerado_em, r.gerado_por_revisao_cronograma
        ORDER BY r.revisao DESC
      `);
      return (revisoes.rows as any[]).map(r => ({
        revisao:                    Number(r.revisao),
        descricao:                  r.descricao ?? null,
        leadTime:                   Number(r.lead_time ?? 30),
        totalItens:                 Number(r.itens_reais ?? r.total_itens ?? 0),
        totalCusto:                 parseFloat(r.custo_real ?? r.total_custo ?? "0"),
        geradoEm:                   r.gerado_em ? String(r.gerado_em) : null,
        geradoPorRevisaoCronograma: r.gerado_por_revisao_cronograma ? Number(r.gerado_por_revisao_cronograma) : null,
      }));
    }),

  gerarCronogramaCompras: protectedProcedure
    .input(z.object({
      projetoId:              z.number(),
      leadTime:               z.number().default(30),
      descricao:              z.string().optional(),
      revisaoCronogramaId:    z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { projetoId, leadTime, descricao, revisaoCronogramaId } = input;

      // 1. Cruzamento orçamento × cronograma — itens com custo (mat ou total)
      const rows = await db.execute(sql`
        WITH matched AS (
          SELECT DISTINCT ON (i.id)
            i.id                                   AS item_id,
            i."eapCodigo"                          AS eap,
            i.descricao                            AS nome,
            CASE
              WHEN i."custoTotalMat"::numeric > 0 THEN i."custoTotalMat"::numeric
              ELSE i."custoTotal"::numeric
            END                                    AS custo_mat,
            i."custoTotal"::numeric                AS custo_total,
            i.unidade                              AS unidade,
            COALESCE(i.quantidade::numeric, 0)     AS quantidade,
            a.id                                   AS ativ_id,
            a.data_inicio                          AS data_inicio,
            a.data_fim                             AS data_fim
          FROM orcamento_itens i
          JOIN planejamento_projetos p
            ON p.orcamento_id = i."orcamentoId"
            AND p.id = ${projetoId}
          JOIN planejamento_atividades a
            ON a.projeto_id = ${projetoId}
            AND NOT a.is_grupo
            AND LOWER(REGEXP_REPLACE(TRIM(a.nome), '[\\s]+', ' ', 'g'))
              = LOWER(REGEXP_REPLACE(TRIM(i.descricao), '[\\s]+', ' ', 'g'))
          WHERE (i."custoTotalMat"::numeric > 0 OR i."custoTotal"::numeric > 0)
            AND a.data_inicio IS NOT NULL
          ORDER BY i.id, a.data_inicio ASC
        )
        SELECT * FROM matched ORDER BY data_inicio
      `);

      const itens = (rows.rows as any[]);
      if (itens.length === 0) {
        throw new Error("Nenhum item encontrado no cruzamento orçamento × cronograma. Verifique se as atividades do cronograma têm o mesmo nome dos itens do orçamento e possuem datas definidas.");
      }

      // 2. Próxima revisão
      const maxRevRes = await db.execute(sql`
        SELECT COALESCE(MAX(revisao), 0) AS max_rev
        FROM planejamento_compras_revisoes
        WHERE projeto_id = ${projetoId}
      `);
      const novaRevisao = Number((maxRevRes.rows as any[])[0]?.max_rev ?? 0) + 1;

      // 3. Gera os itens de compra
      const comprasParaInserir = itens.map((r: any) => {
        const dataInicio = r.data_inicio ? String(r.data_inicio).substring(0, 10) : null;
        let dataNecessaria = dataInicio;
        if (dataInicio) {
          const d = new Date(dataInicio + "T12:00:00");
          d.setDate(d.getDate() - leadTime);
          dataNecessaria = d.toISOString().split("T")[0];
        }
        const qtd = parseFloat(r.quantidade ?? "1") || 1;
        const custoMat = parseFloat(r.custo_mat ?? "0") || 0;
        return {
          projetoId,
          revisao: novaRevisao,
          fonte: "auto" as const,
          item: String(r.nome ?? ""),
          unidade: r.unidade ? String(r.unidade) : "un",
          quantidade: String(qtd),
          custoUnitario: String(+(custoMat / qtd).toFixed(4)),
          dataNecessaria: dataNecessaria ?? dataInicio ?? new Date().toISOString().split("T")[0],
          atividadeDataInicio: dataInicio,
          leadTime,
          eapCodigo: r.eap ? String(r.eap) : null,
          status: "pendente" as const,
          observacoes: `Gerado automaticamente — EAP ${r.eap ?? "?"} — Rev. Crono ${revisaoCronogramaId ?? "—"}`,
        };
      });

      await db.insert(planejamentoCompras).values(comprasParaInserir);

      // 4. Registra metadados da revisão
      const totalCusto = comprasParaInserir.reduce(
        (s, c) => s + parseFloat(c.quantidade) * parseFloat(c.custoUnitario), 0
      );
      await db.insert(planejamentoComprasRevisoes).values({
        projetoId,
        revisao: novaRevisao,
        descricao: descricao ?? `Gerado automaticamente (lead time ${leadTime}d)`,
        leadTime,
        totalItens: comprasParaInserir.length,
        totalCusto: String(+totalCusto.toFixed(2)),
        geradoPorRevisaoCronograma: revisaoCronogramaId ?? null,
      });

      return { revisao: novaRevisao, totalItens: comprasParaInserir.length, totalCusto };
    }),

  criarCompra: protectedProcedure
    .input(z.object({
      projetoId:      z.number(),
      item:           z.string(),
      unidade:        z.string().optional(),
      quantidade:     z.number().optional(),
      custoUnitario:  z.number().optional(),
      dataNecessaria: z.string(),
      status:         z.string().optional(),
      fornecedor:     z.string().optional(),
      observacoes:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      return db.insert(planejamentoCompras).values({
        projetoId:      input.projetoId,
        item:           input.item,
        unidade:        input.unidade ?? "un",
        quantidade:     String(input.quantidade ?? 1),
        custoUnitario:  String(input.custoUnitario ?? 0),
        dataNecessaria: input.dataNecessaria,
        status:         input.status ?? "pendente",
        fornecedor:     input.fornecedor,
        observacoes:    input.observacoes,
      }).returning();
    }),

  atualizarCompra: protectedProcedure
    .input(z.object({
      id:             z.number(),
      item:           z.string().optional(),
      unidade:        z.string().optional(),
      quantidade:     z.number().optional(),
      custoUnitario:  z.number().optional(),
      dataNecessaria: z.string().optional(),
      dataPedido:     z.string().nullable().optional(),
      status:         z.string().optional(),
      fornecedor:     z.string().nullable().optional(),
      observacoes:    z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const upd: any = { atualizadoEm: new Date() };
      if (rest.item           !== undefined) upd.item           = rest.item;
      if (rest.unidade        !== undefined) upd.unidade        = rest.unidade;
      if (rest.quantidade     !== undefined) upd.quantidade     = String(rest.quantidade);
      if (rest.custoUnitario  !== undefined) upd.custoUnitario  = String(rest.custoUnitario);
      if (rest.dataNecessaria !== undefined) upd.dataNecessaria = rest.dataNecessaria;
      if (rest.dataPedido     !== undefined) upd.dataPedido     = rest.dataPedido;
      if (rest.status         !== undefined) upd.status         = rest.status;
      if (rest.fornecedor     !== undefined) upd.fornecedor     = rest.fornecedor;
      if (rest.observacoes    !== undefined) upd.observacoes    = rest.observacoes;
      return db.update(planejamentoCompras).set(upd)
        .where(eq(planejamentoCompras.id, id)).returning();
    }),

  excluirCompra: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      return db.delete(planejamentoCompras)
        .where(eq(planejamentoCompras.id, input.id));
    }),

  deletarRevisaoCompras: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisao: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoCompras)
        .where(and(
          eq(planejamentoCompras.projetoId, input.projetoId),
          eq(planejamentoCompras.revisao,   input.revisao),
        ));
      await db.delete(planejamentoComprasRevisoes)
        .where(and(
          eq(planejamentoComprasRevisoes.projetoId, input.projetoId),
          eq(planejamentoComprasRevisoes.revisao,   input.revisao),
        ));
      return { ok: true };
    }),

  // ── Cruzamento Orçamento × Cronograma ─────────────────────────────────────
  obterCruzamentoOrcCronograma: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Cruzamento correto: para cada ITEM do orçamento, pega UMA atividade com nome igual.
      // Isso evita multiplicar valores quando várias atividades têm o mesmo nome.
      const rows = await db.execute(sql`
        WITH matched AS (
          SELECT DISTINCT ON (i.id)
            i.id                                   AS item_id,
            i."eapCodigo"                          AS eap,
            i.descricao                            AS nome,
            i."vendaTotal"::numeric                AS venda_total,
            i."metaTotal"::numeric                 AS meta_total,
            i."custoTotal"::numeric                AS custo_total,
            i."custoTotalMat"::numeric             AS custo_mat,
            i."custoTotalMdo"::numeric             AS custo_mdo,
            i.unidade                              AS unidade,
            COALESCE(i.quantidade::numeric, 0)     AS quantidade,
            a.id                                   AS ativ_id,
            a.data_inicio                          AS data_inicio,
            a.data_fim                             AS data_fim,
            a.ordem                                AS ordem
          FROM orcamento_itens i
          JOIN planejamento_projetos p
            ON p.orcamento_id = i."orcamentoId"
            AND p.id = ${input.projetoId}
          JOIN planejamento_atividades a
            ON a.projeto_id = ${input.projetoId}
            AND NOT a.is_grupo
            AND LOWER(REGEXP_REPLACE(TRIM(a.nome), '[\\s]+', ' ', 'g'))
              = LOWER(REGEXP_REPLACE(TRIM(i.descricao), '[\\s]+', ' ', 'g'))
          WHERE (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
            AND a.data_inicio IS NOT NULL
            AND a.data_fim IS NOT NULL
          ORDER BY i.id, a.ordem ASC
        )
        SELECT * FROM matched ORDER BY ordem
      `);

      // Busca totais do orçamento para normalização dos 3 cenários
      const orcRes = await db.execute(sql`
        SELECT
          COALESCE(o.valor_negociado::numeric, o."totalVenda"::numeric, o."totalMeta"::numeric, 0) AS valor_venda,
          COALESCE(o."totalMeta"::numeric, 0)       AS valor_meta,
          COALESCE(o."totalCusto"::numeric, 0)      AS valor_custo,
          COALESCE(o."totalMateriais"::numeric, 0)  AS total_mat_orc,
          COALESCE(o."totalMdo"::numeric, 0)        AS total_mdo_orc
        FROM orcamentos o
        JOIN planejamento_projetos p ON p.orcamento_id = o.id
        WHERE p.id = ${input.projetoId}
        LIMIT 1
      `);
      const orcRow     = (orcRes.rows as any[])[0];
      const valorVenda = parseFloat(orcRow?.valor_venda ?? "0") || 0;
      const valorMeta  = parseFloat(orcRow?.valor_meta  ?? "0") || 0;
      const valorCusto = parseFloat(orcRow?.valor_custo ?? "0") || 0;
      const totalMatOrc = parseFloat(orcRow?.total_mat_orc ?? "0") || 0;
      const totalMdoOrc = parseFloat(orcRow?.total_mdo_orc ?? "0") || 0;

      const rawItens = (rows.rows as any[]).map(r => ({
        ativId:      Number(r.ativ_id),
        eap:         String(r.eap ?? ""),
        nome:        String(r.nome ?? ""),
        dataInicio:  r.data_inicio ? String(r.data_inicio).substring(0, 10) : null,
        dataFim:     r.data_fim    ? String(r.data_fim).substring(0, 10)    : null,
        ordem:       Number(r.ordem ?? 0),
        vendaRaw:    parseFloat(r.venda_total ?? "0") || 0,
        metaRaw:     parseFloat(r.meta_total  ?? "0") || 0,
        custoRaw:    parseFloat(r.custo_total ?? "0") || 0,
        custoMatRaw: parseFloat(r.custo_mat   ?? "0") || 0,
        custoMdoRaw: parseFloat(r.custo_mdo   ?? "0") || 0,
        unidade:     r.unidade ? String(r.unidade) : null,
        quantidade:  parseFloat(r.quantidade  ?? "0") || 0,
      }));

      // Fatores de normalização: escalona cada cenário para o total do orçamento
      const sumVendaRaw = rawItens.reduce((s, i) => s + i.vendaRaw, 0);
      const sumMetaRaw  = rawItens.reduce((s, i) => s + i.metaRaw,  0);
      const sumCustoRaw = rawItens.reduce((s, i) => s + i.custoRaw, 0);
      const sumMatRaw   = rawItens.reduce((s, i) => s + i.custoMatRaw, 0);
      const sumMdoRaw   = rawItens.reduce((s, i) => s + i.custoMdoRaw, 0);

      const escVenda = sumVendaRaw > 0 && valorVenda > 0 ? valorVenda / sumVendaRaw : 1;
      const escMeta  = sumMetaRaw  > 0 && valorMeta  > 0 ? valorMeta  / sumMetaRaw  : escVenda;
      const escCusto = sumCustoRaw > 0 && valorCusto > 0 ? valorCusto / sumCustoRaw : escVenda;
      const escMat   = sumMatRaw   > 0 && totalMatOrc > 0 ? totalMatOrc / sumMatRaw  : escCusto;
      const escMdo   = sumMdoRaw   > 0 && totalMdoOrc > 0 ? totalMdoOrc / sumMdoRaw  : escCusto;

      const itens = rawItens.map(i => ({
        ...i,
        vendaTotal: +(i.vendaRaw    * escVenda).toFixed(4),
        metaTotal:  +(i.metaRaw     * escMeta).toFixed(4),
        custoNorm:  +(i.custoRaw    * escCusto).toFixed(4),
        custoMat:   +(i.custoMatRaw * escMat).toFixed(4),
        custoMdo:   +(i.custoMdoRaw * escMdo).toFixed(4),
      }));

      const totalVenda = itens.reduce((s, i) => s + i.vendaTotal, 0);
      const totalMeta  = itens.reduce((s, i) => s + i.metaTotal,  0);
      const totalCusto = itens.reduce((s, i) => s + i.custoNorm,  0);
      const totalMat   = itens.reduce((s, i) => s + i.custoMat,   0);
      const totalMdo   = itens.reduce((s, i) => s + i.custoMdo,   0);

      return {
        itens,
        totalVenda, totalMeta, totalCusto, totalMat, totalMdo,
        valorBase: valorVenda,
        valorBaseMeta: valorMeta,
        valorBaseCusto: valorCusto,
      };
    }),

  // ── Medições Financeiras ───────────────────────────────────────────────────
  listarMedicoes: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, input.projetoId))
        .orderBy(asc(planejamentoMedicoes.competencia));
    }),

  salvarMedicao: protectedProcedure
    .input(z.object({
      projetoId:          z.number(),
      competencia:        z.string(),
      numero:             z.number().optional(),
      valorPrevisto:      z.number().optional(),
      valorMedido:        z.number().optional(),
      percentualPrevisto: z.number().optional(),
      percentualMedido:   z.number().optional(),
      status:             z.string().optional(),
      observacoes:        z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(planejamentoMedicoes)
        .where(and(
          eq(planejamentoMedicoes.projetoId, input.projetoId),
          eq(planejamentoMedicoes.competencia, input.competencia),
        )).limit(1);

      const data = {
        projetoId:          input.projetoId,
        competencia:        input.competencia,
        numero:             input.numero ?? 0,
        valorPrevisto:      String(input.valorPrevisto ?? 0),
        valorMedido:        String(input.valorMedido ?? 0),
        percentualPrevisto: String(input.percentualPrevisto ?? 0),
        percentualMedido:   String(input.percentualMedido ?? 0),
        status:             input.status ?? "pendente",
        observacoes:        input.observacoes ?? null,
        atualizadoEm:       new Date(),
      };

      if (existing.length > 0) {
        return db.update(planejamentoMedicoes).set(data)
          .where(eq(planejamentoMedicoes.id, existing[0].id)).returning();
      } else {
        return db.insert(planejamentoMedicoes).values(data).returning();
      }
    }),

  excluirMedicao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      return db.delete(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.id, input.id));
    }),

  // ── Configuração de Modalidade de Medição ────────────────────────────────
  getConfigMedicao: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cfg] = await db.select().from(planejamentoMedicaoConfig)
        .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
        .limit(1);
      return cfg ?? null;
    }),

  salvarConfigMedicao: protectedProcedure
    .input(z.object({
      projetoId:         z.number(),
      tipoMedicao:       z.enum(["avanco", "parcela_fixa"]),
      diaCorte:          z.number().min(1).max(31),
      entrada:           z.number().optional(),
      numeroParcelas:    z.number().min(1).max(120).optional(),
      inicioFaturamento: z.string().nullable().optional(),
      sinalPct:          z.number().min(0).max(100).optional(),
      retencaoPct:       z.number().min(0).max(100).optional(),
      dataInicioObra:    z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select({ id: planejamentoMedicaoConfig.id, bloqueado: planejamentoMedicaoConfig.bloqueado })
        .from(planejamentoMedicaoConfig)
        .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
        .limit(1);

      const data = {
        projetoId:         input.projetoId,
        tipoMedicao:       input.tipoMedicao,
        diaCorte:          input.diaCorte,
        entrada:           String(input.entrada ?? 0),
        numeroParcelas:    input.numeroParcelas ?? 6,
        inicioFaturamento: input.inicioFaturamento ?? null,
        sinalPct:          String(input.sinalPct ?? 0),
        retencaoPct:       String(input.retencaoPct ?? 5),
        dataInicioObra:    input.dataInicioObra ?? null,
        bloqueado:         false,
        atualizadoEm:      new Date(),
      };

      if (existing) {
        await db.update(planejamentoMedicaoConfig).set(data)
          .where(eq(planejamentoMedicaoConfig.id, existing.id));
      } else {
        await db.insert(planejamentoMedicaoConfig).values(data);
      }
      return { success: true };
    }),

  toggleBloqueioMedicao: protectedProcedure
    .input(z.object({ projetoId: z.number(), bloqueado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select({ id: planejamentoMedicaoConfig.id })
        .from(planejamentoMedicaoConfig)
        .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
        .limit(1);
      if (!existing) return { success: false };
      await db.update(planejamentoMedicaoConfig)
        .set({ bloqueado: input.bloqueado, atualizadoEm: new Date() })
        .where(eq(planejamentoMedicaoConfig.id, existing.id));
      return { success: true };
    }),

  // ── Programação Semanal — recursos por EAP ───────────────────────────────
  buscarRecursosSemana: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      orcamentoId:     z.number(),
      eapCodigos:      z.array(z.string()),
      atividadeNomes:  z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      if (!input.eapCodigos.length && !input.atividadeNomes?.length) return { itens: [], insumos: [], matchedByNome: false };
      const db = await getDb();

      const colSelect = {
        eapCodigo:     orcamentoItens.eapCodigo,
        descricao:     orcamentoItens.descricao,
        unidade:       orcamentoItens.unidade,
        quantidade:    orcamentoItens.quantidade,
        custoUnitMat:  orcamentoItens.custoUnitMat,
        custoUnitMdo:  orcamentoItens.custoUnitMdo,
        custoTotal:    orcamentoItens.custoTotal,
        servicoCodigo: orcamentoItens.servicoCodigo,
        tipo:          orcamentoItens.tipo,
      };

      // 1ª tentativa: match por EAP código
      let itens: any[] = [];
      if (input.eapCodigos.length) {
        itens = await db.select(colSelect).from(orcamentoItens)
          .where(and(
            eq(orcamentoItens.orcamentoId, input.orcamentoId),
            eq(orcamentoItens.companyId,   input.companyId),
            inArray(orcamentoItens.eapCodigo, input.eapCodigos),
          ));
      }

      // 2ª tentativa: fallback por nome da atividade (quando EAPs não coincidem)
      let matchedByNome = false;
      if (itens.length === 0 && input.atividadeNomes?.length) {
        const nomes = input.atividadeNomes.slice(0, 15); // limita a 15 buscas
        const conditions = nomes
          .map(n => n.trim().substring(0, 40))
          .filter(n => n.length >= 5)
          .map(n => ilike(orcamentoItens.descricao, `%${n}%`));

        if (conditions.length) {
          itens = await db.select(colSelect).from(orcamentoItens)
            .where(and(
              eq(orcamentoItens.orcamentoId, input.orcamentoId),
              eq(orcamentoItens.companyId,   input.companyId),
              or(...conditions),
            ));
          if (itens.length > 0) matchedByNome = true;
        }
      }

      // Busca insumos das composições ligadas aos itens encontrados
      const servCodes = [...new Set(itens.map(i => i.servicoCodigo).filter(Boolean))] as string[];
      let insumos: any[] = [];
      if (servCodes.length) {
        insumos = await db.select({
          composicaoCodigo: composicaoInsumos.composicaoCodigo,
          insumoDescricao:  composicaoInsumos.insumoDescricao,
          unidade:          composicaoInsumos.unidade,
          quantidade:       composicaoInsumos.quantidade,
          alocacaoMat:      composicaoInsumos.alocacaoMat,
          alocacaoMdo:      composicaoInsumos.alocacaoMdo,
          custoUnitTotal:   composicaoInsumos.custoUnitTotal,
        }).from(composicaoInsumos)
          .where(and(
            eq(composicaoInsumos.companyId, input.companyId),
            inArray(composicaoInsumos.composicaoCodigo, servCodes),
          ));
      }

      return { itens, insumos, matchedByNome };
    }),

  // ── Validação EAP cronograma × orçamento ─────────────────────────────────
  validarEapCronograma: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      orcamentoId: z.number(),
      eapCodigos:  z.array(z.string()),
    }))
    .query(async ({ input }) => {
      if (!input.orcamentoId || !input.eapCodigos.length) return { ok: [], semOrcamento: [], semCronograma: [] };
      const db = await getDb();

      const itens = await db.select({ eapCodigo: orcamentoItens.eapCodigo })
        .from(orcamentoItens)
        .where(and(
          eq(orcamentoItens.orcamentoId, input.orcamentoId),
          eq(orcamentoItens.companyId,   input.companyId),
        ));

      const eapOrc  = new Set(itens.map(i => i.eapCodigo));
      const eapCron = new Set(input.eapCodigos);

      const ok             = input.eapCodigos.filter(e => eapOrc.has(e));
      const semOrcamento   = input.eapCodigos.filter(e => !eapOrc.has(e));
      const semCronograma  = [...eapOrc].filter(e => !eapCron.has(e));

      return { ok, semOrcamento, semCronograma };
    }),
});
