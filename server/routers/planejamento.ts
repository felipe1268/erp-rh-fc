import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  planejamentoProjetos,
  planejamentoRevisoes,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoRefis,
  planejamentoCompras,
  planejamentoMedicoes,
  orcamentos,
  orcamentoItens,
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
      const [projeto] = await db.insert(planejamentoProjetos).values({
        companyId:             input.companyId,
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
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoCompras)
        .where(eq(planejamentoCompras.projetoId, input.projetoId))
        .orderBy(asc(planejamentoCompras.dataNecessaria));
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
            i."custoTotalMat"::numeric             AS custo_mat,
            i."custoTotalMdo"::numeric             AS custo_mdo,
            i."custoTotal"::numeric                AS custo_total,
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

      // Busca valor_negociado do orçamento (é o teto de venda real do contrato)
      const orcRes = await db.execute(sql`
        SELECT COALESCE(o.valor_negociado::numeric, o."totalVenda"::numeric, o."totalMeta"::numeric, 0) AS valor_base,
               o."totalMateriais"::numeric AS total_mat_orc,
               o."totalMdo"::numeric       AS total_mdo_orc
        FROM orcamentos o
        JOIN planejamento_projetos p ON p.orcamento_id = o.id
        WHERE p.id = ${input.projetoId}
        LIMIT 1
      `);
      const orcRow   = (orcRes.rows as any[])[0];
      const valorBase   = parseFloat(orcRow?.valor_base  ?? "0") || 0;
      const totalMatOrc = parseFloat(orcRow?.total_mat_orc ?? "0") || 0;
      const totalMdoOrc = parseFloat(orcRow?.total_mdo_orc ?? "0") || 0;

      const rawItens = (rows.rows as any[]).map(r => ({
        ativId:     Number(r.ativ_id),
        eap:        String(r.eap ?? ""),
        nome:       String(r.nome ?? ""),
        dataInicio: r.data_inicio ? String(r.data_inicio).substring(0, 10) : null,
        dataFim:    r.data_fim    ? String(r.data_fim).substring(0, 10)    : null,
        ordem:      Number(r.ordem ?? 0),
        vendaRaw:   parseFloat(r.venda_total  ?? "0") || 0,
        custoMatRaw:parseFloat(r.custo_mat    ?? "0") || 0,
        custoMdoRaw:parseFloat(r.custo_mdo    ?? "0") || 0,
        custoTotal: parseFloat(r.custo_total  ?? "0") || 0,
        unidade:    r.unidade    ? String(r.unidade) : null,
        quantidade: parseFloat(r.quantidade   ?? "0") || 0,
      }));

      // Normaliza: escalona para que a soma de vendaTotal = valorBase
      const sumVendaRaw = rawItens.reduce((s, i) => s + i.vendaRaw, 0);
      const sumMatRaw   = rawItens.reduce((s, i) => s + i.custoMatRaw, 0);
      const sumMdoRaw   = rawItens.reduce((s, i) => s + i.custoMdoRaw, 0);

      const escVenda = sumVendaRaw > 0 && valorBase > 0 ? valorBase / sumVendaRaw : 1;
      const escMat   = sumMatRaw   > 0 && totalMatOrc > 0 ? totalMatOrc / sumMatRaw : escVenda;
      const escMdo   = sumMdoRaw   > 0 && totalMdoOrc > 0 ? totalMdoOrc / sumMdoRaw : escVenda;

      const itens = rawItens.map(i => ({
        ...i,
        vendaTotal: +(i.vendaRaw  * escVenda).toFixed(4),
        custoMat:   +(i.custoMatRaw * escMat).toFixed(4),
        custoMdo:   +(i.custoMdoRaw * escMdo).toFixed(4),
      }));

      const totalVenda = itens.reduce((s, i) => s + i.vendaTotal, 0);
      const totalMat   = itens.reduce((s, i) => s + i.custoMat,   0);
      const totalMdo   = itens.reduce((s, i) => s + i.custoMdo,   0);

      return { itens, totalVenda, totalMat, totalMdo, valorBase };
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
});
