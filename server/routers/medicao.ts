import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import {
  medicaoContratos,
  medicaoBoletins,
  medicaoBoletimItens,
  medicaoFdRegistros,
  medicaoCampo,
  medicaoCampoPdfs,
  medicaoCampoContornos,
  medicaoLevantamentoServicos,
  medicaoCampoFotos,
  terceiroContratos,
  planejamentoProjetos,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoMedicaoConfig,
  orcamentoItens,
  orcamentos,
  obras,
  comprasOrdens,
  users,
} from "../../drizzle/schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { consolidarContornos } from "../../shared/levantamentoConsolidado";

// Guard PERMISSIVO de empresa (mesmo padrão de medicaoConfig/aiConfig/compras):
// admin libera; usuário SEM vínculo libera; só bloqueia usuário vinculado a
// empresas tentando uma empresa fora dos seus vínculos (anti-IDOR de leitura).
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// Rev. 3093 — Biblioteca de plantas POR CONTRATO. As plantas (PDFs) + calibração
// deixam de pender de cada medição (medicao_campo) e passam a viver num campo
// dedicado status="biblioteca" por (contrato, origem). Assim o upload é feito 1x e
// TODAS as medições do contrato enxergam a mesma planta (sem reupload). Os contornos
// e fotos seguem por medição (referenciando o pdf.id compartilhado). IDs de contrato
// COLIDEM entre módulos → escopo sempre por origem ('terceiro' vs cliente/legado-NULL).
const origemCampoCond = (origem: "cliente" | "terceiro") =>
  origem === "terceiro"
    ? eq(medicaoCampo.origem, "terceiro")
    : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`;

async function resolverBibliotecaPlantas(
  db: any,
  companyId: number,
  contratoId: number,
  origem: "cliente" | "terceiro",
): Promise<{ id: number }> {
  // Find-or-create da biblioteca. Sem UNIQUE no schema (regra de ouro: nenhum
  // ALTER), a corrida "duas abas criam a biblioteca ao mesmo tempo" geraria 2
  // bibliotecas — e `getCampo` lê só a de menor id, "sumindo" com PDFs gravados
  // na outra. Serializa via pg_advisory_xact_lock por (company, contrato, origem)
  // dentro de uma transação: o 2º chamador espera, depois encontra a já criada.
  const lockKey2 = contratoId * 2 + (origem === "terceiro" ? 1 : 0);
  return await db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}::int, ${lockKey2}::int)`);
    const [lib] = await tx
      .select({ id: medicaoCampo.id })
      .from(medicaoCampo)
      .where(and(
        eq(medicaoCampo.companyId, companyId),
        eq(medicaoCampo.contratoId, contratoId),
        eq(medicaoCampo.status, "biblioteca"),
        origemCampoCond(origem),
        isNull(medicaoCampo.deletedAt),
      ))
      .orderBy(medicaoCampo.id)
      .limit(1);
    if (lib) return lib;
    const [novo] = await tx.insert(medicaoCampo).values({
      companyId,
      contratoId,
      numero: 0,
      titulo: "Plantas do contrato",
      status: "biblioteca",
      origem,
      medicaoId: null,
    }).returning({ id: medicaoCampo.id });
    return novo;
  });
}

