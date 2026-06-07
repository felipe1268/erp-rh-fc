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
  planejamentoMedicaoConfig,
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
          obraId: planejamentoProjetos.obraId,
        })
        .from(medicaoContratos)
        .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
        .where(eq(medicaoContratos.id, input.id));
      if (!contrato) return null;
      let tipoContrato = 'global';
      let percentualGerenciamentoMaterial = '0';
      if (contrato.obraId) {
        const obraRows = await db.execute(sql`SELECT tipo_contrato, percentual_gerenciamento_material FROM obras WHERE id = ${contrato.obraId} LIMIT 1`);
        const rows: any[] = (obraRows as any).rows ?? obraRows ?? [];
        if (rows[0]?.tipo_contrato) tipoContrato = rows[0].tipo_contrato;
        if (rows[0]?.percentual_gerenciamento_material) percentualGerenciamentoMaterial = String(rows[0].percentual_gerenciamento_material);
      }
      return { ...contrato, tipoContrato, percentualGerenciamentoMaterial };
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

  getProjetoMedicaoConfig: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({
        tipoMedicao: planejamentoMedicaoConfig.tipoMedicao,
        sinalPct: planejamentoMedicaoConfig.sinalPct,
        sinalValor: planejamentoMedicaoConfig.sinalValor,
        retencaoPct: planejamentoMedicaoConfig.retencaoPct,
        entrada: planejamentoMedicaoConfig.entrada,
        diaCorte: planejamentoMedicaoConfig.diaCorte,
        // Rev. 2891 — também expõe o Valor p/ FD configurado no Planejamento (Medição),
        // p/ auto-preencher "Valor Mínimo para FD" no Novo Contrato de Medição.
        fdValor: planejamentoMedicaoConfig.fdValor,
      })
      .from(planejamentoMedicaoConfig)
      .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
      .limit(1);
      return rows[0] || null;
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
      dataInicio: z.string().nullable().optional(),
      dataFim: z.string().nullable().optional(),
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
        dataInicio: input.dataInicio ?? null,
        dataFim: input.dataFim ?? null,
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

  excluirBoletim: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(medicaoBoletimItens).where(eq(medicaoBoletimItens.boletimId, input.id));
      await db.delete(medicaoBoletins).where(and(eq(medicaoBoletins.id, input.id), eq(medicaoBoletins.companyId, input.companyId)));
      return { success: true };
    }),

  editarBoletim: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      periodoReferencia: z.string().optional(),
      dataInicio: z.string().nullable().optional(),
      dataFim: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoBoletins)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(medicaoBoletins.id, id), eq(medicaoBoletins.companyId, companyId)));
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

  getPlanilhaMedicao: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      orcamentoId: z.number(),
      companyId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [contrato] = await db
        .select({ id: medicaoContratos.id, companyId: medicaoContratos.companyId, valorTotalContrato: medicaoContratos.valorTotalContrato })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
        .limit(1);

      if (!contrato) throw new Error("Contrato não encontrado ou sem permissão");

      const [orc] = await db
        .select({ totalVenda: orcamentos.totalVenda })
        .from(orcamentos)
        .where(eq(orcamentos.id, input.orcamentoId))
        .limit(1);

      const valorContrato = parseFloat(String(contrato.valorTotalContrato || "0")) || 0;
      const totalVendaOrc = parseFloat(String(orc?.totalVenda || "0")) || 0;

      const itens = await db
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
          custoTotalMat: orcamentoItens.custoTotalMat,
          custoTotalMdo: orcamentoItens.custoTotalMdo,
          custoTotal: orcamentoItens.custoTotal,
        })
        .from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.eapCodigo);

      const medidoResult = await db.execute(sql`
        SELECT
          i.eap_codigo,
          MAX(CAST(i.percentual_acumulado_atual AS NUMERIC)) AS pct_acumulado,
          SUM(CAST(i.valor_periodo AS NUMERIC)) AS total_medido
        FROM medicao_boletim_itens i
        JOIN medicao_boletins b ON b.id = i.boletim_id
        WHERE b.contrato_id = ${input.contratoId}
          AND b.status IN ('enviado', 'aprovado', 'finalizado')
          AND i.eap_codigo IS NOT NULL
        GROUP BY i.eap_codigo
      `);

      const normalizeEap = (eap: string) =>
        eap.split(".").map(s => String(parseInt(s, 10))).join(".");

      const medidoMap: Record<string, { pctAcumulado: number; totalMedido: number }> = {};
      for (const row of medidoResult.rows as any[]) {
        const val = {
          pctAcumulado: parseFloat(row.pct_acumulado || "0"),
          totalMedido: parseFloat(row.total_medido || "0"),
        };
        medidoMap[row.eap_codigo] = val;
        const norm = normalizeEap(row.eap_codigo);
        if (norm !== row.eap_codigo) medidoMap[norm] = val;
      }

      return { itens, medidoMap, valorContrato, totalVendaOrc };
    }),

  getAvancosParaMedicao: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      contratoId: z.number(),
      boletimId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const normalizeEap = (eap: string) =>
        eap.split(".").map(s => String(parseInt(s, 10))).join(".");

      const revisaoResult = await db.execute(sql`
        SELECT id FROM planejamento_revisoes
        WHERE projeto_id = ${input.projetoId}
        ORDER BY numero DESC LIMIT 1
      `);
      const revisaoId = revisaoResult.rows[0]?.id as number | undefined;
      if (!revisaoId) return { avancosCronograma: {}, acumuladoMedido: {} };

      const avancosResult = await db.execute(sql`
        SELECT DISTINCT ON (a.eap_codigo)
          a.eap_codigo,
          av.percentual_acumulado
        FROM planejamento_avancos av
        JOIN planejamento_atividades a ON a.id = av.atividade_id
        WHERE av.projeto_id = ${input.projetoId}
          AND av.revisao_id = ${revisaoId}
          AND a.eap_codigo IS NOT NULL
        ORDER BY a.eap_codigo, av.semana DESC
      `);

      const avancosCronograma: Record<string, number> = {};
      for (const row of avancosResult.rows as any[]) {
        const norm = normalizeEap(row.eap_codigo);
        const val = parseFloat(row.percentual_acumulado || "0");
        avancosCronograma[row.eap_codigo] = val;
        if (norm !== row.eap_codigo) avancosCronograma[norm] = val;
      }

      const excludeClause = input.boletimId
        ? sql` AND b.id != ${input.boletimId}`
        : sql``;

      const medidoResult = await db.execute(sql`
        SELECT
          i.eap_codigo,
          MAX(i.percentual_acumulado_atual) AS pct_acumulado_medido
        FROM medicao_boletim_itens i
        JOIN medicao_boletins b ON b.id = i.boletim_id
        WHERE b.contrato_id = ${input.contratoId}
          AND i.eap_codigo IS NOT NULL
          AND b.status IN ('enviado', 'aprovado', 'finalizado')
          ${excludeClause}
        GROUP BY i.eap_codigo
      `);

      const acumuladoMedido: Record<string, number> = {};
      for (const row of medidoResult.rows as any[]) {
        const norm = normalizeEap(row.eap_codigo);
        const val = parseFloat(row.pct_acumulado_medido || "0");
        acumuladoMedido[row.eap_codigo] = val;
        if (norm !== row.eap_codigo) acumuladoMedido[norm] = val;
      }

      return { avancosCronograma, acumuladoMedido };
    }),
});
