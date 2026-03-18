import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, sql, isNotNull, inArray, or, ilike, lt, ne } from "drizzle-orm";
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
  almoxarifadoItens,
  equipment,
  heSolicitacoes,
  heSolicitacaoFuncionarios,
  employees,
  obras,
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

      // Regra: obraId obrigatório para criar planejamento
      if (!input.obraId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "É obrigatório vincular uma obra ao planejamento.",
        });
      }

      // Regra: a obra DEVE ter orçamento cadastrado
      const [orcamentoVinculado] = await db
        .select({ id: orcamentos.id })
        .from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
        ))
        .limit(1);
      if (!orcamentoVinculado) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não é possível criar um planejamento sem orçamento vinculado. Cadastre primeiro o orçamento da obra.",
        });
      }

      // Regra: 1 planejamento por obra
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
      // Apaga apenas os avanços da REVISÃO atual — nunca de outras revisões
      await db.delete(planejamentoAvancos)
        .where(eq(planejamentoAvancos.revisaoId, input.revisaoId));
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
          .orderBy(asc(planejamentoRevisoes.numero))
          .catch(() => db.execute(
            sql`SELECT id, projeto_id, numero, descricao, data_revisao, motivo, responsavel, aprovado_por, status, observacao, is_baseline, consolidado, criado_em FROM planejamento_revisoes WHERE projeto_id = ${input.id} ORDER BY numero ASC`
          ).then((r: any) => Array.isArray(r) ? r : (r?.rows ?? []))),
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

  cancelarRevisao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem cancelar revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.isBaseline) throw new Error("O Baseline não pode ser cancelado.");
      await db.update(planejamentoRevisoes)
        .set({ status: "cancelada" })
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  excluirRevisao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem excluir revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.isBaseline) throw new Error("O Baseline não pode ser excluído.");

      // Garante que só a revisão de maior número pode ser excluída
      const todasNaoProjeto = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, rev.projetoId!))
        .orderBy(desc(planejamentoRevisoes.numero));
      const naoBaselines = todasNaoProjeto.filter(r => !r.isBaseline);
      if (!naoBaselines.length || naoBaselines[0].id !== input.id) {
        throw new Error("Apenas a revisão mais recente pode ser excluída. Exclua em ordem decrescente.");
      }

      // Apaga avanços da revisão (evita registros orfãos)
      await db.delete(planejamentoAvancos)
        .where(eq(planejamentoAvancos.revisaoId, input.id));
      await db.delete(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.id));
      await db.delete(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  // ── Transferir avanços da revisão anterior para nova revisão (herança de progresso) ─
  transferirAvancosParaNovaRevisao: protectedProcedure
    .input(z.object({ novaRevisaoId: z.number(), projetoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [novaRevisao] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.novaRevisaoId));
      if (!novaRevisao) return { transferidas: 0 };

      // Revisão aprovada imediatamente anterior (número menor, não cancelada)
      const anteriores = await db.select().from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.projetoId, input.projetoId),
          lt(planejamentoRevisoes.numero, novaRevisao.numero!),
          ne(planejamentoRevisoes.status, "cancelada"),
        ))
        .orderBy(desc(planejamentoRevisoes.numero));

      // ── Atividades das duas revisões (para diff + transferência de avanços) ──
      const [atvsNova, atvsAnterior] = await Promise.all([
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.novaRevisaoId)),
        anteriores.length
          ? db.select().from(planejamentoAtividades)
              .where(eq(planejamentoAtividades.revisaoId, anteriores[0].id))
          : Promise.resolve([]),
      ]);

      // ── Diff automático de alterações entre revisões ──────────────────────
      type DiffItem  = { eapCodigo: string; nome: string };
      type DiffChange = { campo: string; de: string | null; para: string | null };
      type DiffAlterada = DiffItem & { mudancas: DiffChange[] };

      const adicionadas: DiffItem[] = [];
      const removidas:   DiffItem[] = [];
      const alteradas:   DiffAlterada[] = [];

      if (atvsAnterior.length > 0) {
        const mapAnt = new Map(atvsAnterior.map(a => [a.eapCodigo ?? `_${a.id}`, a]));
        const mapNova = new Map(atvsNova.map(a => [a.eapCodigo ?? `_${a.id}`, a]));

        for (const [eap, ant] of mapAnt.entries()) {
          if (!mapNova.has(eap)) removidas.push({ eapCodigo: eap, nome: ant.nome });
        }
        for (const [eap, nova] of mapNova.entries()) {
          if (!mapAnt.has(eap)) {
            adicionadas.push({ eapCodigo: eap, nome: nova.nome });
          } else {
            const ant = mapAnt.get(eap)!;
            const mudancas: DiffChange[] = [];
            if (ant.nome !== nova.nome)
              mudancas.push({ campo: "Nome", de: ant.nome, para: nova.nome });
            if (ant.dataInicio !== nova.dataInicio)
              mudancas.push({ campo: "Início", de: ant.dataInicio, para: nova.dataInicio });
            if (ant.dataFim !== nova.dataFim)
              mudancas.push({ campo: "Fim", de: ant.dataFim, para: nova.dataFim });
            if (ant.duracaoDias !== nova.duracaoDias)
              mudancas.push({ campo: "Duração (dias)", de: String(ant.duracaoDias ?? ""), para: String(nova.duracaoDias ?? "") });
            if (String(ant.pesoFinanceiro ?? "0") !== String(nova.pesoFinanceiro ?? "0"))
              mudancas.push({ campo: "Peso financeiro", de: ant.pesoFinanceiro, para: nova.pesoFinanceiro });
            if (mudancas.length) alteradas.push({ eapCodigo: eap, nome: nova.nome, mudancas });
          }
        }

        const diff = { adicionadas, removidas, alteradas };
        await db.update(planejamentoRevisoes)
          .set({ diferencas: JSON.stringify(diff) })
          .where(eq(planejamentoRevisoes.id, input.novaRevisaoId));
      }

      // ── Transferência de avanços ──────────────────────────────────────────
      if (!anteriores.length) return { transferidas: 0 };
      const revisaoAnterior = anteriores[0];

      const avancosAnteriores = await db.select().from(planejamentoAvancos)
        .where(eq(planejamentoAvancos.revisaoId, revisaoAnterior.id))
        .orderBy(asc(planejamentoAvancos.semana));
      if (!avancosAnteriores.length) return { transferidas: 0 };

      const eapToIdAnt = new Map<string, number>();
      for (const a of atvsAnterior) if (a.eapCodigo) eapToIdAnt.set(a.eapCodigo, a.id);
      const eapToIdNovo = new Map<string, number>();
      for (const a of atvsNova) if (a.eapCodigo) eapToIdNovo.set(a.eapCodigo, a.id);

      const idAntToIdNovo = new Map<number, number>();
      for (const [eap, idAnt] of eapToIdAnt.entries()) {
        const idNovo = eapToIdNovo.get(eap);
        if (idNovo) idAntToIdNovo.set(idAnt, idNovo);
      }

      const novosAvancos = avancosAnteriores
        .filter(av => idAntToIdNovo.has(av.atividadeId))
        .map(av => ({
          projetoId:           av.projetoId,
          atividadeId:         idAntToIdNovo.get(av.atividadeId)!,
          revisaoId:           input.novaRevisaoId,
          semana:              av.semana,
          percentualAcumulado: av.percentualAcumulado,
          percentualSemanal:   av.percentualSemanal,
          observacao:          av.observacao,
          criadoPor:           av.criadoPor,
        }));

      if (novosAvancos.length) await db.insert(planejamentoAvancos).values(novosAvancos);
      return { transferidas: novosAvancos.length };
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
        id:                  z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        eapCodigo:           z.string().nullish(),
        nome:                z.string(),
        nivel:               z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        dataInicio:          z.string().nullish(),
        dataFim:             z.string().nullish(),
        duracaoDias:         z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        predecessora:        z.string().nullish(),
        pesoFinanceiro:      z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        recursoPrincipal:    z.string().nullish(),
        quantidadePlanejada: z.preprocess(v => v == null ? null : Number(v), z.number().nullish()),
        unidade:             z.string().nullish(),
        ordem:               z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        isGrupo:             z.boolean().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = input.atividades.map((a, i) => ({
        revisaoId:           input.revisaoId,
        projetoId:           input.projetoId,
        eapCodigo:           a.eapCodigo ?? null,
        nome:                a.nome ?? "",
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
      }));

      await db.transaction(async (tx) => {
        await tx.delete(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));
        const CHUNK = 100;
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(planejamentoAtividades).values(rows.slice(i, i + CHUNK));
        }
      });

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

  // Retorna todas as semanas que têm qualquer avanço registrado no projeto (qualquer revisão)
  listarSemanasComAvanco: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .selectDistinct({ semana: planejamentoAvancos.semana })
        .from(planejamentoAvancos)
        .where(eq(planejamentoAvancos.projetoId, input.projetoId))
        .orderBy(asc(planejamentoAvancos.semana));
      return rows.map(r => r.semana);
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [refis] = await db.select().from(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      if (!refis) throw new TRPCError({ code: "NOT_FOUND", message: "REFIS não encontrado." });
      if (refis.status === "consolidado") {
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
        if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem cancelar um REFIS consolidado." });
      }
      await db.delete(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  consolidarRefis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [refis] = await db.select().from(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      if (!refis) throw new TRPCError({ code: "NOT_FOUND", message: "REFIS não encontrado." });
      await db.update(planejamentoRefis).set({
        status: "consolidado",
        consolidadoPor: ctx.user.name || ctx.user.email,
        consolidadoEm: new Date(),
      }).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  cancelarConsolidacaoRefis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem cancelar a consolidação." });
      const db = await getDb();
      await db.update(planejamentoRefis).set({
        status: "emitido",
        canceladoPor: ctx.user.name || ctx.user.email,
        canceladoEm: new Date(),
        consolidadoPor: null,
        consolidadoEm: null,
      }).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  consolidarRevisao: protectedProcedure
    .input(z.object({ revisaoId: z.number(), consolidado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(planejamentoRevisoes)
        .set({ consolidado: input.consolidado })
        .where(eq(planejamentoRevisoes.id, input.revisaoId));
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

  // Retorna a curva planejada de cada revisão aprovada do projeto (para toggles na Curva S)
  getCurvasTodasRevisoes: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const revisoes = await db.select().from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.projetoId, input.projetoId),
          eq(planejamentoRevisoes.status, "aprovada"),
        ))
        .orderBy(asc(planejamentoRevisoes.numero));

      function gerarCurva(ativs: any[]) {
        const folhas = ativs.filter((a: any) => !a.isGrupo && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];
        const pesoBruto = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
        const usarIgual = pesoBruto === 0;
        const pesoTotal = usarIgual ? folhas.length : pesoBruto;
        const dates: Map<string, number> = new Map();
        folhas.forEach((a: any) => {
          const inicio  = new Date(a.dataInicio);
          const fim     = new Date(a.dataFim);
          const dur     = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (7 * 86400000)));
          const pAtiv   = usarIgual ? 1 : n(a.pesoFinanceiro);
          const semPeso = pAtiv / dur / pesoTotal * 100;
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

      const resultado = await Promise.all(revisoes.map(async rev => {
        const ativs = await db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, rev.id));
        return {
          revisaoId:  rev.id,
          numero:     rev.numero,
          descricao:  rev.descricao ?? `Rev. ${String(rev.numero).padStart(2, "0")}`,
          isBaseline: rev.isBaseline,
          curva:      gerarCurva(ativs),
        };
      }));

      return resultado;
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
            a.data_inicio::text                    AS data_inicio,
            a.data_fim::text                       AS data_fim
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
            a.data_inicio::text                    AS data_inicio,
            a.data_fim::text                       AS data_fim,
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

      // Busca breakdown BDI do orçamento vinculado ao projeto
      const bdiRes = await db.execute(sql`
        SELECT DISTINCT ON (ob.codigo)
          ob.codigo,
          ob.percentual::float8          AS percentual,
          ob."valorAbsoluto"::float8     AS valor_absoluto
        FROM orcamento_bdi ob
        JOIN planejamento_projetos p ON p.orcamento_id = ob."orcamentoId"
        WHERE p.id = ${input.projetoId}
          AND ob.codigo IN ('CI','DI-01','DI-02','DI-03','DI-04','DI-05','DI-06','DI-07','DI-08','DI-10','L-01')
        ORDER BY ob.codigo, ob.id
      `);
      const bdiMap: Record<string, { pct: number; val: number }> = {};
      (bdiRes.rows as any[]).forEach(r => {
        bdiMap[String(r.codigo)] = {
          pct: Number(r.percentual)    || 0,
          val: Number(r.valor_absoluto) || 0,
        };
      });
      const bdiBreakdown = {
        ci:         bdiMap['CI']?.val ?? 0,   // valor absoluto do Custo Indireto da Obra
        admCentral: bdiMap['DI-01']?.pct ?? 0, // % de Venda
        impostos:   ['DI-02','DI-03','DI-04','DI-05','DI-06','DI-07']
                      .reduce((s, c) => s + (bdiMap[c]?.pct ?? 0), 0), // soma % tributos sobre Venda
        risco:      bdiMap['DI-08']?.pct ?? 0, // % de Venda
        comissao:   bdiMap['DI-10']?.pct ?? 0, // % de Venda
        lucro:      bdiMap['L-01']?.pct ?? 0,  // % de Venda (L-01 Lucro Bruto)
      };

      return {
        itens,
        totalVenda, totalMeta, totalCusto, totalMat, totalMdo,
        valorBase: valorVenda,
        valorBaseMeta: valorMeta,
        valorBaseCusto: valorCusto,
        bdiBreakdown,
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

      const updateData = {
        tipoMedicao:       data.tipoMedicao,
        diaCorte:          data.diaCorte,
        entrada:           data.entrada,
        numeroParcelas:    data.numeroParcelas,
        inicioFaturamento: data.inicioFaturamento,
        sinalPct:          data.sinalPct,
        retencaoPct:       data.retencaoPct,
        dataInicioObra:    data.dataInicioObra,
        bloqueado:         false,
        atualizadoEm:      data.atualizadoEm,
      };

      await db.insert(planejamentoMedicaoConfig)
        .values(data)
        .onConflictDoUpdate({
          target: planejamentoMedicaoConfig.projetoId,
          set: updateData,
        });

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

  // ── Equipamentos disponíveis no almoxarifado / patrimônio ────────────────
  buscarEquipamentosDisponiveis: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      termos:     z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Busca itens do almoxarifado ativos
      const almoxRows = await db.select({
        id:               almoxarifadoItens.id,
        nome:             almoxarifadoItens.nome,
        categoria:        almoxarifadoItens.categoria,
        quantidadeAtual:  almoxarifadoItens.quantidadeAtual,
        quantidadeMinima: almoxarifadoItens.quantidadeMinima,
        unidade:          almoxarifadoItens.unidade,
        codigoInterno:    almoxarifadoItens.codigoInterno,
      })
      .from(almoxarifadoItens)
      .where(and(
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ));

      // Busca cadastro de equipamentos (patrimônio)
      const equipRows = await db.select({
        id:                equipment.id,
        nome:              equipment.nome,
        tipoEquipamento:   equipment.tipoEquipamento,
        statusEquipamento: equipment.statusEquipamento,
        localizacao:       equipment.localizacao,
        responsavel:       equipment.responsavel,
      })
      .from(equipment)
      .where(eq(equipment.companyId, input.companyId));

      return {
        almoxarifado: almoxRows.map(r => ({
          id:            r.id,
          nome:          r.nome,
          categoria:     r.categoria ?? null,
          qtdDisponivel: parseFloat(r.quantidadeAtual ?? "0"),
          qtdMinima:     parseFloat(r.quantidadeMinima ?? "0"),
          unidade:       r.unidade,
          codigo:        r.codigoInterno ?? null,
          disponivel:    parseFloat(r.quantidadeAtual ?? "0") > 0,
        })),
        patrimonio: equipRows.map(r => ({
          id:        r.id,
          nome:      r.nome,
          tipo:      r.tipoEquipamento ?? null,
          status:    r.statusEquipamento,
          local:     r.localizacao ?? null,
          disponivel: r.statusEquipamento === "Ativo" || r.statusEquipamento === "Disponível",
        })),
      };
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

  // ── Atividades por Obra (para seleção no formulário de HE) ─────────────────
  getAtividadesForObra: protectedProcedure
    .input(z.object({ obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Buscar projeto da obra
      const [projeto] = await db.select({ id: planejamentoProjetos.id, nome: planejamentoProjetos.nome })
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.obraId, input.obraId))
        .limit(1);
      if (!projeto) return [];

      // Buscar revisão mais recente (baseline ou última)
      const revisoes = await db.select()
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, projeto.id))
        .orderBy(desc(planejamentoRevisoes.criadoEm));
      if (!revisoes.length) return [];

      const revisao = revisoes.find(r => r.isBaseline) || revisoes[0];

      // Buscar atividades da revisão
      const atividades = await db.select({
        id: planejamentoAtividades.id,
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
        nivel: planejamentoAtividades.nivel,
        dataInicio: planejamentoAtividades.dataInicio,
        dataFim: planejamentoAtividades.dataFim,
        isGrupo: planejamentoAtividades.isGrupo,
        recursoPrincipal: planejamentoAtividades.recursoPrincipal,
        pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
      })
        .from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.projetoId, projeto.id),
          eq(planejamentoAtividades.revisaoId, revisao.id),
        ))
        .orderBy(asc(planejamentoAtividades.ordem));

      // Buscar maior percentual acumulado por atividade para filtrar as já concluídas (100%)
      const avancosMaxRaw = await db.execute(sql`
        SELECT atividade_id, MAX(CAST(percentual_acumulado AS numeric)) as max_pct
        FROM planejamento_avancos
        WHERE projeto_id = ${projeto.id}
        GROUP BY atividade_id
      `);
      const avancosMax = (avancosMaxRaw as any)?.rows ?? avancosMaxRaw ?? [];
      const avancoPct: Record<number, number> = {};
      for (const row of avancosMax) {
        avancoPct[row.atividade_id] = parseFloat(row.max_pct || "0");
      }

      // Filtrar: remover atividades com 100% de avanço (concluídas) e grupos
      const atividadesFiltradas = atividades
        .filter((a: any) => !a.isGrupo)
        .filter((a: any) => (avancoPct[a.id] ?? 0) < 100)
        .map((a: any) => ({ ...a, avancoPct: avancoPct[a.id] ?? 0 }));

      return { projeto, revisao, atividades: atividadesFiltradas };
    }),

  // ── Custo RH por projeto (HEs vinculadas às atividades) ────────────────────
  getHECustosByProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { atividades: [], hes: [], totalCustoPrevisto: 0, totalCustoRealizado: 0 };

      // Buscar projeto + obra
      const [projeto] = await db.select()
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId));
      if (!projeto) return { atividades: [], hes: [], totalCustoPrevisto: 0, totalCustoRealizado: 0 };

      // Buscar revisão ativa
      const revisoes = await db.select()
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.criadoEm));
      const revisao = revisoes.find(r => r.isBaseline) || revisoes[0];

      // Buscar atividades
      const atividades = revisao
        ? await db.select().from(planejamentoAtividades)
            .where(and(
              eq(planejamentoAtividades.projetoId, input.projetoId),
              eq(planejamentoAtividades.revisaoId, revisao.id),
            ))
            .orderBy(asc(planejamentoAtividades.ordem))
        : [];

      // Buscar HEs vinculadas à obra do projeto
      let hes: any[] = [];
      if (projeto.obraId) {
        hes = await db.select({
          id: heSolicitacoes.id,
          dataSolicitacao: heSolicitacoes.dataSolicitacao,
          horaInicio: heSolicitacoes.horaInicio,
          horaFim: heSolicitacoes.horaFim,
          status: heSolicitacoes.status,
          motivo: heSolicitacoes.motivo,
          planejamentoAtividadeId: heSolicitacoes.planejamentoAtividadeId,
          solicitadoPor: heSolicitacoes.solicitadoPor,
          aprovadoEm: heSolicitacoes.aprovadoEm,
        }).from(heSolicitacoes)
          .where(and(
            eq(heSolicitacoes.obraId, projeto.obraId),
          ))
          .orderBy(desc(heSolicitacoes.dataSolicitacao));

        // Para cada HE, buscar funcionários com salário
        for (const he of hes as any[]) {
          const funcs = await db.select({
            employeeId: heSolicitacaoFuncionarios.employeeId,
            nomeCompleto: employees.nomeCompleto,
            funcao: employees.funcao,
            valorHora: employees.valorHora,
            salarioBase: employees.salarioBase,
          }).from(heSolicitacaoFuncionarios)
            .leftJoin(employees, eq(heSolicitacaoFuncionarios.employeeId, employees.id))
            .where(eq(heSolicitacaoFuncionarios.solicitacaoId, he.id));

          // Calcular custo
          const calcHoras = (ini: string, fim: string) => {
            if (!ini || !fim) return 0;
            const [h1, m1] = ini.split(":").map(Number);
            const [h2, m2] = fim.split(":").map(Number);
            const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
            return mins > 0 ? mins / 60 : 0;
          };
          const horas = calcHoras(he.horaInicio || "", he.horaFim || "");
          const diaSemana = he.dataSolicitacao ? new Date(he.dataSolicitacao + "T12:00:00").getDay() : -1;
          const percentHE = (diaSemana === 0 || diaSemana === 6) ? 100 : 50;

          let custoPrevisto = 0;
          for (const f of funcs) {
            let vh: number | null = null;
            if (f.valorHora) { const v = parseFloat(String(f.valorHora).replace(",", ".")); if (!isNaN(v) && v > 0) vh = v; }
            if (!vh && f.salarioBase) { const s = parseFloat(String(f.salarioBase).replace(",", ".")); if (!isNaN(s) && s > 0) vh = s / 220; }
            if (vh && horas > 0) custoPrevisto += vh * (1 + percentHE / 100) * horas;
          }

          (he as any).funcionarios = funcs;
          (he as any).horas = horas;
          (he as any).percentHE = percentHE;
          (he as any).custoPrevisto = custoPrevisto;
          (he as any).numFuncionarios = funcs.length;
        }
      }

      const totalCustoPrevisto = (hes as any[]).reduce((s, h) => s + (h.custoPrevisto || 0), 0);
      const totalCustoRealizado = (hes as any[]).filter(h => h.status === "aprovada").reduce((s, h) => s + (h.custoPrevisto || 0), 0);

      return { atividades, hes, totalCustoPrevisto, totalCustoRealizado, projeto };
    }),

  // ── Simulador de Cronograma por Orçamento Mensal ─────────────────────────
  simularCronograma: protectedProcedure
    .input(z.object({
      revisaoId:      z.number(),
      projetoId:      z.number(),
      orcamentoMensal: z.number().positive(),
      valorTotal:     z.number().positive(),
      dataInicio:     z.string(), // YYYY-MM-DD
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Buscar todas as atividades folha da revisão
      const rows = await db.select().from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.revisaoId, input.revisaoId),
          eq(planejamentoAtividades.isGrupo, false),
        ))
        .orderBy(asc(planejamentoAtividades.ordem));

      if (rows.length === 0) throw new Error("Nenhuma atividade folha encontrada nesta revisão.");

      // 2. Verificar se existem predecessoras definidas
      const temPredecessoras = rows.some(a => a.predecessora && a.predecessora.trim() !== "");

      // 3. Sequência das atividades
      let sequencia: typeof rows = [];

      if (temPredecessoras) {
        // Usar predecessoras existentes: ordenação topológica (Kahn)
        const byEap = new Map<string, typeof rows[0]>();
        rows.forEach(a => byEap.set(a.eapCodigo || String(a.id), a));

        const inDeg = new Map<string, number>();
        const adj   = new Map<string, string[]>(); // eap → [successors]
        rows.forEach(a => { const k = a.eapCodigo || String(a.id); inDeg.set(k, 0); adj.set(k, []); });

        rows.forEach(a => {
          if (!a.predecessora) return;
          const k = a.eapCodigo || String(a.id);
          a.predecessora.split(/[,;]/).map(s => s.trim()).forEach(pk => {
            if (adj.has(pk)) {
              adj.get(pk)!.push(k);
              inDeg.set(k, (inDeg.get(k) || 0) + 1);
            }
          });
        });

        const q = rows.filter(a => (inDeg.get(a.eapCodigo || String(a.id)) || 0) === 0);
        const visited = new Set<number>();
        while (q.length > 0) {
          const node = q.shift()!;
          if (visited.has(node.id)) continue;
          visited.add(node.id);
          sequencia.push(node);
          const k = node.eapCodigo || String(node.id);
          (adj.get(k) || []).forEach(sk => {
            inDeg.set(sk, (inDeg.get(sk) || 0) - 1);
            if ((inDeg.get(sk) || 0) === 0) {
              const next = byEap.get(sk);
              if (next && !visited.has(next.id)) q.push(next);
            }
          });
        }
        // Append restantes (ciclos)
        rows.forEach(a => { if (!visited.has(a.id)) sequencia.push(a); });

      } else {
        // Sem predecessoras: pedir sequência à IA (Claude)
        try {
          const { invokeLLM } = await import("../_core/llm");
          const listaAtiv = rows.map(a =>
            `{"id":${a.id},"eap":"${a.eapCodigo || "-"}","nome":"${a.nome.replace(/"/g, "'")}"}`
          ).join(",\n");

          const prompt = `Você é um especialista em construção civil brasileiro com domínio em planejamento de obras.

Abaixo está uma lista de atividades de uma obra de construção civil. Analise os nomes e códigos EAP de cada atividade e ordene-as em sequência construtiva lógica, respeitando a ordem natural da construção civil brasileira:

1. Serviços preliminares / mobilização / canteiro
2. Terraplenagem / escavação / fundações
3. Estrutura (concreto, formas, armação)
4. Alvenaria / vedação
5. Cobertura / telhado
6. Instalações hidrossanitárias (prumadas, ramais)
7. Instalações elétricas / SPDA / cabeamento
8. Instalações especiais (ar condicionado, gás, etc.)
9. Revestimento interno (reboco, chapisco, emboço)
10. Revestimento externo (fachada)
11. Contrapiso / impermeabilização
12. Revestimento de piso (cerâmica, porcelanato, etc.)
13. Esquadrias (portas, janelas, vidros)
14. Louças e metais
15. Pintura interna e externa
16. Limpeza / entrega

Atividades da obra (JSON):
[${listaAtiv}]

Retorne APENAS um JSON válido com a lista de IDs em ordem de execução. Cada atividade deve aparecer exatamente uma vez. Formato obrigatório:
{"ordem":[id1,id2,id3,...]}`;

          const result = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
            maxTokens: 4096,
          });

          const text = typeof result.choices[0]?.message?.content === "string"
            ? result.choices[0].message.content
            : "";

          if (text) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const clean = jsonMatch ? jsonMatch[0] : text;
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed.ordem) && parsed.ordem.length > 0) {
              const idOrder = parsed.ordem as number[];
              const rowMap = new Map(rows.map(r => [r.id, r]));
              const sorted: typeof rows = [];
              idOrder.forEach(id => { const r = rowMap.get(id); if (r) sorted.push(r); });
              rows.forEach(r => { if (!sorted.find(s => s.id === r.id)) sorted.push(r); });
              sequencia = sorted;
            } else { sequencia = rows; }
          } else { sequencia = rows; }
        } catch (e) {
          console.error("[Simulador] Erro ao chamar IA:", e);
          sequencia = rows;
        }
      }

      // 4. Algoritmo guloso de distribuição mensal
      const getKey  = (a: typeof rows[0]) => a.eapCodigo || String(a.id);
      const getCusto = (a: typeof rows[0]) => (parseFloat(String(a.pesoFinanceiro ?? 0)) / 100) * input.valorTotal;

      // Build predecessor set for validation
      const predSet = new Map<number, Set<string>>();
      rows.forEach(a => {
        const preds = new Set<string>();
        if (a.predecessora) a.predecessora.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(p => preds.add(p));
        predSet.set(a.id, preds);
      });

      const meses: { mes: number; atividades: { id: number; nome: string; eapCodigo: string | null; pesoFinanceiro: number; duracaoDias: number; custo: number }[]; custoTotal: number }[] = [];
      let remaining = [...sequencia];
      const completedKeys = new Set<string>();
      let mesNum = 1;

      while (remaining.length > 0) {
        const mesAtivs: typeof sequencia = [];
        let mesCusto = 0;
        let progressed = false;

        // First pass: add activities that fit in budget with predecessors done
        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i];
          const preds = predSet.get(a.id) ?? new Set();
          const predsOk = [...preds].every(p => completedKeys.has(p));
          if (!predsOk) continue;

          const custo = getCusto(a);
          // Allow at least 1 per month even if over budget
          if (mesCusto + custo <= input.orcamentoMensal || mesAtivs.length === 0) {
            mesAtivs.push(a);
            mesCusto += custo;
            progressed = true;
          }
        }

        // Safety: if no progress (circular or stuck), force first available
        if (!progressed && remaining.length > 0) {
          mesAtivs.push(remaining[0]);
          mesCusto = getCusto(remaining[0]);
        }

        // Commit month
        mesAtivs.forEach(a => {
          completedKeys.add(getKey(a));
          remaining = remaining.filter(r => r.id !== a.id);
        });

        meses.push({
          mes: mesNum++,
          custoTotal: mesCusto,
          atividades: mesAtivs.map(a => ({
            id: a.id,
            nome: a.nome,
            eapCodigo: a.eapCodigo,
            pesoFinanceiro: parseFloat(String(a.pesoFinanceiro ?? 0)),
            duracaoDias: a.duracaoDias ?? 0,
            custo: getCusto(a),
          })),
        });

        if (mesNum > 500) break; // Safety valve
      }

      return {
        meses,
        totalMeses: meses.length,
        usouIA: !temPredecessoras,
        temPredecessoras,
        orcamentoMensal: input.orcamentoMensal,
        valorTotal: input.valorTotal,
        dataInicio: input.dataInicio,
      };
    }),

  // ── Adotar Simulação como Cronograma Oficial ──────────────────────────────
  adotarSimulacao: protectedProcedure
    .input(z.object({
      projetoId:   z.number(),
      revisaoId:   z.number(),
      dataInicio:  z.string(),
      meses: z.array(z.object({
        mes: z.number(),
        atividadeIds: z.array(z.number()),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Buscar todas as atividades da revisão (folha + grupo)
      const todasAtivs = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      // Calcular datas por atividade com base no mês
      const di = new Date(input.dataInicio + "T12:00:00");
      const atividadeDatas = new Map<number, { dataInicio: string; dataFim: string }>();

      input.meses.forEach(({ mes, atividadeIds }) => {
        const mesStart = new Date(di);
        mesStart.setMonth(mesStart.getMonth() + (mes - 1));
        const mesEnd   = new Date(mesStart);
        mesEnd.setMonth(mesEnd.getMonth() + 1);
        mesEnd.setDate(mesEnd.getDate() - 1);

        // Distribute activities sequentially within the month
        let cursor = new Date(mesStart);
        atividadeIds.forEach(id => {
          const atv = todasAtivs.find(a => a.id === id);
          const dur = Math.max(1, atv?.duracaoDias ?? 1);
          const start = new Date(cursor);
          const end   = new Date(cursor);
          end.setDate(end.getDate() + dur - 1);
          // Don't go past the month end
          const clampedEnd = end > mesEnd ? mesEnd : end;
          atividadeDatas.set(id, {
            dataInicio: start.toISOString().split("T")[0],
            dataFim:    clampedEnd.toISOString().split("T")[0],
          });
          cursor = new Date(clampedEnd);
          cursor.setDate(cursor.getDate() + 1);
        });
      });

      // Criar nova revisão com +1 no número
      const revisaoAtual = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.revisaoId))
        .then(r => r[0]);
      if (!revisaoAtual) throw new Error("Revisão não encontrada.");

      const [novaRevisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:   input.projetoId,
        numero:      (revisaoAtual.numero ?? 0) + 1,
        descricao:   "Cronograma gerado pelo Simulador de Orçamento Mensal",
        status:      "aprovada",
        criadoPor:   ctx.user?.name || "Sistema",
        isBaseline:  false,
        consolidado: false,
      } as any).returning({ id: planejamentoRevisoes.id });

      if (!novaRevisao) throw new Error("Falha ao criar revisão.");

      // Copiar atividades com novas datas
      const rows = todasAtivs.map((a, i) => {
        const datas = atividadeDatas.get(a.id);
        return {
          revisaoId:           novaRevisao.id,
          projetoId:           input.projetoId,
          eapCodigo:           a.eapCodigo,
          nome:                a.nome,
          nivel:               a.nivel,
          dataInicio:          datas?.dataInicio ?? a.dataInicio,
          dataFim:             datas?.dataFim    ?? a.dataFim,
          duracaoDias:         a.duracaoDias,
          predecessora:        a.predecessora,
          pesoFinanceiro:      a.pesoFinanceiro,
          recursoPrincipal:    a.recursoPrincipal,
          quantidadePlanejada: a.quantidadePlanejada,
          unidade:             a.unidade,
          ordem:               a.ordem ?? i,
          isGrupo:             a.isGrupo,
        };
      });

      const CHUNK = 100;
      await db.transaction(async tx => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(planejamentoAtividades).values(rows.slice(i, i + CHUNK) as any);
        }
      });

      return { novaRevisaoId: novaRevisao.id };
    }),

  // ── Gerar Cronograma a partir do Orçamento (IA) ───────────────────────────
  gerarCronogramaDoOrcamento: protectedProcedure
    .input(z.object({
      projetoId:       z.number(),
      revisaoId:       z.number(),
      orcamentoMensal: z.number().positive(),
      valorTotal:      z.number().positive(),
      dataInicio:      z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Obter o projeto e seu orçamento vinculado
      const projeto = await db.select().from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId))
        .then(r => r[0]);
      if (!projeto) throw new Error("Projeto não encontrado.");
      if (!projeto.orcamentoId) throw new Error("Este projeto não tem orçamento vinculado.");

      // 2. Buscar itens do orçamento (apenas folhas com custo > 0)
      const itens = await db.select({
        eapCodigo:     orcamentoItens.eapCodigo,
        descricao:     orcamentoItens.descricao,
        unidade:       orcamentoItens.unidade,
        quantidade:    orcamentoItens.quantidade,
        custoTotal:    orcamentoItens.custoTotal,
        custoTotalMat: orcamentoItens.custoTotalMat,
        custoTotalMdo: orcamentoItens.custoTotalMdo,
        tipo:          orcamentoItens.tipo,
      })
      .from(orcamentoItens)
      .where(and(
        eq(orcamentoItens.orcamentoId, projeto.orcamentoId),
        sql`${orcamentoItens.custoTotal} > 0`,
        sql`(${orcamentoItens.tipo} IS NULL OR ${orcamentoItens.tipo} != 'grupo')`,
      ))
      .orderBy(asc(orcamentoItens.eapCodigo));

      if (itens.length === 0) throw new Error("O orçamento vinculado não tem itens cadastrados.");

      // Calcular ratios Mat/MdO globais a partir do orçamento
      const totalMatOrc = itens.reduce((s, i) => s + parseFloat(String(i.custoTotalMat || 0)), 0);
      const totalMdoOrc = itens.reduce((s, i) => s + parseFloat(String(i.custoTotalMdo || 0)), 0);
      const totalGeral  = itens.reduce((s, i) => s + parseFloat(String(i.custoTotal    || 0)), 0);
      const ratioMat    = totalGeral > 0 ? totalMatOrc / totalGeral : 0;
      const ratioMdo    = totalGeral > 0 ? totalMdoOrc / totalGeral : 0;

      // 3. Chamar IA para gerar o cronograma
      const { invokeLLM } = await import("../_core/llm");

      const listaItens = itens.map(i => {
        const custo    = parseFloat(String(i.custoTotal    || 0));
        const custoMat = parseFloat(String(i.custoTotalMat || 0));
        const custoMdo = parseFloat(String(i.custoTotalMdo || 0));
        const pct      = input.valorTotal > 0 ? ((custo / input.valorTotal) * 100).toFixed(2) : "0";
        const matStr   = custoMat > 0 ? ` MT:R$${custoMat.toFixed(2)}` : "";
        const mdoStr   = custoMdo > 0 ? ` MO:R$${custoMdo.toFixed(2)}` : "";
        return `EAP:${i.eapCodigo || "?"} | ${i.descricao} | ${i.unidade || "vb"} | R$${custo.toFixed(2)} (${pct}% do total)${matStr}${mdoStr}`;
      }).join("\n");

      const valorFmt  = input.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const mensalFmt = input.orcamentoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const mesesEst  = Math.ceil(input.valorTotal / input.orcamentoMensal);

      const prompt = `Você é um dos maiores especialistas em planejamento de obras de construção civil do Brasil, com domínio em:
- Método do Caminho Crítico (CPM/PERT)
- Linha de Balanço (LOB) e Last Planner System de Glenn Ballard
- Metodologias de Harold Kerzner, Gregory Horine e Aldo Dórea Mattos
- NBR 12.741, diretrizes do SINDUSCON e sequência construtiva da ABNT
- Programação de obras residenciais, comerciais e industriais brasileiras

MISSÃO: Gerar um cronograma de obra COMPLETO baseado nos itens do orçamento fornecidos.

PARÂMETROS DA OBRA:
- Valor total: ${valorFmt}
- Desembolso máximo mensal: ${mensalFmt}
- Prazo estimado: ~${mesesEst} meses
- Data de início: ${input.dataInicio}

ITENS DO ORÇAMENTO (EAP | Descrição | Unidade | Custo):
${listaItens}

REGRAS OBRIGATÓRIAS DE SEQUÊNCIA CONSTRUTIVA (respeitar rigorosamente):
1. SERVIÇOS PRELIMINARES: mobilização, canteiro, tapumes, instalações provisórias (sempre primeiro)
2. TERRAPLENAGEM: escavação, aterro, compactação, drenagem
3. FUNDAÇÕES: estacas, blocos, vigas baldrames, radier, cortina de contenção
4. ESTRUTURA: pilares → vigas → lajes (fôrmas, armação, concretagem, cura) — fase mais longa
5. ALVENARIA E VEDAÇÃO: paredes externas e internas, shafts
6. COBERTURA: estrutura de telhado, telhas, calhas, rufos, impermeabilização
7. INSTALAÇÕES HIDROSSANITÁRIAS: prumadas, ramais, caixas sifonadas, reservatório
8. INSTALAÇÕES ELÉTRICAS: eletrodutos, cabeamento, quadros, SPDA, telecomunicações
9. INSTALAÇÕES ESPECIAIS: ar-condicionado, gás, elevadores (quando presentes)
10. REVESTIMENTO INTERNO: chapisco, reboco, emboço (paredes e tetos) — iniciar após estrutura seca
11. REVESTIMENTO EXTERNO: fachada, argamassa texturizada, pastilhas, pintura externa
12. CONTRAPISO E IMPERMEABILIZAÇÃO: regularização, manta, membrana, rodapé embutido
13. REVESTIMENTO DE PISOS: cerâmica, porcelanato, mármore, granitina, madeira
14. REVESTIMENTO DE PAREDES (áreas molhadas): azulejo, porcelanato, boxe
15. ESQUADRIAS: caixilhos de alumínio, portas de madeira, vidros, ferragens
16. LOUÇAS E METAIS: bacias, pias, torneiras, duchas, chuveiros
17. PINTURA: massa corrida, selador, látex/acrílica interna e externa, vernizes
18. SERVIÇOS FINAIS: limpeza final, regulagens, vistoria, entrega

REGRAS PARA DURAÇÃO (dias úteis):
- Pequeno (< 1% do valor total): 5-10 dias
- Médio (1-5%): 15-40 dias
- Grande (5-15%): 45-90 dias
- Major (> 15%): 90-150 dias
- Serviços de estrutura e fundações: sempre 30-120 dias dependendo do porte
- Instalações prediais: 20-60 dias
- Acabamentos (piso, revestimento, pintura): 15-45 dias cada

REGRAS PARA PESO FINANCEIRO:
- A soma dos pesoFinanceiro de TODAS as atividades folha (isGrupo: false) deve totalizar EXATAMENTE 100
- Distribuir proporcionalmente ao custo de cada item no orçamento
- Grupos (isGrupo: true) têm pesoFinanceiro: 0

REGRAS PARA PREDECESSORAS:
- Use o eapCodigo da atividade predecessora (ex: "1.1" ou "2")
- Respeite RIGOROSAMENTE a sequência construtiva
- Múltiplas predecessoras: separar por vírgula (ex: "2.1,2.2")
- Atividades que podem ser paralelas dentro da mesma fase: sem predecessoras entre si

REGRAS DE EAP:
- Grupos de fase (nivel 1, isGrupo: true): "1", "2", "3"... — sem atividade real, apenas agrupamento
- Atividades folha (nivel 2, isGrupo: false): "1.1", "1.2", "2.1"... — atividade real a executar
- Cada item do orçamento deve virar UMA atividade folha ou ser agrupado logicamente

Agrupe os itens do orçamento nas fases construtivas correspondentes. Se o orçamento tiver itens de fase que não existem (ex: não tem elevador), ignore essa fase.

Retorne APENAS um JSON válido, sem comentários, sem markdown:
{
  "atividades": [
    {"eapCodigo":"1","nome":"SERVIÇOS PRELIMINARES","nivel":1,"isGrupo":true,"duracaoDias":0,"predecessora":"","pesoFinanceiro":0,"unidade":""},
    {"eapCodigo":"1.1","nome":"Mobilização e canteiro de obras","nivel":2,"isGrupo":false,"duracaoDias":10,"predecessora":"","pesoFinanceiro":1.5,"unidade":"vb"},
    ...
  ]
}`;

      let atividadesGeradas: {
        eapCodigo: string; nome: string; nivel: number; isGrupo: boolean;
        duracaoDias: number; predecessora: string; pesoFinanceiro: number; unidade: string;
      }[] = [];

      // Extrai o JSON mais externo de uma string que pode ter markdown ou texto extra
      function extractFirstJson(text: string): string | null {
        const start = text.indexOf("{");
        if (start === -1) return null;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
          }
        }
        return null; // JSON não fechado (resposta truncada)
      }

      let rawText = "";
      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          maxTokens: 16000,
        });
        rawText = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content : "";
      } catch (e: any) {
        console.error("[gerarCronograma] Erro na chamada LLM:", e?.message ?? e);
        throw new Error(`Falha ao chamar IA: ${e?.message ?? "erro desconhecido"}`);
      }

      try {
        const jsonStr = extractFirstJson(rawText);
        if (!jsonStr) {
          console.error("[gerarCronograma] Resposta sem JSON:", rawText.slice(0, 300));
          throw new Error("A IA não retornou JSON válido.");
        }
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.atividades) && parsed.atividades.length > 0) {
          atividadesGeradas = parsed.atividades;
        } else {
          console.error("[gerarCronograma] JSON sem campo 'atividades':", jsonStr.slice(0, 300));
        }
      } catch (e: any) {
        console.error("[gerarCronograma] Erro ao parsear JSON:", e?.message, "| raw:", rawText.slice(0, 500));
        throw new Error(`Falha ao interpretar resposta da IA: ${e?.message ?? "JSON inválido"}`);
      }

      if (atividadesGeradas.length === 0) throw new Error("A IA não retornou atividades válidas.");

      // Normalizar pesos para somar 100
      const folhas = atividadesGeradas.filter(a => !a.isGrupo);
      const somaP = folhas.reduce((s, a) => s + (a.pesoFinanceiro || 0), 0);
      if (somaP > 0 && Math.abs(somaP - 100) > 0.5) {
        const fator = 100 / somaP;
        atividadesGeradas = atividadesGeradas.map(a =>
          a.isGrupo ? a : { ...a, pesoFinanceiro: parseFloat((a.pesoFinanceiro * fator).toFixed(4)) }
        );
      }

      // 4. Distribuição mensal (algoritmo guloso com topologia)
      const folhasSeq = atividadesGeradas.filter(a => !a.isGrupo);

      // ── Largest Remainder Method ───────────────────────────────────────────
      // Garante que a soma exata dos custos de TODAS as atividades = valorTotal,
      // sem perda de nenhum centavo, independente de erros de ponto flutuante.
      const totalCentsTarget = Math.round(input.valorTotal * 100);
      const lrmData = folhasSeq.map(a => {
        const exactCents = (a.pesoFinanceiro / 100) * input.valorTotal * 100;
        const floored    = Math.floor(exactCents);
        return { eapCodigo: a.eapCodigo, floored, frac: exactCents - floored };
      });
      const floorSum    = lrmData.reduce((s, x) => s + x.floored, 0);
      const remainder   = totalCentsTarget - floorSum; // qtd de atividades que recebem +1 centavo
      const bonusEaps   = new Set(
        [...lrmData].sort((a, b) => b.frac - a.frac).slice(0, remainder).map(x => x.eapCodigo)
      );
      const custoCentsMap = new Map<string, number>(); // eapCodigo → centavos exatos
      lrmData.forEach(x => custoCentsMap.set(x.eapCodigo, x.floored + (bonusEaps.has(x.eapCodigo) ? 1 : 0)));

      // getCusto agora retorna valor exato em BRL (sem sub-centavo)
      const getCusto = (a: typeof folhasSeq[0]) => (custoCentsMap.get(a.eapCodigo) ?? 0) / 100;

      // Topological sort by predecessora
      const byEap = new Map(folhasSeq.map(a => [a.eapCodigo, a]));
      const inDeg = new Map(folhasSeq.map(a => [a.eapCodigo, 0]));
      const adj   = new Map(folhasSeq.map(a => [a.eapCodigo, [] as string[]]));
      folhasSeq.forEach(a => {
        if (!a.predecessora) return;
        a.predecessora.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(pk => {
          if (adj.has(pk)) { adj.get(pk)!.push(a.eapCodigo); inDeg.set(a.eapCodigo, (inDeg.get(a.eapCodigo) || 0) + 1); }
        });
      });
      const q = folhasSeq.filter(a => (inDeg.get(a.eapCodigo) || 0) === 0);
      const visited = new Set<string>();
      const sequencia: typeof folhasSeq = [];
      while (q.length > 0) {
        const node = q.shift()!;
        if (visited.has(node.eapCodigo)) continue;
        visited.add(node.eapCodigo);
        sequencia.push(node);
        (adj.get(node.eapCodigo) || []).forEach(sk => {
          inDeg.set(sk, (inDeg.get(sk) || 0) - 1);
          if ((inDeg.get(sk) || 0) === 0) { const nxt = byEap.get(sk); if (nxt && !visited.has(sk)) q.push(nxt); }
        });
      }
      folhasSeq.forEach(a => { if (!visited.has(a.eapCodigo)) sequencia.push(a); });

      const predSet = new Map(folhasSeq.map(a => [a.eapCodigo, new Set(
        (a.predecessora || "").split(/[,;]/).map(s => s.trim()).filter(Boolean)
      )]));

      const meses: { mes: number; atividades: { eapCodigo: string; nome: string; pesoFinanceiro: number; duracaoDias: number; custo: number; custoMat: number; custoMdo: number }[]; custoTotal: number; custoMat: number; custoMdo: number }[] = [];
      let remaining = [...sequencia];
      const completedEaps = new Set<string>();
      let mesNum = 1;
      // Orçamento mensal em centavos inteiros para comparação exata
      const orcMensalCents = Math.round(input.orcamentoMensal * 100);

      while (remaining.length > 0) {
        const mesAtivs: typeof sequencia = [];
        let mesCustoCents = 0; // acumula em centavos inteiros — sem erro de ponto flutuante
        let progressed = false;

        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i];
          const preds = predSet.get(a.eapCodigo) ?? new Set<string>();
          if (![...preds].every(p => completedEaps.has(p))) continue;
          const cents = custoCentsMap.get(a.eapCodigo) ?? 0;
          if (mesCustoCents + cents <= orcMensalCents || mesAtivs.length === 0) {
            mesAtivs.push(a); mesCustoCents += cents; progressed = true;
          }
        }
        if (!progressed && remaining.length > 0) {
          mesAtivs.push(remaining[0]);
          mesCustoCents = custoCentsMap.get(remaining[0].eapCodigo) ?? 0;
        }

        mesAtivs.forEach(a => { completedEaps.add(a.eapCodigo); remaining = remaining.filter(r => r.eapCodigo !== a.eapCodigo); });

        // Custo do mês em centavos inteiros → converte para BRL exato
        const mesCusto = mesCustoCents / 100;

        const mesAtvsData = mesAtivs.map(a => {
          const cCents   = custoCentsMap.get(a.eapCodigo) ?? 0;
          const custo    = cCents / 100;
          // Custos Mat/Mdo por atividade: mat = floor(custo*ratioMat), mdo = custo - mat (residual exato)
          const custoMat = parseFloat((custo * ratioMat).toFixed(2));
          const custoMdo = parseFloat((custo - custoMat).toFixed(2));
          return { eapCodigo: a.eapCodigo, nome: a.nome, pesoFinanceiro: a.pesoFinanceiro, duracaoDias: a.duracaoDias, custo, custoMat, custoMdo };
        });

        // Totais Mat/Mdo do mês — Mdo é residual exato para bater com mesCusto
        const mesCustoMatCents = mesAtvsData.reduce((s, a) => s + Math.round(a.custoMat * 100), 0);
        const mesCustoMat      = mesCustoMatCents / 100;
        const mesCustoMdo      = parseFloat((mesCusto - mesCustoMat).toFixed(2));

        meses.push({ mes: mesNum++, custoTotal: mesCusto, custoMat: mesCustoMat, custoMdo: mesCustoMdo, atividades: mesAtvsData });
        if (mesNum > 500) break;
      }

      // ══════════════════════════════════════════════════════════════════════════
      // LEI DE OURO — A soma dos custoTotal de todos os meses DEVE ser
      // EXATAMENTE igual a valorTotal.  Qualquer centavo de diferença causada
      // por divisão de inteiros (/100) é absorvido pelo último mês.
      // Essa lei não pode ser violada: nenhum cronograma pode ter total diferente
      // do orçamento contratado.
      // ══════════════════════════════════════════════════════════════════════════
      if (meses.length > 0) {
        const somaCents = meses.reduce((s, m) => s + Math.round(m.custoTotal * 100), 0);
        const diffCents = totalCentsTarget - somaCents; // pode ser +1, -1, ou 0
        if (diffCents !== 0) {
          const ult = meses[meses.length - 1];
          ult.custoTotal = parseFloat(((Math.round(ult.custoTotal * 100) + diffCents) / 100).toFixed(2));
          // Ajustar também o Mdo do último mês (residual) para manter mat+mdo=custoTotal
          ult.custoMdo = parseFloat((ult.custoTotal - ult.custoMat).toFixed(2));
        }
        // Assert final (falha silenciosa no log, nunca explode para o usuário)
        const checkCents = meses.reduce((s, m) => s + Math.round(m.custoTotal * 100), 0);
        if (checkCents !== totalCentsTarget) {
          console.error(`[LEI DE OURO VIOLADA] soma=${checkCents} !== target=${totalCentsTarget} diff=${checkCents - totalCentsTarget}`);
        }
      }

      return { atividades: atividadesGeradas, meses, totalMeses: meses.length, valorTotal: input.valorTotal, orcamentoMensal: input.orcamentoMensal, dataInicio: input.dataInicio, ratioMat, ratioMdo };
    }),

  // ── Adotar Cronograma Gerado pela IA (cria atividades + datas) ────────────
  adotarCronogramaGerado: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      revisaoId:  z.number(),
      dataInicio: z.string(),
      atividades: z.array(z.object({
        eapCodigo:      z.string(),
        nome:           z.string(),
        nivel:          z.number(),
        isGrupo:        z.boolean(),
        duracaoDias:    z.number(),
        predecessora:   z.string(),
        pesoFinanceiro: z.number(),
        unidade:        z.string(),
        mes:            z.number(), // 0 = grupo sem mês direto
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const revisaoAtual = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.revisaoId)).then(r => r[0]);
      if (!revisaoAtual) throw new Error("Revisão não encontrada.");

      const [novaRevisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:   input.projetoId,
        numero:      (revisaoAtual.numero ?? 0) + 1,
        descricao:   "Cronograma gerado por IA a partir do orçamento",
        status:      "aprovada",
        criadoPor:   ctx.user?.name || "Sistema",
        isBaseline:  false,
        consolidado: false,
      } as any).returning({ id: planejamentoRevisoes.id });

      if (!novaRevisao) throw new Error("Falha ao criar revisão.");

      // Calcular datas por mês
      const di = new Date(input.dataInicio + "T12:00:00");
      const mesDatas = new Map<number, { start: Date; end: Date }>();
      for (let m = 1; m <= 600; m++) {
        const start = new Date(di); start.setMonth(start.getMonth() + (m - 1));
        const end   = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);
        mesDatas.set(m, { start, end });
      }

      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const rows = input.atividades.map((a, i) => {
        let dataInicio: string | null = null;
        let dataFim: string | null    = null;
        if (!a.isGrupo && a.mes > 0) {
          const md = mesDatas.get(a.mes);
          if (md) {
            dataInicio = fmt(md.start);
            const end  = new Date(md.start); end.setDate(end.getDate() + Math.max(1, a.duracaoDias) - 1);
            dataFim    = fmt(end > md.end ? md.end : end);
          }
        }
        return {
          revisaoId:      novaRevisao.id,
          projetoId:      input.projetoId,
          eapCodigo:      a.eapCodigo,
          nome:           a.nome,
          nivel:          a.nivel,
          dataInicio,
          dataFim,
          duracaoDias:    a.isGrupo ? null : Math.max(1, a.duracaoDias),
          predecessora:   a.predecessora || null,
          pesoFinanceiro: a.isGrupo ? null : a.pesoFinanceiro,
          unidade:        a.unidade || null,
          ordem:          i,
          isGrupo:        a.isGrupo,
        };
      });

      const CHUNK = 100;
      await db.transaction(async tx => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(planejamentoAtividades).values(rows.slice(i, i + CHUNK) as any);
        }
      });

      return { novaRevisaoId: novaRevisao.id, totalAtividades: rows.length };
    }),

  // ── Chat JULINHO no Simulador de Cronograma ────────────────────────────────
  chatSimuladorCronograma: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      messages:   z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      schedule: z.object({
        atividades:      z.array(z.any()),
        meses:           z.array(z.any()),
        valorTotal:      z.number(),
        orcamentoMensal: z.number(),
        dataInicio:      z.string(),
        ratioMat:        z.number().optional(),
        ratioMdo:        z.number().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");

      function extractFirstJson(text: string): string | null {
        const start = text.indexOf("{");
        if (start === -1) return null;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
        }
        return null;
      }

      const folhas = (input.schedule.atividades as any[]).filter((a: any) => !a.isGrupo);
      const grupos = (input.schedule.atividades as any[]).filter((a: any) => a.isGrupo);

      const eapToMes = new Map<string, number>();
      (input.schedule.meses as any[]).forEach((m: any) => m.atividades.forEach((a: any) => eapToMes.set(a.eapCodigo, m.mes)));

      const tabelaEAP = [
        "EAP | Nome | Dur(d) | Mês | Peso% | Custo | Mat | MdO | Predecessora",
        ...grupos.map((a: any) => `${a.eapCodigo} | **${a.nome}** | grupo`),
        ...folhas.map((a: any) => {
          const custo = (a.pesoFinanceiro / 100) * input.schedule.valorTotal;
          const mat   = parseFloat((custo * (input.schedule.ratioMat || 0)).toFixed(2));
          const mdo   = parseFloat((custo * (input.schedule.ratioMdo || 0)).toFixed(2));
          return `${a.eapCodigo} | ${a.nome} | ${a.duracaoDias}d | Mês${eapToMes.get(a.eapCodigo) ?? "?"} | ${Number(a.pesoFinanceiro).toFixed(2)}% | R$${custo.toFixed(2)} | R$${mat.toFixed(2)} | R$${mdo.toFixed(2)} | ${a.predecessora || "-"}`;
        }),
      ].join("\n");

      const systemPrompt = `Você é JULINHO, especialista sênior em planejamento e controle de obras de construção civil no Brasil. Você está ajudando o engenheiro a refinar o cronograma gerado pela IA.

CRONOGRAMA ATUAL:
- Valor total: R$${input.schedule.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Desembolso máximo mensal: R$${input.schedule.orcamentoMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Início: ${input.schedule.dataInicio}
- ${input.schedule.meses.length} meses · ${folhas.length} atividades folha

EAP COMPLETA:
${tabelaEAP}

SUAS CAPACIDADES:
1. Responder perguntas sobre o cronograma, sequência construtiva, dependências
2. Sugerir ajustes de duração, predecessoras, distribuição mensal
3. Explicar decisões tomadas pela IA na sequência

SE o engenheiro pedir para modificar o cronograma (ex: "mova X para o mês Y", "aumente duração de X", "coloque X depois de Y"), retorne uma resposta no seguinte formato JSON:
{
  "resposta": "Texto explicando a modificação feita e o motivo técnico.",
  "atividades": [ ... lista COMPLETA de atividades modificadas com todos os campos ... ]
}

Se for apenas uma conversa ou pergunta (sem modificação de schedule), responda em texto puro, SEM JSON.

REGRAS TÉCNICAS:
- Respeitar sempre a sequência construtiva brasileira (NBR 12.741, SINDUSCON)
- Duração mínima: 5 dias para qualquer atividade folha
- Predecessoras via eapCodigo (ex: "2.1,2.2")
- pesoFinanceiro: soma das folhas = 100
- Seja direto e técnico, tutear o engenheiro`;

      let rawText = "";
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            ...input.messages.map(m => ({ role: m.role as any, content: m.content })),
          ],
          maxTokens: 4000,
        });
        rawText = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content : "";
      } catch (e: any) {
        throw new Error(`Falha ao chamar JULINHO: ${e?.message ?? "erro desconhecido"}`);
      }

      // Tentar parsear se vier JSON com atividades modificadas
      const jsonStr = extractFirstJson(rawText);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.resposta && Array.isArray(parsed.atividades) && parsed.atividades.length > 0) {
            return { resposta: parsed.resposta, atividades: parsed.atividades, hasMod: true };
          }
        } catch { /* resposta em texto puro */ }
      }

      return { resposta: rawText.trim(), atividades: null, hasMod: false };
    }),
});
