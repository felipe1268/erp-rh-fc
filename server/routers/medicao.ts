import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  medicaoContratos,
  medicaoBoletins,
  medicaoBoletimItens,
  medicaoFdRegistros,
  planejamentoProjetos,
  planejamentoAtividades,
  planejamentoAvancos,
  orcamentoItens,
  orcamentos,
  obras,
} from "../../drizzle/schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";

export const medicaoRouter = router({

  listarContratos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const contratos = await db
        .select({
          id: medicaoContratos.id,
          projetoId: medicaoContratos.projetoId,
          criterio: medicaoContratos.criterio,
          valorTotalContrato: medicaoContratos.valorTotalContrato,
          percentualSinal: medicaoContratos.percentualSinal,
          valorSinalRecebido: medicaoContratos.valorSinalRecebido,
          percentualRetencao: medicaoContratos.percentualRetencao,
          valorMinimoFd: medicaoContratos.valorMinimoFd,
          status: medicaoContratos.status,
          observacoes: medicaoContratos.observacoes,
          criadoEm: medicaoContratos.criadoEm,
          nomeProjeto: planejamentoProjetos.nome,
          cliente: planejamentoProjetos.cliente,
          local: planejamentoProjetos.local,
          obraId: planejamentoProjetos.obraId,
          obraNome: obras.nome,
          orcamentoId: planejamentoProjetos.orcamentoId,
          orcamentoCodigo: orcamentos.codigo,
        })
        .from(medicaoContratos)
        .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
        .leftJoin(obras, eq(planejamentoProjetos.obraId, obras.id))
        .leftJoin(orcamentos, eq(planejamentoProjetos.orcamentoId, orcamentos.id))
        .where(and(
          eq(medicaoContratos.companyId, input.companyId),
          isNull(medicaoContratos.deletedAt),
        ))
        .orderBy(desc(medicaoContratos.criadoEm));
      return contratos;
    }),

  getContrato: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db
        .select({
          id: medicaoContratos.id,
          companyId: medicaoContratos.companyId,
          projetoId: medicaoContratos.projetoId,
          criterio: medicaoContratos.criterio,
          valorTotalContrato: medicaoContratos.valorTotalContrato,
          percentualSinal: medicaoContratos.percentualSinal,
          valorSinalRecebido: medicaoContratos.valorSinalRecebido,
          percentualRetencao: medicaoContratos.percentualRetencao,
          valorMinimoFd: medicaoContratos.valorMinimoFd,
          status: medicaoContratos.status,
          observacoes: medicaoContratos.observacoes,
          nomeProjeto: planejamentoProjetos.nome,
          cliente: planejamentoProjetos.cliente,
          local: planejamentoProjetos.local,
          orcamentoId: planejamentoProjetos.orcamentoId,
        })
        .from(medicaoContratos)
        .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
        .where(eq(medicaoContratos.id, input.id));
      return contrato ?? null;
    }),

  criarContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      projetoId: z.number(),
      criterio: z.enum(["avanco_fisico", "parcela_fixa"]).default("avanco_fisico"),
      valorTotalContrato: z.string().optional(),
      percentualSinal: z.string().optional(),
      valorSinalRecebido: z.string().optional(),
      percentualRetencao: z.string().nullable().optional(),
      valorMinimoFd: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(medicaoContratos).values({
        companyId: input.companyId,
        projetoId: input.projetoId,
        criterio: input.criterio,
        valorTotalContrato: input.valorTotalContrato,
        percentualSinal: input.percentualSinal,
        valorSinalRecebido: input.valorSinalRecebido,
        percentualRetencao: input.percentualRetencao,
        valorMinimoFd: input.valorMinimoFd,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  atualizarContrato: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      criterio: z.enum(["avanco_fisico", "parcela_fixa"]).optional(),
      valorTotalContrato: z.string().optional(),
      percentualSinal: z.string().optional(),
      valorSinalRecebido: z.string().optional(),
      percentualRetencao: z.string().nullable().optional(),
      valorMinimoFd: z.string().nullable().optional(),
      status: z.enum(["ativo", "encerrado"]).optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoContratos)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(
          eq(medicaoContratos.id, id),
          eq(medicaoContratos.companyId, companyId),
        ));
      return { success: true };
    }),

  excluirContrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(medicaoContratos)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(medicaoContratos.id, input.id),
          eq(medicaoContratos.companyId, input.companyId),
        ));
      return { success: true };
    }),

  listarBoletins: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.contratoId, input.contratoId))
        .orderBy(desc(medicaoBoletins.numero));
    }),

  getBoletim: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [boletim] = await db
        .select()
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.id, input.id));
      if (!boletim) return null;
      const itens = await db
        .select()
        .from(medicaoBoletimItens)
        .where(eq(medicaoBoletimItens.boletimId, input.id))
        .orderBy(medicaoBoletimItens.eapCodigo);
      return { ...boletim, itens };
    }),

  criarBoletim: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      periodoReferencia: z.string(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [ultimo] = await db
        .select({ numero: medicaoBoletins.numero })
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.contratoId, input.contratoId))
        .orderBy(desc(medicaoBoletins.numero))
        .limit(1);
      const numero = (ultimo?.numero ?? 0) + 1;

      const [row] = await db.insert(medicaoBoletins).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        numero,
        periodoReferencia: input.periodoReferencia,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  atualizarBoletim: protectedProcedure
    .input(z.object({
      id: z.number(),
      valorBruto: z.string().optional(),
      descontoSinal: z.string().optional(),
      descontoRetencao: z.string().optional(),
      glosa: z.string().optional(),
      deducaoFd: z.string().optional(),
      valorLiquido: z.string().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(medicaoBoletins)
        .set({ ...data, atualizadoEm: new Date() })
        .where(eq(medicaoBoletins.id, id));
      return { success: true };
    }),

  avancarStatusBoletim: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["rascunho", "enviado", "aprovado", "finalizado"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const updates: Record<string, unknown> = {
        status: input.status,
        atualizadoEm: new Date(),
      };
      if (input.status === "enviado") updates.dataEnvio = new Date().toISOString().substring(0, 10);
      if (input.status === "aprovado") updates.dataAprovacao = new Date().toISOString().substring(0, 10);
      await db.update(medicaoBoletins).set(updates).where(eq(medicaoBoletins.id, input.id));
      return { success: true };
    }),

  salvarItensBoletim: protectedProcedure
    .input(z.object({
      boletimId: z.number(),
      itens: z.array(z.object({
        id: z.number().optional(),
        atividadeId: z.number().nullable().optional(),
        eapCodigo: z.string().nullable().optional(),
        descricao: z.string(),
        valorContratual: z.string(),
        percentualAcumuladoAnterior: z.string(),
        percentualPeriodo: z.string(),
        percentualAcumuladoAtual: z.string(),
        valorPeriodo: z.string(),
        tipoAvanco: z.enum(["fisico", "financeiro_material"]).default("fisico"),
        isFd: z.boolean().default(false),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(medicaoBoletimItens).where(eq(medicaoBoletimItens.boletimId, input.boletimId));
      if (input.itens.length > 0) {
        await db.insert(medicaoBoletimItens).values(
          input.itens.map(item => ({
            boletimId: input.boletimId,
            atividadeId: item.atividadeId,
            eapCodigo: item.eapCodigo,
            descricao: item.descricao,
            valorContratual: item.valorContratual,
            percentualAcumuladoAnterior: item.percentualAcumuladoAnterior,
            percentualPeriodo: item.percentualPeriodo,
            percentualAcumuladoAtual: item.percentualAcumuladoAtual,
            valorPeriodo: item.valorPeriodo,
            tipoAvanco: item.tipoAvanco,
            isFd: item.isFd,
          }))
        );
      }
      const totais = await db
        .select({
          valorBruto: sql<string>`COALESCE(SUM(CASE WHEN NOT is_fd THEN valor_periodo ELSE 0 END), 0)`,
          deducaoFd: sql<string>`COALESCE(SUM(CASE WHEN is_fd THEN valor_periodo ELSE 0 END), 0)`,
        })
        .from(medicaoBoletimItens)
        .where(eq(medicaoBoletimItens.boletimId, input.boletimId));

      const [boletim] = await db.select().from(medicaoBoletins).where(eq(medicaoBoletins.id, input.boletimId));
      if (boletim) {
        const valorBruto = parseFloat(totais[0]?.valorBruto ?? "0");
        const deducaoFd = parseFloat(totais[0]?.deducaoFd ?? "0");
        const descontoSinal = parseFloat(boletim.descontoSinal ?? "0");
        const descontoRetencao = parseFloat(boletim.descontoRetencao ?? "0");
        const glosa = parseFloat(boletim.glosa ?? "0");
        const valorLiquido = valorBruto - descontoSinal - descontoRetencao - glosa - deducaoFd;
        await db.update(medicaoBoletins).set({
          valorBruto: valorBruto.toFixed(2),
          deducaoFd: deducaoFd.toFixed(2),
          valorLiquido: valorLiquido.toFixed(2),
          atualizadoEm: new Date(),
        }).where(eq(medicaoBoletins.id, input.boletimId));
      }
      return { success: true };
    }),

  recalcularDeducoes: protectedProcedure
    .input(z.object({
      boletimId: z.number(),
      glosa: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [boletim] = await db.select().from(medicaoBoletins).where(eq(medicaoBoletins.id, input.boletimId));
      if (!boletim) return { success: false };

      const [contrato] = await db.select().from(medicaoContratos).where(eq(medicaoContratos.id, boletim.contratoId));
      if (!contrato) return { success: false };

      const pctSinal = parseFloat(contrato.percentualSinal ?? "0") / 100;
      const pctRetencao = parseFloat(contrato.percentualRetencao ?? "0") / 100;
      const valorBruto = parseFloat(boletim.valorBruto ?? "0");
      const glosa = parseFloat(input.glosa ?? boletim.glosa ?? "0");

      const fdRows = await db.select({ valor: medicaoBoletimItens.valorPeriodo })
        .from(medicaoBoletimItens)
        .where(and(eq(medicaoBoletimItens.boletimId, input.boletimId), eq(medicaoBoletimItens.isFd, true)));
      const deducaoFd = fdRows.reduce((acc, r) => acc + parseFloat(r.valor ?? "0"), 0);

      const descontoSinal = valorBruto * pctSinal;
      const descontoRetencao = valorBruto * pctRetencao;
      const valorLiquido = valorBruto - descontoSinal - descontoRetencao - glosa - deducaoFd;

      await db.update(medicaoBoletins).set({
        descontoSinal: descontoSinal.toFixed(2),
        descontoRetencao: descontoRetencao.toFixed(2),
        glosa: glosa.toFixed(2),
        deducaoFd: deducaoFd.toFixed(2),
        valorLiquido: valorLiquido.toFixed(2),
        atualizadoEm: new Date(),
      }).where(eq(medicaoBoletins.id, input.boletimId));

      return { success: true };
    }),

  listarFdRegistros: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(medicaoFdRegistros)
        .where(eq(medicaoFdRegistros.contratoId, input.contratoId))
        .orderBy(desc(medicaoFdRegistros.dataRegistro));
    }),

  criarFdRegistro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      descricao: z.string(),
      valor: z.string(),
      dataRegistro: z.string(),
      origem: z.enum(["bdi", "manual"]).default("manual"),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(medicaoFdRegistros).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        descricao: input.descricao,
        valor: input.valor,
        dataRegistro: input.dataRegistro,
        origem: input.origem,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  atualizarFdRegistro: protectedProcedure
    .input(z.object({
      id: z.number(),
      descricao: z.string().optional(),
      valor: z.string().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(medicaoFdRegistros)
        .set({ ...data, atualizadoEm: new Date() })
        .where(eq(medicaoFdRegistros.id, id));
      return { success: true };
    }),

  excluirFdRegistro: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(medicaoFdRegistros).where(eq(medicaoFdRegistros.id, input.id));
      return { success: true };
    }),

  getAtividadesProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const atividades = await db
        .select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          nivel: planejamentoAtividades.nivel,
          isGrupo: planejamentoAtividades.isGrupo,
          pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
          revisaoId: planejamentoAtividades.revisaoId,
        })
        .from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.projetoId, input.projetoId),
          ...(input.revisaoId ? [eq(planejamentoAtividades.revisaoId, input.revisaoId)] : []),
        ))
        .orderBy(planejamentoAtividades.ordem);
      return atividades;
    }),

  getAvancoAtividades: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT DISTINCT ON (atividade_id)
          atividade_id,
          percentual_acumulado,
          semana
        FROM planejamento_avancos
        WHERE projeto_id = ${input.projetoId}
          AND revisao_id = ${input.revisaoId}
        ORDER BY atividade_id, semana DESC
      `);
      return result.rows as { atividade_id: number; percentual_acumulado: string; semana: string }[];
    }),

  getItensOrcamento: protectedProcedure
    .input(z.object({ orcamentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select({
          id: orcamentoItens.id,
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          nivel: orcamentoItens.nivel,
          tipo: orcamentoItens.tipo,
          unidade: orcamentoItens.unidade,
          quantidade: orcamentoItens.quantidade,
          vendaUnitTotal: orcamentoItens.vendaUnitTotal,
          vendaTotal: orcamentoItens.vendaTotal,
        })
        .from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.eapCodigo);
    }),
});