// Move plantas soltas (que ainda pendem de campos-medição) para a biblioteca do
// contrato. Idempotente: preserva o pdf.id (contornos seguem referenciando-o) e,
// após a 1ª execução, o WHERE não casa mais nada (no-op). Suporta a auto-cura de
// contratos antigos cujas plantas foram enviadas antes da Rev. 3093.
async function migrarPlantasParaBiblioteca(
  db: any,
  companyId: number,
  contratoId: number,
  origem: "cliente" | "terceiro",
  bibliotecaId: number,
): Promise<void> {
  const camposNaoBiblioteca = db
    .select({ id: medicaoCampo.id })
    .from(medicaoCampo)
    .where(and(
      eq(medicaoCampo.companyId, companyId),
      eq(medicaoCampo.contratoId, contratoId),
      origemCampoCond(origem),
      sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
    ));
  await db.update(medicaoCampoPdfs)
    .set({ medicaoCampoId: bibliotecaId, atualizadoEm: new Date() })
    .where(and(
      eq(medicaoCampoPdfs.companyId, companyId),
      isNull(medicaoCampoPdfs.deletedAt),
      sql`${medicaoCampoPdfs.medicaoCampoId} <> ${bibliotecaId}`,
      inArray(medicaoCampoPdfs.medicaoCampoId, camposNaoBiblioteca),
    ));
}

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
      origem: z.enum(["bdi", "manual", "compra"]).default("manual"),
      compraId: z.number().nullable().optional(),
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
        compraId: input.compraId ?? null,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  // Rev. 4026 — OCs de Faturamento Direto (FD) do Painel de Compras disponíveis para
  // importar direto na Medição (mesmo critério de `compras.getSaldoFdTodasObras`:
  // modalidadeFd IN fd_cliente/fd_terceiro/fd_fc, status != cancelada). Só considera
  // OCs da OBRA vinculada ao projeto do contrato de medição. `jaVinculada` sinaliza
  // OCs que já viraram um `medicao_fd_registros.compraId` (evita duplicar valor).
  listarOcsFdDisponiveis: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ocs = await db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          fornecedorNome: comprasOrdens.fornecedorNome,
          observacoes: comprasOrdens.observacoes,
          fdValor: comprasOrdens.fdValor,
          modalidadeFd: comprasOrdens.modalidadeFd,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
        })
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          eq(comprasOrdens.obraId, input.obraId),
          sql`${comprasOrdens.modalidadeFd} IN ('fd_cliente', 'fd_terceiro', 'fd_fc')`,
          sql`${comprasOrdens.status} != 'cancelada'`,
        ))
        .orderBy(desc(comprasOrdens.criadoEm));

      const vinculadas = await db.select({ compraId: medicaoFdRegistros.compraId })
        .from(medicaoFdRegistros)
        .where(sql`${medicaoFdRegistros.compraId} IS NOT NULL`);
      const vinculadasSet = new Set(vinculadas.map(v => v.compraId));

      const n = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
      return ocs.map(oc => {
        const valorEfetivo = n(oc.fdValor) > 0 ? n(oc.fdValor) : n((oc as any).total);
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          fornecedorNome: oc.fornecedorNome,
          descricao: oc.observacoes,
          modalidadeFd: oc.modalidadeFd,
          valorEfetivo,
          criadoEm: oc.criadoEm,
          jaVinculada: vinculadasSet.has(oc.id),
        };
      });
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

  // Rev. 4027 — rastreabilidade do "Origem: Cronograma" no boletim: mostra o
  // histórico semanal de avanço físico (Planejamento → Avanço Semanal) de UMA
  // atividade, para o usuário saber exatamente de qual semana veio o % usado
  // na medição. companyId é validado via o contrato (evita IDOR).
  getHistoricoAvancoAtividade: protectedProcedure
    .input(z.object({
      atividadeId: z.number(),
      contratoId: z.number(),
      companyId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db
        .select({ id: medicaoContratos.id, projetoId: medicaoContratos.projetoId })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
        .limit(1);
      if (!contrato) throw new Error("Contrato não encontrado ou sem permissão");

      const [atividade] = await db
        .select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          projetoId: planejamentoAtividades.projetoId,
          revisaoId: planejamentoAtividades.revisaoId,
        })
        .from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.id, input.atividadeId))
        .limit(1);
      if (!atividade || atividade.projetoId !== contrato.projetoId) {
        throw new Error("Atividade não pertence a este contrato");
      }

      const result = await db.execute(sql`
        SELECT semana, percentual_semanal, percentual_acumulado, observacao
        FROM planejamento_avancos
        WHERE atividade_id = ${input.atividadeId}
          AND revisao_id = ${atividade.revisaoId}
        ORDER BY semana ASC
      `);
      return {
        atividade: { id: atividade.id, eapCodigo: atividade.eapCodigo, nome: atividade.nome },
        semanas: result.rows as { semana: string; percentual_semanal: string; percentual_acumulado: string; observacao: string | null }[],
      };
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

      // Rev. 4024 — Mesma regra de "revisão ativa" usada em todo o resto do
      // módulo Planejamento (PlanejamentoDetalhe.tsx `revisaoAtiva`: última
      // revisão APROVADA; só cai para a mais recente qualquer se não houver
      // nenhuma aprovada). Antes esta query pegava a última revisão por
      // NÚMERO sem olhar o status — se existisse uma revisão "rascunho" mais
      // nova (ex.: próximo ciclo de replanejamento em edição), a Medição
      // buscava avanços dessa revisão rascunho, que ainda não tem nenhum
      // `planejamento_avancos` lançado (o avanço real continua sendo
      // reportado contra a revisão aprovada) — resultado: "Importar do
      // Orçamento (com avanço físico)" não trazia NENHUM item (avanço 0%
      // pra tudo), aparentando que a medição "não vem do avanço".
      const revisaoResult = await db.execute(sql`
        SELECT id FROM planejamento_revisoes
        WHERE projeto_id = ${input.projetoId} AND status = 'aprovada'
        ORDER BY numero DESC LIMIT 1
      `);
      let revisaoId = revisaoResult.rows[0]?.id as number | undefined;
      if (!revisaoId) {
        const fallback = await db.execute(sql`
          SELECT id FROM planejamento_revisoes
          WHERE projeto_id = ${input.projetoId}
          ORDER BY numero DESC LIMIT 1
        `);
        revisaoId = fallback.rows[0]?.id as number | undefined;
      }
      if (!revisaoId) return { avancosCronograma: {}, acumuladoMedido: {}, revisaoId: null };

      // Rev. 4025 — CHAVE POR `atividade_id`, NÃO MAIS POR `eap_codigo`.
      // Causa-raiz do "avanço não chega na Medição" em projetos reais (ex.:
      // VITRA/projeto 44): `eap_codigo` em `planejamento_atividades` está
      // preenchido só numa fração das atividades-folha (ex.: 11 de ~230 no
      // caso real) — o resto vem com eap_codigo = '' (string vazia, não
      // NULL, então passava pelo filtro `IS NOT NULL` e todas colidiam na
      // MESMA chave ''). Isso fazia o `DISTINCT ON (a.eap_codigo)` colapsar
      // dezenas de atividades diferentes num único registro por semana, e
      // fazia a Medição "achar" avanço só para a pequena fatia com EAP
      // preenchido. `atividade_id` é a chave primária real e sempre existe
      // — every atividade tem exatamente 1 id, então o casamento é 1:1
      // garantido, independente de o EAP estar preenchido/coerente ou não.
      const avancosResult = await db.execute(sql`
        SELECT DISTINCT ON (av.atividade_id)
          av.atividade_id,
          av.percentual_acumulado
        FROM planejamento_avancos av
        WHERE av.projeto_id = ${input.projetoId}
          AND av.revisao_id = ${revisaoId}
        ORDER BY av.atividade_id, av.semana DESC
      `);

      const avancosCronograma: Record<number, number> = {};
      for (const row of avancosResult.rows as any[]) {
        avancosCronograma[row.atividade_id] = parseFloat(row.percentual_acumulado || "0");
      }

      const excludeClause = input.boletimId
        ? sql` AND b.id != ${input.boletimId}`
        : sql``;

      const medidoResult = await db.execute(sql`
        SELECT
          i.atividade_id,
          MAX(i.percentual_acumulado_atual) AS pct_acumulado_medido
        FROM medicao_boletim_itens i
        JOIN medicao_boletins b ON b.id = i.boletim_id
        WHERE b.contrato_id = ${input.contratoId}
          AND i.atividade_id IS NOT NULL
          AND b.status IN ('enviado', 'aprovado', 'finalizado')
          ${excludeClause}
        GROUP BY i.atividade_id
      `);

      const acumuladoMedido: Record<number, number> = {};
      for (const row of medidoResult.rows as any[]) {
        acumuladoMedido[row.atividade_id] = parseFloat(row.pct_acumulado_medido || "0");
      }

      return { avancosCronograma, acumuladoMedido, revisaoId };
    }),

  // ============================================================
  // Rev. 2893 — MEDIÇÃO COM LEVANTAMENTO EM PDF (levantamento de campo)
  // ============================================================

  // --- Medições de campo (numeradas por contrato) ---
  listarCampos: protectedProcedure
    // `origem` é OPCIONAL p/ retrocompat. Como os IDs de contrato COLIDEM entre módulos
    // (medicao_contratos × terceiro_contratos), o fluxo de terceiros DEVE passar
    // origem:"terceiro" p/ não misturar levantamentos de um contrato-cliente homônimo.
    .input(z.object({ companyId: z.number(), contratoId: z.number(), origem: z.enum(["cliente", "terceiro"]).optional() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const campos = await db
        .select()
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
          isNull(medicaoCampo.deletedAt),
          // Rev. 3093 — a biblioteca de plantas é um campo interno (status="biblioteca");
          // NÃO é um levantamento de medição e não aparece na listagem.
          sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
          // Sem `origem` explícito = escopo CLIENTE (legado: origem NULL/'cliente').
          // O fluxo de terceiros SEMPRE passa origem:"terceiro". JAMAIS cair em filtro
          // aberto (`true`): contratos homônimos de módulos distintos se misturariam.
          input.origem === "terceiro"
            ? eq(medicaoCampo.origem, "terceiro")
            : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`,
        ))
        .orderBy(desc(medicaoCampo.numero));
      if (campos.length === 0) return [];
      const ids = campos.map((c) => c.id);
      const pdfCounts = await db
        .select({ medicaoCampoId: medicaoCampoPdfs.medicaoCampoId, n: sql<number>`count(*)::int` })
        .from(medicaoCampoPdfs)
        .where(and(inArray(medicaoCampoPdfs.medicaoCampoId, ids), isNull(medicaoCampoPdfs.deletedAt)))
        .groupBy(medicaoCampoPdfs.medicaoCampoId);
      const contCounts = await db
        .select({ medicaoCampoId: medicaoCampoContornos.medicaoCampoId, n: sql<number>`count(*)::int` })
        .from(medicaoCampoContornos)
        .where(and(inArray(medicaoCampoContornos.medicaoCampoId, ids), isNull(medicaoCampoContornos.deletedAt)))
        .groupBy(medicaoCampoContornos.medicaoCampoId);
      const pmap = new Map(pdfCounts.map((r) => [r.medicaoCampoId, r.n]));
      const cmap = new Map(contCounts.map((r) => [r.medicaoCampoId, r.n]));
      return campos.map((c) => ({ ...c, qtdPdfs: pmap.get(c.id) ?? 0, qtdContornos: cmap.get(c.id) ?? 0 }));
    }),

  getCampo: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Rev. 3093 — read-path passou a ESCREVER (migração p/ biblioteca), então
      // reforça o guard de empresa (antes confiava só no eq(companyId) do input).
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [campo] = await db
        .select()
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.id), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) return null;
      // Rev. 3093 — as plantas (PDFs) vêm da BIBLIOTECA do contrato (compartilhadas
      // por todas as medições), não do campo-medição. Resolve/cria a biblioteca,
      // migra plantas legadas soltas e lê os PDFs de lá. Se o próprio campo já é a
      // biblioteca, lê dele mesmo.
      const origemNorm: "cliente" | "terceiro" = campo.origem === "terceiro" ? "terceiro" : "cliente";
      let pdfCampoId = campo.id;
      if (campo.status !== "biblioteca") {
        const lib = await resolverBibliotecaPlantas(db, input.companyId, campo.contratoId, origemNorm);
        await migrarPlantasParaBiblioteca(db, input.companyId, campo.contratoId, origemNorm, lib.id);
        pdfCampoId = lib.id;
      }
      const pdfs = await db
        .select()
        .from(medicaoCampoPdfs)
        .where(and(eq(medicaoCampoPdfs.medicaoCampoId, pdfCampoId), eq(medicaoCampoPdfs.companyId, input.companyId), isNull(medicaoCampoPdfs.deletedAt)))
        .orderBy(medicaoCampoPdfs.ordem, medicaoCampoPdfs.id);
      const contornos = await db
        .select()
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, campo.id), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)))
        .orderBy(medicaoCampoContornos.id);
      const fotos = await db
        .select()
        .from(medicaoCampoFotos)
        .where(and(eq(medicaoCampoFotos.medicaoCampoId, campo.id), eq(medicaoCampoFotos.companyId, input.companyId), isNull(medicaoCampoFotos.deletedAt)))
        .orderBy(medicaoCampoFotos.id);
      return { ...campo, pdfs, contornos, fotos };
    }),

  // Rev. 3082 (T003) — Histórico "já medido" acumulado POR CONTRATO.
  // Soma a quantidade de contornos vinculados a item do orçamento em TODOS os
  // OUTROS campos (levantamentos) do mesmo contrato/empresa, p/ o engenheiro
  // ver o que já foi medido antes e não remedir. Read-only, tenant-guard por companyId.
  getHistoricoQuantidades: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number(), excluirCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // ATENÇÃO: contratoId COLIDE entre módulos (medicao_contratos × terceiro_contratos),
      // e a engine de levantamento (medicao_campo) é compartilhada com `origem` distinguindo
      // 'terceiro' de cliente/legado (NULL). Para o histórico "já medido" não misturar dois
      // contratos homônimos de módulos diferentes, escopamos pela origem do campo ATUAL.
      // O campo de referência é OBRIGATÓRIO e precisa pertencer à (empresa, contrato) — se
      // não resolver, abortamos (em vez de cair em consulta SEM filtro de origem = mistura).
      const [atual] = await db
        .select({ origem: medicaoCampo.origem })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.id, input.excluirCampoId),
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
        ))
        .limit(1);
      if (!atual) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Levantamento de campo inválido para este contrato/empresa." });
      }
      const escopoTerceiro = atual.origem === "terceiro";
      const campos = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
          isNull(medicaoCampo.deletedAt),
          escopoTerceiro
            ? eq(medicaoCampo.origem, "terceiro")
            : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`,
        ));
      const ids = campos.map((c) => c.id).filter((id) => id !== input.excluirCampoId);
      if (ids.length === 0) return [] as { orcamentoItemId: number; quantidade: number }[];
      const rows = await db
        .select({
          orcamentoItemId: medicaoCampoContornos.orcamentoItemId,
          quantidade: sql<string>`COALESCE(SUM(${medicaoCampoContornos.quantidade}), 0)`,
        })
        .from(medicaoCampoContornos)
        .where(and(
          inArray(medicaoCampoContornos.medicaoCampoId, ids),
          eq(medicaoCampoContornos.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
          sql`${medicaoCampoContornos.orcamentoItemId} IS NOT NULL`,
        ))
        .groupBy(medicaoCampoContornos.orcamentoItemId);
      return rows
        .filter((r) => r.orcamentoItemId != null)
        .map((r) => ({ orcamentoItemId: r.orcamentoItemId as number, quantidade: Number(r.quantidade) || 0 }));
    }),

  // Rev. 3093 — Contornos de OUTRAS medições do contrato, p/ exibir como REFERÊNCIA
  // (camada clara) o que já foi medido antes sobre a MESMA planta. Read-only,
  // tenant-guard por companyId + escopo por origem do campo atual (igual
  // getHistoricoQuantidades). Exclui o campo atual e a biblioteca (sem contornos).
  getContornosReferencia: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number(), excluirCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [atual] = await db
        .select({ origem: medicaoCampo.origem })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.id, input.excluirCampoId),
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
        ))
        .limit(1);
      if (!atual) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Levantamento de campo inválido para este contrato/empresa." });
      }
      const origemNorm: "cliente" | "terceiro" = atual.origem === "terceiro" ? "terceiro" : "cliente";
      const campos = await db
        .select({ id: medicaoCampo.id, numero: medicaoCampo.numero, titulo: medicaoCampo.titulo })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
          isNull(medicaoCampo.deletedAt),
          sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
          origemCampoCond(origemNorm),
        ));
      const tituloMap = new Map<number, { numero: number; titulo: string | null }>(
        campos.map((c) => [c.id, { numero: c.numero, titulo: c.titulo }]),
      );
      const ids = campos.map((c) => c.id).filter((id) => id !== input.excluirCampoId);
      if (ids.length === 0) return [] as any[];
      const rows = await db
        .select({
          id: medicaoCampoContornos.id,
          medicaoCampoId: medicaoCampoContornos.medicaoCampoId,
          pdfId: medicaoCampoContornos.pdfId,
          pagina: medicaoCampoContornos.pagina,
          tipo: medicaoCampoContornos.tipo,
          cor: medicaoCampoContornos.cor,
          geometriaJson: medicaoCampoContornos.geometriaJson,
          numero: medicaoCampoContornos.numero,
          rotulo: medicaoCampoContornos.rotulo,
          quantidade: medicaoCampoContornos.quantidade,
          unidade: medicaoCampoContornos.unidade,
        })
        .from(medicaoCampoContornos)
        .where(and(
          inArray(medicaoCampoContornos.medicaoCampoId, ids),
          eq(medicaoCampoContornos.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
        ))
        .orderBy(medicaoCampoContornos.id);
      return rows.map((r) => ({
        ...r,
        quantidade: r.quantidade != null ? Number(r.quantidade) : null,
        campoNumero: tituloMap.get(r.medicaoCampoId)?.numero ?? null,
        campoTitulo: tituloMap.get(r.medicaoCampoId)?.titulo ?? null,
      }));
    }),

  criarCampo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      titulo: z.string().nullable().optional(),
      descricao: z.string().nullable().optional(),
      uuid: z.string().optional(),
      // Rev. 3078+ — origem distingue contrato-cliente (medicao_contratos) de
      // contrato-terceiro (terceiro_contratos); os IDs colidem entre as tabelas.
      origem: z.enum(["cliente", "terceiro"]).default("cliente"),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Guard de tenant: o contrato precisa pertencer à empresa, na tabela CORRETA p/ a origem.
      if (input.origem === "terceiro") {
        const [contrato] = await db
          .select({ id: terceiroContratos.id })
          .from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)))
          .limit(1);
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato de terceiro não encontrado ou sem permissão." });
      } else {
        const [contrato] = await db
          .select({ id: medicaoContratos.id })
          .from(medicaoContratos)
          .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
          .limit(1);
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado ou sem permissão." });
      }
      // Numeração escopada por (contrato, origem) — IDs de contrato colidem entre módulos.
      const [ultimo] = await db
        .select({ numero: medicaoCampo.numero })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.contratoId, input.contratoId),
          input.origem === "terceiro"
            ? eq(medicaoCampo.origem, "terceiro")
            : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`,
        ))
        .orderBy(desc(medicaoCampo.numero))
        .limit(1);
      const numero = (ultimo?.numero ?? 0) + 1;
      const [row] = await db.insert(medicaoCampo).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        uuid: input.uuid,
        numero,
        titulo: input.titulo ?? `Levantamento ${numero}`,
        descricao: input.descricao,
        origem: input.origem,
        criadoPorId: ctx.user.id,
        criadoPorNome: ctx.user.name || "",
      }).returning();
      return row;
    }),

  atualizarCampo: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      titulo: z.string().nullable().optional(),
      descricao: z.string().nullable().optional(),
      status: z.enum(["rascunho", "finalizado"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoCampo)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(medicaoCampo.id, id), eq(medicaoCampo.companyId, companyId)));
      return { success: true };
    }),

  excluirCampo: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(medicaoCampo)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampo.id, input.id), eq(medicaoCampo.companyId, input.companyId)));
      return { success: true };
    }),

  // --- PDFs (plantas) por medição ---
  uploadPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      medicaoCampoId: z.number(),
      nome: z.string(),
      tipo: z.enum(["pavimento", "setor", "outro"]).default("pavimento"),
      // Rev. 4787 — base64 opcional: arquivo grande sobe antes via
      // /api/upload/levantamento-planta (multipart, progresso real) e chega
      // aqui só com arquivoKey/arquivoUrl.
      base64: z.string().max(40_000_000).optional(),
      arquivoKey: z.string().optional(),
      arquivoUrl: z.string().optional(),
      contentType: z.string().default("application/pdf"),
      arquivoNome: z.string().optional(),
      numPaginas: z.number().optional(),
      uuid: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rev. 3093 — reforça o guard de empresa (escrita de planta na biblioteca).
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id, contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem, status: medicaoCampo.status })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      // Rev. 3093 — a planta é enviada à BIBLIOTECA do contrato (1x, compartilhada por
      // todas as medições), não ao campo-medição que disparou o upload.
      const origemNorm: "cliente" | "terceiro" = campo.origem === "terceiro" ? "terceiro" : "cliente";
      const destinoCampoId = campo.status === "biblioteca"
        ? campo.id
        : (await resolverBibliotecaPlantas(db, input.companyId, campo.contratoId, origemNorm)).id;
      let key: string;
      let url: string;
      if (input.arquivoKey) {
        // Rev. 4787 — arquivo já subiu via rota multipart; valida que a chave é
        // desta empresa (anti-IDOR) e deriva a URL no SERVER (ignora a do client).
        if (!input.arquivoKey.startsWith(`medicao-campo/${input.companyId}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo não pertence a esta empresa." });
        }
        key = input.arquivoKey;
        // Existência real: a chave deve estar persistida (rota multipart grava
        // no DB) — bloqueia registrar referência quebrada/forjada.
        const existsRes = await db.execute(sql`SELECT 1 AS ok FROM uploaded_files WHERE file_key = ${key} LIMIT 1`);
        const existsRows: any[] = (existsRes as any).rows ?? (existsRes as any) ?? [];
        if (!existsRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo da planta não encontrado no servidor. Envie novamente." });
        const { storageGet } = await import("../storage");
        ({ url } = await storageGet(key));
      } else {
        if (!input.base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo ausente." });
        const buf = Buffer.from(input.base64, "base64");
        // Rev. — extensão da chave derivada do nome/contentType (DXF além de PDF).
        const extNome = (input.arquivoNome || input.nome || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
        const ext = extNome === "dxf" || (input.contentType || "").includes("dxf") ? "dxf" : "pdf";
        key = `medicao-campo/${input.companyId}/${destinoCampoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        ({ url } = await storagePut(key, buf, input.contentType || "application/pdf"));
      }
      const [ordemRow] = await db
        .select({ max: sql<number>`COALESCE(MAX(ordem),0)::int` })
        .from(medicaoCampoPdfs)
        .where(eq(medicaoCampoPdfs.medicaoCampoId, destinoCampoId));
      const [row] = await db.insert(medicaoCampoPdfs).values({
        companyId: input.companyId,
        medicaoCampoId: destinoCampoId,
        uuid: input.uuid,
        nome: input.nome,
        tipo: input.tipo,
        arquivoUrl: url,
        arquivoKey: key,
        arquivoNome: input.arquivoNome ?? input.nome,
        numPaginas: input.numPaginas ?? 1,
        ordem: (ordemRow?.max ?? 0) + 1,
      }).returning();
      return row;
    }),

  atualizarPdf: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().optional(),
      tipo: z.enum(["pavimento", "setor", "outro"]).optional(),
      calibracaoJson: z.string().nullable().optional(),
      numPaginas: z.number().optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoCampoPdfs)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(medicaoCampoPdfs.id, id), eq(medicaoCampoPdfs.companyId, companyId)));
      return { success: true };
    }),

  excluirPdf: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), senhaMaster: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Rev. 4784 — poka-yoke: planta COM levantamento (contornos ativos) só sai
      // com a senha do Administrador Master. Planta vazia pode sair direto.
      const [{ qtd } = { qtd: 0 }] = await db
        .select({ qtd: sql<number>`COUNT(*)::int` })
        .from(medicaoCampoContornos)
        .where(and(
          eq(medicaoCampoContornos.pdfId, input.id),
          eq(medicaoCampoContornos.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
        ));
      if (Number(qtd) > 0) {
        if (!input.senhaMaster) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `PLANTA_COM_LEVANTAMENTO:${qtd}` });
        }
        const masters = await db.select({ password: users.password }).from(users)
          .where(and(eq(users.role, "admin_master"), isNull(users.deletedAt)));
        const bcrypt = await import("bcryptjs");
        const ok = masters.some((m) => m.password && bcrypt.compareSync(input.senhaMaster!, m.password));
        if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Senha do Administrador Master incorreta. Exclusão negada." });
      }
      await db.update(medicaoCampoPdfs)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoPdfs.id, input.id), eq(medicaoCampoPdfs.companyId, input.companyId)));
      // contornos órfãos do PDF também saem da consolidação
      await db.update(medicaoCampoContornos)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoContornos.pdfId, input.id), eq(medicaoCampoContornos.companyId, input.companyId)));
      return { success: true };
    }),

  // --- Contornos (área/volume/perímetro/contagem). Cálculos vêm do client. ---
  salvarContorno: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      medicaoCampoId: z.number(),
      pdfId: z.number(),
      uuid: z.string().optional(),
      pagina: z.number().default(1),
      tipo: z.enum(["area", "volume", "perimetro", "contagem", "parede"]),
      rotulo: z.string().nullable().optional(),
      cor: z.string().nullable().optional(),
      geometriaJson: z.string(),
      espessura: z.string().nullable().optional(),
      metrosPorUnidade: z.string().nullable().optional(),
      area: z.string().nullable().optional(),
      perimetro: z.string().nullable().optional(),
      volume: z.string().nullable().optional(),
      contagem: z.number().nullable().optional(),
      quantidade: z.string().nullable().optional(),
      unidade: z.string().nullable().optional(),
      servico: z.string().max(50).nullable().optional(),
      orcamentoItemId: z.number().nullable().optional(),
      itemEapCodigo: z.string().nullable().optional(),
      itemDescricao: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      const { id, companyId, ...rest } = input;
      if (id) {
        await db.update(medicaoCampoContornos)
          .set({ ...rest, atualizadoEm: new Date() })
          .where(and(eq(medicaoCampoContornos.id, id), eq(medicaoCampoContornos.companyId, companyId)));
        return { id };
      }
      const [maxRow] = await db
        .select({ max: sql<number>`COALESCE(MAX(numero),0)::int` })
        .from(medicaoCampoContornos)
        .where(eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId));
      const [row] = await db.insert(medicaoCampoContornos).values({
        companyId,
        ...rest,
        numero: (maxRow?.max ?? 0) + 1,
      }).returning();
      return row;
    }),

  excluirContorno: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(medicaoCampoContornos)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoContornos.id, input.id), eq(medicaoCampoContornos.companyId, input.companyId)));
      return { success: true };
    }),

  // --- Fotos (ilimitadas, opcionalmente fixadas a um contorno/pin) ---
  uploadFoto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      medicaoCampoId: z.number(),
      pdfId: z.number().nullable().optional(),
      contornoId: z.number().nullable().optional(),
      base64: z.string().max(20_000_000),
      contentType: z.string().default("image/jpeg"),
      legenda: z.string().nullable().optional(),
      pagina: z.number().nullable().optional(),
      pinX: z.string().nullable().optional(),
      pinY: z.string().nullable().optional(),
      uuid: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      const buf = Buffer.from(input.base64, "base64");
      const ext = (input.contentType || "").includes("png") ? "png" : "jpg";
      const key = `medicao-campo/${input.companyId}/${input.medicaoCampoId}/fotos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType || "image/jpeg");
      const [row] = await db.insert(medicaoCampoFotos).values({
        companyId: input.companyId,
        medicaoCampoId: input.medicaoCampoId,
        pdfId: input.pdfId ?? null,
        contornoId: input.contornoId ?? null,
        uuid: input.uuid,
        arquivoUrl: url,
        arquivoKey: key,
        legenda: input.legenda,
        pagina: input.pagina ?? null,
        pinX: input.pinX ?? null,
        pinY: input.pinY ?? null,
      }).returning();
      return row;
    }),

  excluirFoto: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(medicaoCampoFotos)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoFotos.id, input.id), eq(medicaoCampoFotos.companyId, input.companyId)));
      return { success: true };
    }),

  // --- Consolidação por item do orçamento/contrato → R$ ---
  getConsolidadoCampo: protectedProcedure
    .input(z.object({ medicaoCampoId: z.number(), companyId: z.number(), orcamentoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      const contornos = await db
        .select()
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));

      // Itens do orçamento (preço unitário de venda) p/ converter quantidade → R$.
      const itensOrc = input.orcamentoId
        ? await db
            .select({
              id: orcamentoItens.id,
              eapCodigo: orcamentoItens.eapCodigo,
              descricao: orcamentoItens.descricao,
              unidade: orcamentoItens.unidade,
              quantidade: orcamentoItens.quantidade,
              vendaUnitTotal: orcamentoItens.vendaUnitTotal,
            })
            .from(orcamentoItens)
            .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        : [];
      // Rev. 4780 — serviços do levantamento entram na consolidação (vínculo EAP
      // por serviço + linhas derivadas chapisco/emboço/reboco).
      const servicos = await db
        .select()
        .from(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      // Consolidação via função PURA compartilhada (mesma usada no MODO OFFLINE do cliente).
      return consolidarContornos(contornos as any, itensOrc as any, servicos as any);
    }),

  // ═══════════ Rev. 4780 — Catálogo de SERVIÇOS do levantamento ═══════════
  // Híbrido: seed padrão na 1ª leitura + editável + vínculo EAP por serviço.
  listServicosLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const [campo] = await db.select({ id: medicaoCampo.id }).from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      let rows = await db.select().from(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      if (rows.length === 0) {
        // Seed do catálogo padrão (poka-yoke: nasce pronto p/ obra de vedação).
        // Advisory XACT lock por campo: 2 aberturas simultâneas não duplicam o seed.
        const seed = [
          { chave: "alvenaria",  nome: "Alvenaria",  cor: "#dc2626", tipoMedida: "parede",   derivaDe: null,        fator: "1", ordem: 1 },
          { chave: "chapisco",   nome: "Chapisco",   cor: "#ea580c", tipoMedida: "area",     derivaDe: "alvenaria", fator: "2", ordem: 2 },
          { chave: "emboco",     nome: "Emboço",     cor: "#ca8a04", tipoMedida: "area",     derivaDe: "alvenaria", fator: "2", ordem: 3 },
          { chave: "reboco",     nome: "Reboco",     cor: "#059669", tipoMedida: "area",     derivaDe: "alvenaria", fator: "2", ordem: 4 },
          { chave: "contrapiso", nome: "Contrapiso", cor: "#2563eb", tipoMedida: "area",     derivaDe: null,        fator: "1", ordem: 5 },
          { chave: "forro",      nome: "Forro",      cor: "#7c3aed", tipoMedida: "area",     derivaDe: null,        fator: "1", ordem: 6 },
          // Rev. 4792 — Pintura em SUBCATEGORIAS (teto/parede/piso): parede usa a
          // ferramenta Linha (L×A — risca a parede e informa a altura).
          { chave: "pintura_teto",   nome: "Pintura Teto",   cor: "#db2777", tipoMedida: "area",   derivaDe: null, fator: "1", ordem: 7 },
          { chave: "pintura_parede", nome: "Pintura Parede", cor: "#be185d", tipoMedida: "parede", derivaDe: null, fator: "1", ordem: 8 },
          { chave: "pintura_piso",   nome: "Pintura Piso",   cor: "#9d174d", tipoMedida: "area",   derivaDe: null, fator: "1", ordem: 9 },
          { chave: "pontos",     nome: "Contagem",   cor: "#0891b2", tipoMedida: "contagem", derivaDe: null,        fator: "1", ordem: 10 },
        ];
        await db.transaction(async (tx: any) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(478002, ${input.medicaoCampoId})`);
          const [ja] = await tx.select({ id: medicaoLevantamentoServicos.id }).from(medicaoLevantamentoServicos)
            .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId))).limit(1);
          if (ja) return; // outra sessão semeou primeiro
          await tx.insert(medicaoLevantamentoServicos).values(seed.map((s) => ({
            companyId: input.companyId, medicaoCampoId: input.medicaoCampoId, ...s, ativo: 1,
          })));
        });
        rows = await db.select().from(medicaoLevantamentoServicos)
          .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      } else {
        // Rev. 4792 — self-heal p/ catálogos JÁ semeados antes das subcategorias
        // de pintura: se existe "pintura" e nenhuma "pintura_*", acrescenta as 3.
        const temPintura = rows.some((r: any) => r.chave === "pintura");
        const temSub = rows.some((r: any) => String(r.chave).startsWith("pintura_"));
        if (temPintura && !temSub) {
          const base = rows.find((r: any) => r.chave === "pintura");
          const ord = (base?.ordem ?? 7);
          const subs = [
            { chave: "pintura_teto",   nome: "Pintura Teto",   cor: "#db2777", tipoMedida: "area",   ordem: ord },
            { chave: "pintura_parede", nome: "Pintura Parede", cor: "#be185d", tipoMedida: "parede", ordem: ord },
            { chave: "pintura_piso",   nome: "Pintura Piso",   cor: "#9d174d", tipoMedida: "area",   ordem: ord },
          ];
          await db.transaction(async (tx: any) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(478002, ${input.medicaoCampoId})`);
            const atuais = await tx.select({ chave: medicaoLevantamentoServicos.chave }).from(medicaoLevantamentoServicos)
              .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
            const setChaves = new Set(atuais.map((r: any) => r.chave));
            const faltam = subs.filter((s) => !setChaves.has(s.chave));
            if (faltam.length) await tx.insert(medicaoLevantamentoServicos).values(faltam.map((s) => ({
              companyId: input.companyId, medicaoCampoId: input.medicaoCampoId, derivaDe: null, fator: "1", ativo: 1, ...s,
            })));
          });
          rows = await db.select().from(medicaoLevantamentoServicos)
            .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
        }
      }
      return rows.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    }),

  salvarServicoLevantamento: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      medicaoCampoId: z.number(),
      chave: z.string().min(1).max(50),
      nome: z.string().min(1).max(100),
      cor: z.string().max(20).nullable().optional(),
      tipoMedida: z.enum(["area", "parede", "perimetro", "volume", "contagem"]).optional(),
      derivaDe: z.string().max(50).nullable().optional(),
      fator: z.string().nullable().optional(),
      orcamentoItemId: z.number().nullable().optional(),
      itemEapCodigo: z.string().nullable().optional(),
      itemDescricao: z.string().nullable().optional(),
      ordem: z.number().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const [campo] = await db.select({ id: medicaoCampo.id }).from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      const { id, companyId, medicaoCampoId, ...rest } = input;
      if (id) {
        await db.update(medicaoLevantamentoServicos)
          .set({ ...rest, atualizadoEm: new Date() })
          .where(and(eq(medicaoLevantamentoServicos.id, id), eq(medicaoLevantamentoServicos.companyId, companyId), eq(medicaoLevantamentoServicos.medicaoCampoId, medicaoCampoId)));
        return { id };
      }
      const [row] = await db.insert(medicaoLevantamentoServicos)
        .values({ companyId, medicaoCampoId, ...rest }).returning();
      return row;
    }),

  excluirServicoLevantamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      await db.delete(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.id, input.id), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      return { success: true };
    }),

  // --- Gera um boletim de medição a partir do levantamento consolidado ---
  gerarBoletimDoCampo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      medicaoCampoId: z.number(),
      contratoId: z.number(),
      orcamentoId: z.number().optional(),
      periodoReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select()
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });

      // Guard relacional: o contrato precisa pertencer à empresa E ser o MESMO contrato do campo (anti-IDOR).
      const [contrato] = await db
        .select({ id: medicaoContratos.id })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
        .limit(1);
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado ou sem permissão." });
      if (campo.contratoId !== input.contratoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A medição não pertence a este contrato." });
      }

      const contornos = await db
        .select()
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));

      const itensOrc = input.orcamentoId
        ? await db
            .select({
              id: orcamentoItens.id,
              eapCodigo: orcamentoItens.eapCodigo,
              descricao: orcamentoItens.descricao,
              vendaUnitTotal: orcamentoItens.vendaUnitTotal,
              vendaTotal: orcamentoItens.vendaTotal,
            })
            .from(orcamentoItens)
            .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        : [];
      const orcMap = new Map(itensOrc.map((i) => [i.id, i]));

      type Agg = { eapCodigo: string | null; descricao: string; valorContratual: number; valorPeriodo: number };
      const grupos = new Map<string, Agg>();
      for (const c of contornos) {
        const chave = c.orcamentoItemId != null ? `oi:${c.orcamentoItemId}` : `na:${c.id}`;
        const orc = c.orcamentoItemId != null ? orcMap.get(c.orcamentoItemId) : undefined;
        const preco = orc ? parseFloat(String(orc.vendaUnitTotal ?? "0")) || 0 : 0;
        const qtd = parseFloat(String(c.quantidade ?? "0")) || 0;
        let g = grupos.get(chave);
        if (!g) {
          g = {
            eapCodigo: c.itemEapCodigo ?? orc?.eapCodigo ?? null,
            descricao: c.itemDescricao ?? orc?.descricao ?? (c.rotulo || "Levantamento de campo"),
            valorContratual: orc ? parseFloat(String(orc.vendaTotal ?? "0")) || 0 : 0,
            valorPeriodo: 0,
          };
          grupos.set(chave, g);
        }
        g.valorPeriodo += qtd * preco;
      }
      const linhas = Array.from(grupos.values()).filter((l) => l.valorPeriodo > 0);
      if (linhas.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contorno com valor para gerar boletim. Vincule contornos a itens do orçamento." });

      const [ultimo] = await db
        .select({ numero: medicaoBoletins.numero })
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.contratoId, input.contratoId))
        .orderBy(desc(medicaoBoletins.numero))
        .limit(1);
      const numero = (ultimo?.numero ?? 0) + 1;
      const [boletim] = await db.insert(medicaoBoletins).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        numero,
        periodoReferencia: input.periodoReferencia,
        observacoes: `Gerado do Levantamento de Campo nº ${campo.numero}${campo.titulo ? ` — ${campo.titulo}` : ""}`,
      }).returning();

      await db.insert(medicaoBoletimItens).values(
        linhas.map((l) => {
          const pct = l.valorContratual > 0 ? (l.valorPeriodo / l.valorContratual) * 100 : 0;
          return {
            boletimId: boletim.id,
            eapCodigo: l.eapCodigo,
            descricao: l.descricao,
            valorContratual: l.valorContratual.toFixed(2),
            percentualAcumuladoAnterior: "0",
            percentualPeriodo: pct.toFixed(4),
            percentualAcumuladoAtual: pct.toFixed(4),
            valorPeriodo: l.valorPeriodo.toFixed(2),
            tipoAvanco: "fisico" as const,
            isFd: false,
          };
        })
      );

      const valorBruto = linhas.reduce((s, l) => s + l.valorPeriodo, 0);
      await db.update(medicaoBoletins)
        .set({ valorBruto: valorBruto.toFixed(2), valorLiquido: valorBruto.toFixed(2), atualizadoEm: new Date() })
        .where(eq(medicaoBoletins.id, boletim.id));

      await db.update(medicaoCampo)
        .set({ boletimId: boletim.id, status: "finalizado", atualizadoEm: new Date() })
        .where(eq(medicaoCampo.id, input.medicaoCampoId));

      return { boletimId: boletim.id, numero, itens: linhas.length, valorBruto };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Rev. 2895 — SYNC EM LOTE (offline-first / PWA do Levantamento de Campo).
  // Recebe uma fila de operações geradas OFFLINE no tablet e aplica de forma
  // IDEMPOTENTE (upsert por uuid client-stable OU por id quando conhecido) com
  // guard de tenant em CADA operação. Conflito = last-write-wins por
  // `atualizadoEm` (o servidor NUNCA sobrescreve silenciosamente uma versão mais
  // nova; devolve status "conflito" para o cliente registrar/avisar).
  // ───────────────────────────────────────────────────────────────────────────
  sincronizarLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      operations: z.array(z.object({
        clientOpId: z.string(),
        entity: z.enum(["contorno", "foto", "pdf"]),
        action: z.enum(["upsert", "delete", "calibrar"]),
        uuid: z.string().optional(),
        id: z.number().optional(),
        medicaoCampoId: z.number().optional(),
        atualizadoEm: z.string().optional(),
        data: z.any().optional(),
        base64: z.string().max(20_000_000).optional(),
        contentType: z.string().optional(),
      })).max(500),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, contratoId } = input;

      // Guard de tenant raiz: o contrato precisa ser desta empresa.
      const [contrato] = await db
        .select({ id: medicaoContratos.id })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, contratoId), eq(medicaoContratos.companyId, companyId)))
        .limit(1);
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado ou sem permissão." });

      // cache de campos validados (medicaoCampoId → pertence à empresa+contrato)
      const camposOk = new Map<number, boolean>();
      async function campoValido(campoId: number): Promise<boolean> {
        if (camposOk.has(campoId)) return camposOk.get(campoId)!;
        const [c] = await db
          .select({ id: medicaoCampo.id })
          .from(medicaoCampo)
          .where(and(
            eq(medicaoCampo.id, campoId),
            eq(medicaoCampo.companyId, companyId),
            eq(medicaoCampo.contratoId, contratoId),
          ))
          .limit(1);
        const ok = !!c;
        camposOk.set(campoId, ok);
        return ok;
      }

      const tsIn = (s?: string): Date => {
        const d = s ? new Date(s) : new Date();
        return isNaN(d.getTime()) ? new Date() : d;
      };
      const isNewer = (existing: Date | null, incoming: Date): boolean =>
        !!existing && existing.getTime() > incoming.getTime();

      type OpResult = {
        clientOpId: string;
        uuid?: string;
        status: "ok" | "conflito" | "erro";
        serverId?: number;
        mensagem?: string;
      };
      const resultados: OpResult[] = [];

      for (const op of input.operations) {
        const incoming = tsIn(op.atualizadoEm);
        try {
          // ───────── CONTORNO ─────────
          if (op.entity === "contorno") {
            if (op.action === "delete") {
              let alvo: any = null;
              if (op.id && op.id > 0) {
                [alvo] = await db.select({ id: medicaoCampoContornos.id, medicaoCampoId: medicaoCampoContornos.medicaoCampoId })
                  .from(medicaoCampoContornos)
                  .where(and(eq(medicaoCampoContornos.id, op.id), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
              } else if (op.uuid) {
                [alvo] = await db.select({ id: medicaoCampoContornos.id, medicaoCampoId: medicaoCampoContornos.medicaoCampoId })
                  .from(medicaoCampoContornos)
                  .where(and(eq(medicaoCampoContornos.uuid, op.uuid), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
              }
              // Só apaga se a linha pertence a um campo deste contrato (guard cross-contrato).
              // Não-encontrada = idempotente (já apagada / nunca existiu aqui) → "ok".
              if (alvo && (await campoValido(alvo.medicaoCampoId))) {
                await db.update(medicaoCampoContornos).set({ deletedAt: new Date() }).where(eq(medicaoCampoContornos.id, alvo.id));
              }
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok" });
              continue;
            }
            // upsert
            const d = op.data || {};
            const campoId = op.medicaoCampoId ?? d.medicaoCampoId;
            if (!campoId || !(await campoValido(campoId))) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Medição não encontrada ou sem permissão." });
              continue;
            }
            const fields = {
              pdfId: d.pdfId,
              pagina: d.pagina ?? 1,
              tipo: d.tipo,
              rotulo: d.rotulo ?? null,
              cor: d.cor ?? null,
              geometriaJson: d.geometriaJson ?? "[]",
              espessura: d.espessura ?? null,
              metrosPorUnidade: d.metrosPorUnidade ?? null,
              area: d.area ?? null,
              perimetro: d.perimetro ?? null,
              volume: d.volume ?? null,
              contagem: d.contagem ?? null,
              quantidade: d.quantidade ?? null,
              unidade: d.unidade ?? null,
              servico: d.servico ?? null,
              orcamentoItemId: d.orcamentoItemId ?? null,
              itemEapCodigo: d.itemEapCodigo ?? null,
              itemDescricao: d.itemDescricao ?? null,
              observacoes: d.observacoes ?? null,
            };
            // localizar existente por id (conhecido) OU por uuid
            let existing: any = null;
            if (op.id && op.id > 0) {
              [existing] = await db.select().from(medicaoCampoContornos)
                .where(and(eq(medicaoCampoContornos.id, op.id), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
            } else if (op.uuid) {
              [existing] = await db.select().from(medicaoCampoContornos)
                .where(and(eq(medicaoCampoContornos.uuid, op.uuid), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
            }
            if (existing) {
              // Guard cross-contrato: a linha existente precisa pertencer a um campo deste contrato.
              if (!(await campoValido(existing.medicaoCampoId))) {
                resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Contorno pertence a outro contrato." });
                continue;
              }
              if (isNewer(existing.atualizadoEm, incoming)) {
                resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "conflito", mensagem: "Versão no servidor é mais recente." });
                continue;
              }
              await db.update(medicaoCampoContornos)
                // Rev. 4780 — patch parcial de `servico`: se o client (versão antiga
                // offline) não mandar o campo, PRESERVA a classificação existente
                // em vez de zerar com null cego.
                .set({ ...fields, servico: d.servico !== undefined ? (d.servico ?? null) : (existing as any).servico, atualizadoEm: incoming })
                .where(and(eq(medicaoCampoContornos.id, existing.id), eq(medicaoCampoContornos.companyId, companyId)));
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok" });
              continue;
            }
            const [maxRow] = await db
              .select({ max: sql<number>`COALESCE(MAX(numero),0)::int` })
              .from(medicaoCampoContornos)
              .where(eq(medicaoCampoContornos.medicaoCampoId, campoId));
            const [row] = await db.insert(medicaoCampoContornos).values({
              companyId,
              medicaoCampoId: campoId,
              uuid: op.uuid,
              numero: (maxRow?.max ?? 0) + 1,
              atualizadoEm: incoming,
              ...fields,
            }).returning();
            resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: row.id, status: "ok" });
            continue;
          }

          // ───────── FOTO ─────────
          if (op.entity === "foto") {
            if (op.action === "delete") {
              let alvo: any = null;
              if (op.id && op.id > 0) {
                [alvo] = await db.select({ id: medicaoCampoFotos.id, medicaoCampoId: medicaoCampoFotos.medicaoCampoId })
                  .from(medicaoCampoFotos)
                  .where(and(eq(medicaoCampoFotos.id, op.id), eq(medicaoCampoFotos.companyId, companyId))).limit(1);
              } else if (op.uuid) {
                [alvo] = await db.select({ id: medicaoCampoFotos.id, medicaoCampoId: medicaoCampoFotos.medicaoCampoId })
                  .from(medicaoCampoFotos)
                  .where(and(eq(medicaoCampoFotos.uuid, op.uuid), eq(medicaoCampoFotos.companyId, companyId))).limit(1);
              }
              // Guard cross-contrato; não-encontrada = idempotente → "ok".
              if (alvo && (await campoValido(alvo.medicaoCampoId))) {
                await db.update(medicaoCampoFotos).set({ deletedAt: new Date() }).where(eq(medicaoCampoFotos.id, alvo.id));
              }
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok" });
              continue;
            }
            // upsert (create) — idempotente por uuid
            const d = op.data || {};
            const campoId = op.medicaoCampoId ?? d.medicaoCampoId;
            if (!campoId || !(await campoValido(campoId))) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Medição não encontrada ou sem permissão." });
              continue;
            }
            if (op.uuid) {
              // Dedup escopado ao campo já validado (evita casar uuid de outro contrato).
              const [existing] = await db.select({ id: medicaoCampoFotos.id }).from(medicaoCampoFotos)
                .where(and(
                  eq(medicaoCampoFotos.uuid, op.uuid),
                  eq(medicaoCampoFotos.companyId, companyId),
                  eq(medicaoCampoFotos.medicaoCampoId, campoId),
                )).limit(1);
              if (existing) {
                resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok" });
                continue;
              }
            }
            if (!op.base64) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Foto sem conteúdo." });
              continue;
            }
            const buf = Buffer.from(op.base64, "base64");
            const ext = (op.contentType || "").includes("png") ? "png" : "jpg";
            const key = `medicao-campo/${companyId}/${campoId}/fotos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { url } = await storagePut(key, buf, op.contentType || "image/jpeg");
            const [row] = await db.insert(medicaoCampoFotos).values({
              companyId,
              medicaoCampoId: campoId,
              pdfId: d.pdfId ?? null,
              contornoId: d.contornoId ?? null,
              uuid: op.uuid,
              arquivoUrl: url,
              arquivoKey: key,
              legenda: d.legenda ?? null,
              pagina: d.pagina ?? null,
              pinX: d.pinX ?? null,
              pinY: d.pinY ?? null,
            }).returning();
            resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: row.id, status: "ok" });
            continue;
          }

          // ───────── PDF (apenas calibração offline) ─────────
          if (op.entity === "pdf") {
            const d = op.data || {};
            if (!op.id || op.id <= 0) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "PDF sem id (calibração exige planta já existente)." });
              continue;
            }
            const [existing] = await db.select().from(medicaoCampoPdfs)
              .where(and(eq(medicaoCampoPdfs.id, op.id), eq(medicaoCampoPdfs.companyId, companyId))).limit(1);
            if (!existing) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Planta não encontrada ou sem permissão." });
              continue;
            }
            // Guard cross-contrato: a planta precisa pertencer a um campo deste contrato.
            if (!(await campoValido(existing.medicaoCampoId))) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Planta pertence a outro contrato." });
              continue;
            }
            if (isNewer(existing.atualizadoEm, incoming)) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "conflito", mensagem: "Calibração no servidor é mais recente." });
              continue;
            }
            await db.update(medicaoCampoPdfs)
              .set({ calibracaoJson: d.calibracaoJson ?? null, atualizadoEm: incoming })
              .where(and(eq(medicaoCampoPdfs.id, op.id), eq(medicaoCampoPdfs.companyId, companyId)));
            resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok" });
            continue;
          }
        } catch (e: any) {
          resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: e?.message || "Falha ao sincronizar." });
        }
      }

      const okCount = resultados.filter((r) => r.status === "ok").length;
      const conflitos = resultados.filter((r) => r.status === "conflito").length;
      const erros = resultados.filter((r) => r.status === "erro").length;
      return { resultados, okCount, conflitos, erros };
    }),
});
