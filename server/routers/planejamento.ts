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
// pg driver returns `date` columns as Date objects; after JSON serialization they become
// "2026-02-09T00:00:00.000Z". The frontend expects "YYYY-MM-DD" strings.
const toDateStr = (v: any): string =>
  v instanceof Date ? v.toISOString().split("T")[0] : String(v).slice(0, 10);

// Normaliza qualquer data para a segunda-feira da sua semana (YYYY-MM-DD).
// Usa UTC para evitar desvio de fuso: datas armazenadas como "YYYY-MM-DD" são
// interpretadas como midnight UTC, e getDay() em UTC é o correto aqui.
function toMondayStr(d: Date): string {
  const day  = d.getUTCDay();               // 0=dom, 1=seg, ..., 6=sáb
  const diff = day === 0 ? -6 : 1 - day;   // quantos dias voltar até segunda
  const m    = new Date(d.getTime() + diff * 86_400_000);
  return m.toISOString().split("T")[0];
}

export const planejamentoRouter = router({

  // ── Projetos ──────────────────────────────────────────────────────────────
  listarProjetos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";

      let allowedObraIds: number[] | null = null;
      if (!isAdmin) {
        const userResult = await db.execute(sql`SELECT allowed_obra_ids FROM users WHERE id = ${ctx.user.id}`);
        const userRows: any[] = userResult?.rows ?? userResult ?? [];
        const raw = userRows[0]?.allowed_obra_ids;
        let parsed: number[] = [];
        try { if (raw) parsed = JSON.parse(raw); } catch {}
        if (parsed.length > 0) {
          allowedObraIds = parsed;
        } else {
          const userEmail = ctx.user.email ?? "";
          if (!userEmail) return [];
          const empResult = await db.execute(sql`SELECT id FROM employees WHERE "companyId" = ${input.companyId} AND email = ${userEmail} AND "deletedAt" IS NULL LIMIT 1`);
          const empRows: any[] = empResult?.rows ?? empResult ?? [];
          if (!empRows.length) return [];
          const employeeId = empRows[0].id;
          const obrasResult = await db.execute(sql`
            SELECT DISTINCT of2."obraId" FROM obra_funcionarios of2
            INNER JOIN obras o ON o.id = of2."obraId" AND o."companyId" = ${input.companyId} AND o."deletedAt" IS NULL
            WHERE of2."employeeId" = ${employeeId} AND of2."isActive" = 1
          `);
          const obrasRows: any[] = obrasResult?.rows ?? obrasResult ?? [];
          allowedObraIds = obrasRows.map((r: any) => r.obraId);
          if (allowedObraIds.length === 0) return [];
        }
      }

      const rows = await db.select({
        id:                    planejamentoProjetos.id,
        companyId:             planejamentoProjetos.companyId,
        obraId:                planejamentoProjetos.obraId,
        orcamentoId:           planejamentoProjetos.orcamentoId,
        nome:                  planejamentoProjetos.nome,
        cliente:               planejamentoProjetos.cliente,
        local:                 planejamentoProjetos.local,
        responsavel:           planejamentoProjetos.responsavel,
        dataInicio:            planejamentoProjetos.dataInicio,
        dataTerminoContratual: planejamentoProjetos.dataTerminoContratual,
        valorContrato:         planejamentoProjetos.valorContrato,
        status:                planejamentoProjetos.status,
        descricao:             planejamentoProjetos.descricao,
        criadoEm:              planejamentoProjetos.criadoEm,
        atualizadoEm:          planejamentoProjetos.atualizadoEm,
        orcamentoTotalVenda:   orcamentos.totalVenda,
        orcamentoValorNegociado: orcamentos.valorNegociado,
      })
        .from(planejamentoProjetos)
        .leftJoin(orcamentos, eq(planejamentoProjetos.orcamentoId, orcamentos.id))
        .where(
          allowedObraIds !== null
            ? and(eq(planejamentoProjetos.companyId, input.companyId), inArray(planejamentoProjetos.obraId, allowedObraIds.length > 0 ? allowedObraIds : [0]))
            : eq(planejamentoProjetos.companyId, input.companyId)
        )
        .orderBy(desc(planejamentoProjetos.criadoEm));
      return rows;
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

      if (!input.obraId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "É obrigatório vincular uma obra ao planejamento.",
        });
      }

      const [orcamentoVinculado] = await db
        .select({
          id: orcamentos.id,
          totalCusto: orcamentos.totalCusto,
          totalVenda: orcamentos.totalVenda,
          tempoObraMeses: orcamentos.tempoObraMeses,
        })
        .from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          sql`${orcamentos.deletedAt} IS NULL`,
        ))
        .limit(1);
      if (!orcamentoVinculado) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não é possível criar um planejamento sem orçamento vinculado. Cadastre primeiro o orçamento da obra.",
        });
      }

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

      const orcId = orcamentoVinculado.id;

      const [projeto] = await db.insert(planejamentoProjetos).values({
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        orcamentoId:           orcId,
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

      const today = new Date().toISOString().split("T")[0];
      const [rev] = await db.insert(planejamentoRevisoes).values({
        projetoId:   projeto.id,
        numero:      0,
        descricao:   "Baseline inicial",
        dataRevisao: today,
        motivo:      "Criação do projeto",
        isBaseline:  true,
        status:      "aprovada",
      }).returning();

      console.log(`[CriarProjeto] Projeto #${projeto.id} criado para obra #${input.obraId} com orçamento #${orcId}. Cronograma vazio — aguardando importação do MS Project.`);

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
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [eq(planejamentoProjetos.id, input.id)];
      if (input.companyId) conditions.push(eq(planejamentoProjetos.companyId, input.companyId));
      const [projeto] = await db.select().from(planejamentoProjetos)
        .where(and(...conditions));
      if (!projeto) throw new Error("Projeto não encontrado");

      const [revisoes, orcamento] = await Promise.all([
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.id))
          .orderBy(asc(planejamentoRevisoes.numero))
          .catch(() => db.execute(
            sql`SELECT id, projeto_id, numero, descricao, data_revisao, motivo, responsavel, aprovado_por, status, observacao, is_baseline, false as consolidado, diferencas, criado_em FROM planejamento_revisoes WHERE projeto_id = ${input.id} ORDER BY numero ASC`
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
                isIndireta:          a.isIndireta ?? false,
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

  reativarRevisao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadoPor: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem reativar revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.status !== "cancelada") throw new Error("Somente revisões canceladas podem ser reativadas.");
      if (rev.projetoId && ctx.user.role !== "admin_master") {
        const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, rev.projetoId));
        if (proj && String(proj.companyId) !== String(ctx.user.companyId)) throw new Error("Sem permissão para esta revisão.");
      }
      await db.update(planejamentoRevisoes)
        .set({ status: "aprovada", aprovadoPor: input.aprovadoPor ?? ctx.user.name ?? null })
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

      if (novosAvancos.length) {
        await db.transaction(async (tx) => {
          const chunkSize = 200;
          for (let i = 0; i < novosAvancos.length; i += chunkSize) {
            await tx.insert(planejamentoAvancos).values(novosAvancos.slice(i, i + chunkSize));
          }
        });
      }
      return { transferidas: novosAvancos.length };
    }),

  // ── Atividades ────────────────────────────────────────────────────────────
  listarAtividades: protectedProcedure
    .input(z.object({ revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId))
        .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));
      return rows.map(r => ({
        ...r,
        dataInicio: r.dataInicio ? toDateStr(r.dataInicio) : null,
        dataFim:    r.dataFim    ? toDateStr(r.dataFim)    : null,
      }));
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
        isMarco:             z.boolean().optional(),
        isIndireta:          z.boolean().optional(),
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
        isMarco:             a.isMarco ?? false,
        isIndireta:          a.isIndireta ?? false,
      }));

      const allPesosZero = rows.every(r => parseFloat(r.pesoFinanceiro) === 0 || r.isGrupo);
      if (allPesosZero) {
        let pesoCalculado = false;

        const [proj] = await db.select({ orcamentoId: planejamentoProjetos.orcamentoId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
        if (proj?.orcamentoId) {
          try {
            const eapItens = await db.select({
              eapCodigo: orcamentoItens.eapCodigo,
              custoTotal: orcamentoItens.custoTotal,
            }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, proj.orcamentoId));

            if (eapItens.length > 0) {
              const custoMap = new Map<string, number>();
              for (const it of eapItens) custoMap.set(it.eapCodigo ?? "", parseFloat(it.custoTotal ?? "0") || 0);

              const folhas = rows.filter(r => !r.isGrupo);
              const totalCusto = folhas.reduce((s, r) => s + (custoMap.get(r.eapCodigo ?? "") ?? 0), 0);

              if (totalCusto > 0) {
                for (const r of rows) {
                  if (r.isGrupo) { r.pesoFinanceiro = "0"; continue; }
                  const custo = custoMap.get(r.eapCodigo ?? "") ?? 0;
                  r.pesoFinanceiro = String(+((custo / totalCusto) * 100).toFixed(4));
                }
                pesoCalculado = true;
              }
            }
          } catch (_) {}
        }

        if (!pesoCalculado) {
          const folhas = rows.filter(r => !r.isGrupo && (r.duracaoDias ?? 0) > 0);
          const totalDias = folhas.reduce((s, r) => s + (r.duracaoDias ?? 0), 0);
          if (totalDias > 0) {
            for (const r of rows) {
              if (r.isGrupo) { r.pesoFinanceiro = "0"; continue; }
              const dur = r.duracaoDias ?? 0;
              r.pesoFinanceiro = String(+((dur / totalDias) * 100).toFixed(4));
            }
          }
        }
      }

      const inputWithIds = input.atividades.map((a, i) => ({ ...a, _idx: i }));
      const toUpdate = inputWithIds.filter(a => a.id != null && a.id > 0);
      const toInsert = inputWithIds.filter(a => a.id == null || a.id <= 0);
      const sentIds = toUpdate.map(a => a.id!);

      await db.transaction(async (tx) => {
        const existing = await tx.select({ id: planejamentoAtividades.id })
          .from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));
        const existingIds = new Set(existing.map(e => e.id));
        const toDeleteIds = [...existingIds].filter(id => !sentIds.includes(id));

        if (toDeleteIds.length > 0) {
          await tx.delete(planejamentoAtividades)
            .where(inArray(planejamentoAtividades.id, toDeleteIds));
        }

        if (toUpdate.length > 0) {
          const BATCH = 50;
          for (let b = 0; b < toUpdate.length; b += BATCH) {
            const batch = toUpdate.slice(b, b + BATCH);
            const cases = (field: string, getValue: (r: any) => string) => {
              const whens = batch.map(a => `WHEN ${a.id} THEN ${getValue(rows[a._idx])}`).join(" ");
              return `${field} = CASE id ${whens} ELSE ${field} END`;
            };
            const esc = (v: any) => v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
            const escBool = (v: any) => v ? "TRUE" : "FALSE";
            const escNum = (v: any) => v == null ? "0" : String(Number(v) || 0);
            const batchIds = batch.map(a => a.id!);

            await tx.execute(sql.raw(`
              UPDATE planejamento_atividades SET
                ${cases("eap_codigo", r => esc(r.eapCodigo))},
                ${cases("nome", r => esc(r.nome))},
                ${cases("nivel", r => escNum(r.nivel))},
                ${cases("data_inicio", r => r.dataInicio ? esc(r.dataInicio) : "NULL")},
                ${cases("data_fim", r => r.dataFim ? esc(r.dataFim) : "NULL")},
                ${cases("duracao_dias", r => escNum(r.duracaoDias))},
                ${cases("predecessora", r => esc(r.predecessora))},
                ${cases("peso_financeiro", r => esc(r.pesoFinanceiro))},
                ${cases("recurso_principal", r => esc(r.recursoPrincipal))},
                ${cases("quantidade_planejada", r => esc(r.quantidadePlanejada))},
                ${cases("unidade", r => esc(r.unidade))},
                ${cases("ordem", r => escNum(r.ordem))},
                ${cases("is_grupo", r => escBool(r.isGrupo))},
                ${cases("is_marco", r => escBool(r.isMarco))},
                ${cases("is_indireta", r => escBool(r.isIndireta))}
              WHERE id IN (${batchIds.join(",")})
                AND revisao_id = ${input.revisaoId}
            `));
          }
        }

        if (toInsert.length > 0) {
          const insertRows = toInsert.map(a => rows[a._idx]);
          const CHUNK = 100;
          for (let i = 0; i < insertRows.length; i += CHUNK) {
            await tx.insert(planejamentoAtividades).values(insertRows.slice(i, i + CHUNK));
          }
        }
      });

      return { success: true };
    }),

  // ── Avanços físicos semanais ──────────────────────────────────────────────
  listarAvancos: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
        ))
        .orderBy(asc(planejamentoAvancos.semana), asc(planejamentoAvancos.atividadeId));
      return rows.map(r => ({ ...r, semana: toDateStr(r.semana) }));
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
      return rows.map(r => toDateStr(r.semana));
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
        eq(planejamentoAvancos.revisaoId,   input.revisaoId),
        eq(planejamentoAvancos.semana,      input.semana),
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
      const rows = await db.select().from(planejamentoRefis)
        .where(eq(planejamentoRefis.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRefis.semana));
      return rows.map(r => ({ ...r, semana: toDateStr(r.semana) }));
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

  limparAvancosSemana: protectedProcedure
    .input(z.object({ projetoId: z.number(), semana: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.semana, input.semana),
        ));
      return { success: true };
    }),

  toggleMarco: protectedProcedure
    .input(z.object({ atividadeId: z.number(), isMarco: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE planejamento_atividades
        SET is_marco = ${input.isMarco}
        WHERE id = ${input.atividadeId}
      `);
      return { success: true };
    }),

  // ── Curva S ───────────────────────────────────────────────────────────────
  getCurvaS: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number(), baselineId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [atividades, baseline, avancosRaw] = await Promise.all([
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
      // Normaliza semana para "YYYY-MM-DD" (pg retorna colunas date como Date objects)
      const avancos = avancosRaw.map(av => ({ ...av, semana: toDateStr(av.semana) }));

      function gerarCurvaPlanejada(ativs: typeof atividades) {
        if (!ativs.length) return [];
        const folhas = ativs.filter(a => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];

        const pesoBruto   = folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
        const ativComPeso = folhas.filter(a => n(a.pesoFinanceiro) > 0).length;
        // Usa peso igual se: todos têm peso 0 OU menos de 20% das atividades têm peso definido
        // (evita que poucas atividades com peso dominem a curva, como "FIM DO PROJETO")
        const usarIgual = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
        const pesoTotal = usarIgual ? folhas.length : pesoBruto;

        const dates: Map<string, number> = new Map();
        folhas.forEach(a => {
          // Parseia datas evitando desvio de fuso: usa meio-dia UTC para garantir que
          // "2026-01-26" nunca vire "2026-01-25" ao normalizar para segunda-feira.
          const parseDate = (v: any): Date => {
            const s = toDateStr(v).slice(0, 10); // "YYYY-MM-DD"
            return new Date(s + "T12:00:00Z");
          };
          const inicio = parseDate(a.dataInicio);
          const fim    = parseDate(a.dataFim);
          if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return; // ignora datas inválidas
          // Normaliza início e fim para a segunda-feira da respectiva semana
          const inicioSeg = new Date(toMondayStr(inicio) + "T12:00:00Z");
          const fimSeg    = new Date(toMondayStr(fim)    + "T12:00:00Z");
          // dur = nº de semanas que a atividade ocupa.
          // inicioSeg e fimSeg são sempre segundas-feiras → diferença é SEMPRE múltiplo exato de 7 dias.
          // +1 para incluir a semana do fimSeg (atividade está ativa nesse período).
          const weeksDiff = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000); // inteiro exato
          const dur       = Math.max(1, weeksDiff + 1);
          const pesoAtiv = usarIgual ? 1 : n(a.pesoFinanceiro);
          const semPeso  = pesoAtiv / dur / pesoTotal * 100;
          let cur = new Date(inicioSeg);
          for (let i = 0; i < dur; i++) {
            // Chave sempre é uma segunda-feira — garante alinhamento com o eixo X do gráfico
            const key = toMondayStr(cur);
            dates.set(key, (dates.get(key) ?? 0) + semPeso);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        });

        const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        if (sorted.length === 0) return [];
        const primeiraSemana = sorted[0][0];
        const semanaAnterior = new Date(new Date(primeiraSemana + "T12:00:00Z").getTime() - 7 * 86400000);
        const semZero = toMondayStr(semanaAnterior);
        let acum = 0;
        const pontos = [{ semana: semZero, acumulado: 0 }];
        sorted.forEach(([semana, val]) => {
          acum = Math.min(100, acum + val);
          pontos.push({ semana, acumulado: +acum.toFixed(2) });
        });
        return pontos;
      }

      // Baseline: sempre gerada (é o plano original imutável — Rev 00)
      const curvaBaseline = gerarCurvaPlanejada(baseline);
      // "Revisão Atual" só faz sentido quando é DIFERENTE da baseline;
      // se há só uma revisão, a curva planejada é idêntica e mostramos apenas a baseline (azul).
      const curvaPlanejada = input.baselineId !== input.revisaoId
        ? gerarCurvaPlanejada(atividades)
        : [];

      // Curva realizada — acumulado ponderado por atividade (idêntico ao REFIS)
      // Para cada semana com avanços, calcula o acumulado ponderado real
      // (mesmo algoritmo usado em avancoRealAtual no cliente)
      const folhasParaCurva    = atividades.filter(a => !a.isGrupo && !a.isIndireta);
      const pesoBrutoCurva     = folhasParaCurva.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
      const ativComPesoCurva   = folhasParaCurva.filter(a => n(a.pesoFinanceiro) > 0).length;
      const usarIgualCurva     = pesoBrutoCurva === 0 || ativComPesoCurva < folhasParaCurva.length * 0.2;
      const pesoTotalCurva     = usarIgualCurva ? folhasParaCurva.length || 1 : pesoBrutoCurva;

      // Obtém todas as semanas com dados, em ordem
      const semanasComAvanco = [...new Set(avancos.map(av => av.semana))].sort();

      const curvaRealizada = semanasComAvanco.map(semana => {
        const latestMap: Record<number, { val: number; sem: string }> = {};
        avancos
          .filter(av => av.semana <= semana)
          .forEach(av => {
            const id = av.atividadeId;
            if (!latestMap[id] || av.semana > latestMap[id].sem) {
              latestMap[id] = { val: n(av.percentualAcumulado), sem: av.semana };
            }
          });
        let soma = 0;
        folhasParaCurva.forEach(a => {
          const peso = usarIgualCurva ? 1 : n(a.pesoFinanceiro);
          soma += (latestMap[a.id]?.val ?? 0) * (peso / pesoTotalCurva);
        });
        return { semana, acumulado: +Math.min(100, soma).toFixed(2) };
      });

      if (curvaRealizada.length > 0) {
        if (curvaRealizada[0].acumulado !== 0) {
          const primeiraSemReal = curvaRealizada[0].semana;
          const semAnteriorReal = new Date(new Date(primeiraSemReal + "T12:00:00Z").getTime() - 7 * 86400000);
          const semZeroReal = toMondayStr(semAnteriorReal);
          curvaRealizada.unshift({ semana: semZeroReal, acumulado: 0 });
        }
      }

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
        const folhas = ativs.filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];
        const pesoBruto   = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
        const ativComPeso = folhas.filter((a: any) => n(a.pesoFinanceiro) > 0).length;
        const usarIgual   = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
        const pesoTotal   = usarIgual ? folhas.length : pesoBruto;
        const dates: Map<string, number> = new Map();
        folhas.forEach((a: any) => {
          const parseD = (v: any) => new Date(toDateStr(v).slice(0, 10) + "T12:00:00Z");
          const inicio = parseD(a.dataInicio);
          const fim    = parseD(a.dataFim);
          if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return;
          const inicioSeg = new Date(toMondayStr(inicio) + "T12:00:00Z");
          const fimSeg    = new Date(toMondayStr(fim)    + "T12:00:00Z");
          const weeksDiff2 = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000);
          const dur     = Math.max(1, weeksDiff2 + 1);
          const pAtiv   = usarIgual ? 1 : n(a.pesoFinanceiro);
          const semPeso = pAtiv / dur / pesoTotal * 100;
          let cur = new Date(inicioSeg);
          for (let i = 0; i < dur; i++) {
            const key = toMondayStr(cur);
            dates.set(key, (dates.get(key) ?? 0) + semPeso);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        });
        const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        let acum = 0;
        const pts = sorted.map(([semana, val]) => {
          acum = Math.min(100, acum + val);
          return { semana, acumulado: +acum.toFixed(2) };
        });
        if (pts.length > 0) {
          const primeiraDate   = new Date(pts[0].semana + "T12:00:00Z");
          const semanaAntes    = new Date(primeiraDate.getTime() - 7 * 86400000);
          pts.unshift({ semana: toMondayStr(semanaAntes), acumulado: 0 });
        }
        return pts;
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

  // ── Curva S de Faturamento Real (medições aprovadas acumuladas) ──────────
  getCurvaMedicoes: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const meds = await db.select().from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, input.projetoId))
        .orderBy(asc(planejamentoMedicoes.competencia));
      let acumulado = 0;
      return meds.map(m => {
        acumulado += n(m.valorMedido);
        return {
          competencia:    m.competencia,        // "YYYY-MM"
          valorMedido:    n(m.valorMedido),
          valorAcumulado: +acumulado.toFixed(2),
          status:         m.status ?? "pendente",
        };
      });
    }),

  // ── Toggle disabled em bloco (remover/restaurar do escopo) ────────────────
  toggleAtividadesDisabled: protectedProcedure
    .input(z.object({
      ids:     z.array(z.number()),
      disabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      if (!input.ids.length) return { updated: 0 };
      const db = await getDb();
      await db.execute(sql`
        UPDATE planejamento_atividades
        SET disabled = ${input.disabled}
        WHERE id = ANY(ARRAY[${sql.raw(input.ids.join(","))}]::int[])
      `);
      return { updated: input.ids.length };
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

      // Cruzamento orçamento × cronograma: usa apenas itens-FOLHA do orçamento
      // (sem sub-itens) para evitar dupla contagem de valores acumulados em itens-pai.
      // Cada item pode cruzar com MÚLTIPLAS atividades (mesmo nome em pavimentos diferentes).
      // Nesse caso o valor do item é dividido igualmente entre as N atividades (valor/N).
      const revAtiva = await db.execute(sql`
        SELECT r.id FROM planejamento_revisoes r
        WHERE r.projeto_id = ${input.projetoId}
          AND r.status = 'aprovada'
        ORDER BY r.numero DESC LIMIT 1
      `);
      const revId = (revAtiva.rows as any[])[0]?.id ?? 0;

      const rows = await db.execute(sql`
        WITH orc_scope AS (
          SELECT i.*
          FROM orcamento_itens i
          JOIN planejamento_projetos p ON p.orcamento_id = i."orcamentoId" AND p.id = ${input.projetoId}
          WHERE (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
        ),
        folhas AS (
          SELECT o.*
          FROM orc_scope o
          WHERE NOT EXISTS (
            SELECT 1 FROM orc_scope c
            WHERE c."eapCodigo" LIKE o."eapCodigo" || '.%'
              AND c.id != o.id
          )
        ),
        norm_name AS (
          SELECT *, LOWER(REGEXP_REPLACE(TRIM(descricao), '[[:space:]]+', ' ', 'g')) AS nome_norm
          FROM folhas
        ),
        norm_ativ AS (
          SELECT *, LOWER(REGEXP_REPLACE(TRIM(nome), '[[:space:]]+', ' ', 'g')) AS nome_norm
          FROM planejamento_atividades
          WHERE projeto_id = ${input.projetoId}
            AND revisao_id = ${revId}
            AND NOT is_grupo
            AND data_inicio IS NOT NULL
            AND data_fim IS NOT NULL
        ),
        match_exact AS (
          SELECT i.id AS item_id, a.id AS ativ_id
          FROM norm_name i
          JOIN norm_ativ a ON a.nome_norm = i.nome_norm
        ),
        match_contains AS (
          SELECT i.id AS item_id, a.id AS ativ_id
          FROM norm_name i
          JOIN norm_ativ a ON (a.nome_norm LIKE '%' || i.nome_norm || '%' OR i.nome_norm LIKE '%' || a.nome_norm || '%')
          WHERE NOT EXISTS (SELECT 1 FROM match_exact m WHERE m.item_id = i.id)
            AND LENGTH(i.nome_norm) >= 5
            AND LENGTH(a.nome_norm) >= 5
        ),
        all_matches AS (
          SELECT * FROM match_exact
          UNION ALL
          SELECT * FROM match_contains
        ),
        all_pairs AS (
          SELECT
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
            a.ordem                                AS ordem,
            COUNT(*) OVER (PARTITION BY i.id)      AS n_ativs
          FROM folhas i
          JOIN all_matches m ON m.item_id = i.id
          JOIN norm_ativ a ON a.id = m.ativ_id
        )
        SELECT
          item_id, eap, nome,
          (venda_total / n_ativs) AS venda_total,
          (meta_total  / n_ativs) AS meta_total,
          (custo_total / n_ativs) AS custo_total,
          (custo_mat   / n_ativs) AS custo_mat,
          (custo_mdo   / n_ativs) AS custo_mdo,
          unidade,
          (quantidade  / n_ativs) AS quantidade,
          ativ_id, data_inicio, data_fim, ordem
        FROM all_pairs
        ORDER BY ordem
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
      sinalValor:        z.number().optional(),
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
        inicioFaturamento: input.inicioFaturamento
          ? (input.inicioFaturamento.length === 7 ? input.inicioFaturamento + "-01" : input.inicioFaturamento.substring(0, 10))
          : null,
        sinalPct:          String(input.sinalPct ?? 0),
        sinalValor:        String(input.sinalValor ?? 0),
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
        sinalValor:        data.sinalValor,
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

      const hoje2 = new Date().toISOString().split("T")[0];
      const [novaRevisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:    input.projetoId,
        numero:       (revisaoAtual.numero ?? 0) + 1,
        descricao:    "Cronograma gerado pelo Simulador de Orçamento Mensal",
        dataRevisao:  hoje2,
        status:       "aprovada",
        aprovadoPor:  ctx.user?.name || "Sistema",
        isBaseline:   false,
        consolidado:  false,
      }).returning({ id: planejamentoRevisoes.id });

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
      // Parcelas intermediárias: aporte extra de capital por mês (opcional)
      parcelas:        z.array(z.object({ mes: z.number().int().positive(), valor: z.number().positive() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Obter o projeto e seu orçamento vinculado
      const projeto = await db.select().from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId))
        .then(r => r[0]);
      if (!projeto) throw new Error("Projeto não encontrado.");
      if (!projeto.orcamentoId) throw new Error("Este projeto não tem orçamento vinculado.");

      // 2. Buscar TODOS os itens do orçamento (grupos + folhas) — preserva EAP exata do upload
      const todosItens = await db.select({
        eapCodigo:     orcamentoItens.eapCodigo,
        descricao:     orcamentoItens.descricao,
        unidade:       orcamentoItens.unidade,
        custoTotal:    orcamentoItens.custoTotal,
        custoTotalMat: orcamentoItens.custoTotalMat,
        custoTotalMdo: orcamentoItens.custoTotalMdo,
        tipo:          orcamentoItens.tipo,
      })
      .from(orcamentoItens)
      .where(and(
        eq(orcamentoItens.orcamentoId, projeto.orcamentoId),
        or(
          eq(orcamentoItens.tipo, 'Etapa/Subetapa'),
          sql`${orcamentoItens.custoTotal} > 0`,
        ),
      ))
      .orderBy(asc(orcamentoItens.eapCodigo));

      if (todosItens.length === 0) throw new Error("O orçamento vinculado não tem itens cadastrados.");

      // Separar grupos (Etapa/Subetapa) e folhas (itens com custo > 0 que não são grupos)
      const TIPO_GRUPO = 'Etapa/Subetapa';
      const gruposOrc  = todosItens.filter(i => i.tipo === TIPO_GRUPO);
      const folhasOrc  = todosItens.filter(i => i.tipo !== TIPO_GRUPO && parseFloat(String(i.custoTotal || 0)) > 0);

      if (folhasOrc.length === 0) throw new Error("O orçamento não tem atividades folha com custo > 0.");

      // Calcular ratios Mat/MdO globais a partir das folhas
      const totalMatOrc = folhasOrc.reduce((s, i) => s + parseFloat(String(i.custoTotalMat || 0)), 0);
      const totalMdoOrc = folhasOrc.reduce((s, i) => s + parseFloat(String(i.custoTotalMdo || 0)), 0);
      const totalGeral  = folhasOrc.reduce((s, i) => s + parseFloat(String(i.custoTotal    || 0)), 0);
      const ratioMat    = totalGeral > 0 ? totalMatOrc / totalGeral : 0;
      const ratioMdo    = totalGeral > 0 ? totalMdoOrc / totalGeral : 0;

      // 3. Chamar IA — APENAS para definir duracaoDias + predecessora de cada folha
      const { invokeLLM } = await import("../_core/llm");

      // Monta lista somente das folhas (grupos não precisam de duração/predecessora)
      const listaParaIA = folhasOrc.map(i => {
        const custo    = parseFloat(String(i.custoTotal    || 0));
        const custoMat = parseFloat(String(i.custoTotalMat || 0));
        const custoMdo = parseFloat(String(i.custoTotalMdo || 0));
        const pct      = totalGeral > 0 ? ((custo / totalGeral) * 100).toFixed(2) : "0";
        const matStr   = custoMat > 0 ? ` MAT:R$${custoMat.toFixed(2)}` : "";
        const mdoStr   = custoMdo > 0 ? ` MDO:R$${custoMdo.toFixed(2)}` : "";
        return `EAP:${i.eapCodigo} | ${i.descricao} | R$${custo.toFixed(2)} (${pct}%)${matStr}${mdoStr}`;
      }).join("\n");

      const valorFmt  = input.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const mensalFmt = input.orcamentoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const mesesEst  = Math.ceil(input.valorTotal / input.orcamentoMensal);

      const prompt = `Você é um especialista sênior em planejamento e cronograma de obras de construção civil, com domínio em:
- Método do Caminho Crítico (CPM/PERT) — Harold Kerzner, Gregory Horine, Aldo Dórea Mattos
- Last Planner System (Glenn Ballard) e Linha de Balanço (LOB)
- Sequência construtiva conforme ABNT, NBR 12.741 e SINDUSCON-SP
- Planejamento de obras residenciais, comerciais e industriais no Brasil

MISSÃO ESTRITA: Você receberá a lista EXATA de atividades do orçamento da obra. Para cada atividade folha, defina SOMENTE:
  1. duracaoDias: duração estimada em dias corridos
  2. predecessora: código(s) EAP da(s) atividade(s) que devem terminar antes desta iniciar (separar por vírgula se múltiplas; vazio "" se não houver)

REGRAS ABSOLUTAS — VIOLÁ-LAS INVALIDA O CRONOGRAMA:
- NÃO crie atividades que não estão na lista
- NÃO remova atividades da lista
- NÃO altere nomes, descrições ou códigos EAP
- Retorne EXATAMENTE ${folhasOrc.length} objetos — um para cada EAP da lista abaixo, na mesma ordem
- Os EAP codes das predecessoras devem referenciar SOMENTE códigos presentes nesta mesma lista

PARÂMETROS DA OBRA:
- Valor total do contrato: ${valorFmt}
- Desembolso máximo mensal: ${mensalFmt} (ritmo financeiro de execução)
- Prazo estimado: ~${mesesEst} meses
- Data de início: ${input.dataInicio}

REGRAS DE DURAÇÃO (dias corridos):
- Atividade de gestão/mobilização permanente: 300–400 dias (duração total da obra)
- Serviços de estrutura/fundação/concreto: 20–90 dias conforme porte
- Instalações prediais (elétrica, hidráulica, esgoto): 8–30 dias por andar/fase
- Revestimentos, acabamentos, pintura: 8–25 dias por fase
- Item pequeno (< 0,5% do valor): 5–10 dias
- Item médio (0,5–3%): 10–30 dias
- Item grande (3–10%): 30–60 dias
- Item major (> 10%): 60–150 dias

REGRAS DE SEQUÊNCIA CONSTRUTIVA (predecessoras):
Respeite rigorosamente a lógica física da construção:
1. Serviços preliminares e canteiro → sempre iniciam sem predecessora (início da obra)
2. Terraplenagem/escavação → após canteiro
3. Fundações (estacas, blocos, baldrame, radier) → após escavação
4. Estrutura (pilares→vigas→lajes, concretagem) → após fundações
5. Alvenaria/vedação → após estrutura do pavimento correspondente
6. Cobertura → após estrutura do último pavimento
7. Instalações elétricas/hidráulicas embutidas → paralelas com alvenaria (mesma fase)
8. Instalações aparentes/terminais → após revestimentos
9. Revestimento interno (chapisco/reboco) → após alvenaria seca
10. Impermeabilização/contrapiso → após estrutura + revestimentos molhados
11. Piso/cerâmica/porcelanato → após contrapiso
12. Esquadrias → após revestimento externo
13. Louças/metais/acessórios → após revestimento de paredes
14. Pintura final → após todos os revestimentos
15. Limpeza/entrega → última fase
- Atividades no mesmo pavimento podem ser paralelas se fisicamente possíveis
- Atividades em pavimentos diferentes do mesmo tipo podem iniciar com defasagem de 1–2 semanas

LISTA EXATA DAS ATIVIDADES DO ORÇAMENTO (${folhasOrc.length} atividades folha — retorne todas):
${listaParaIA}

Retorne SOMENTE este JSON (sem markdown, sem comentários, sem texto extra):
{
  "atividades": [
    {"eapCodigo":"EAP_EXATO_DO_ITEM","duracaoDias":NUMERO_INTEIRO,"predecessora":"EAP_PRED_OU_VAZIO"},
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
        let depth = 0; let inStr = false; let esc = false;
        for (let i = start; i < text.length; i++) {
          if (esc) { esc = false; continue; }
          if (text[i] === '\\' && inStr) { esc = true; continue; }
          if (text[i] === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
        }
        return null; // JSON não fechado (resposta truncada)
      }

      // Quando a IA trunca a resposta, tenta salvar as atividades já geradas antes do corte.
      // Extrai todos os objetos de atividade COMPLETOS da resposta parcial.
      function repairTruncatedJson(text: string): string | null {
        const arrIdx = text.indexOf('"atividades"');
        if (arrIdx === -1) return null;
        const arrStart = text.indexOf('[', arrIdx);
        if (arrStart === -1) return null;
        const activities: string[] = [];
        let i = arrStart + 1;
        while (i < text.length) {
          while (i < text.length && /[\s,]/.test(text[i])) i++;
          if (i >= text.length || text[i] !== '{') break;
          let depth = 0; let inS = false; let es = false; let objEnd = -1;
          for (let j = i; j < text.length; j++) {
            if (es) { es = false; continue; }
            if (text[j] === '\\' && inS) { es = true; continue; }
            if (text[j] === '"') { inS = !inS; continue; }
            if (inS) continue;
            if (text[j] === '{') depth++;
            else if (text[j] === '}') { depth--; if (depth === 0) { objEnd = j; break; } }
          }
          if (objEnd === -1) break; // objeto incompleto = corte aqui
          activities.push(text.slice(i, objEnd + 1));
          i = objEnd + 1;
        }
        if (activities.length === 0) return null;
        console.log(`[repairJson] Resposta truncada — salvando ${activities.length} atividades completas`);
        return `{"atividades":[${activities.join(',')}]}`;
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
        // Tenta JSON completo primeiro; se truncado, repara extraindo atividades completas
        let jsonStr = extractFirstJson(rawText) ?? repairTruncatedJson(rawText);
        if (!jsonStr) {
          console.error("[gerarCronograma] Resposta sem JSON recuperável:", rawText.slice(0, 400));
          throw new Error("A IA não retornou JSON válido. Tente novamente ou reduza o escopo do orçamento.");
        }
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.atividades) && parsed.atividades.length > 0) {
          atividadesGeradas = parsed.atividades;
          if (atividadesGeradas.length > 0 && !extractFirstJson(rawText)) {
            console.warn(`[gerarCronograma] Resposta truncada — ${atividadesGeradas.length} atividades recuperadas pelo repair`);
          }
        } else {
          console.error("[gerarCronograma] JSON sem campo 'atividades':", jsonStr.slice(0, 300));
        }
      } catch (e: any) {
        console.error("[gerarCronograma] Erro ao parsear JSON:", e?.message, "| raw:", rawText.slice(0, 500));
        throw new Error(`Falha ao interpretar resposta da IA: ${e?.message ?? "JSON inválido"}`);
      }

      // ── MERGE: funde resposta da IA com estrutura EXATA do orçamento ─────────
      // A IA retorna só {eapCodigo, duracaoDias, predecessora} das folhas.
      // Grupos e pesoFinanceiro vêm 100% do orçamento — a IA não toca nisso.
      {
        const aiMap = new Map<string, { duracaoDias: number; predecessora: string }>(
          atividadesGeradas.map(a => [a.eapCodigo, { duracaoDias: a.duracaoDias, predecessora: a.predecessora }])
        );
        atividadesGeradas = todosItens.map(item => {
          const isGrupo = item.tipo === TIPO_GRUPO;
          const custo   = parseFloat(String(item.custoTotal || 0));
          const nivel   = (item.eapCodigo || "").split('.').length;
          if (isGrupo) {
            return { eapCodigo: item.eapCodigo, nome: item.descricao ?? "", nivel, isGrupo: true, duracaoDias: 0, predecessora: "", pesoFinanceiro: 0, unidade: "" };
          }
          const ai = aiMap.get(item.eapCodigo);
          return {
            eapCodigo:       item.eapCodigo,
            nome:            item.descricao ?? "",
            nivel,
            isGrupo:         false,
            duracaoDias:     ai?.duracaoDias ?? 10,
            predecessora:    ai?.predecessora ?? "",
            pesoFinanceiro:  totalGeral > 0 ? (custo / totalGeral) * 100 : 0,
            unidade:         item.unidade || "vb",
          };
        });
        const folhasMerge = atividadesGeradas.filter(a => !a.isGrupo);
        console.log(`[gerarCronograma] Merge EAP: ${todosItens.length} total (${gruposOrc.length} grupos, ${folhasMerge.length} folhas). IA retornou ${aiMap.size} folhas.`);
      }

      if (atividadesGeradas.length === 0) throw new Error("A IA não retornou atividades válidas.");

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

      // Mapa de capital extra por mês (parcelas intermediárias aprovadas), em centavos
      const extraCapCentsMap = new Map<number, number>();
      if (input.parcelas && input.parcelas.length > 0) {
        input.parcelas.forEach(p => {
          extraCapCentsMap.set(p.mes, (extraCapCentsMap.get(p.mes) ?? 0) + Math.round(p.valor * 100));
        });
        console.log(`[gerarCronograma] Parcelas intermediárias: ${input.parcelas.length} aportes, total extra = R$ ${(input.parcelas.reduce((s, p) => s + p.valor, 0)).toFixed(2)}`);
      }

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
        // Teto deste mês = orçamento base + aporte extra (se houver)
        const tetoCents = orcMensalCents + (extraCapCentsMap.get(mesNum) ?? 0);

        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i];
          const preds = predSet.get(a.eapCodigo) ?? new Set<string>();
          if (![...preds].every(p => completedEaps.has(p))) continue;
          const cents = custoCentsMap.get(a.eapCodigo) ?? 0;
          if (mesCustoCents + cents <= tetoCents || mesAtivs.length === 0) {
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

      const hoje = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const [novaRevisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:    input.projetoId,
        numero:       (revisaoAtual.numero ?? 0) + 1,
        descricao:    "Cronograma gerado por IA a partir do orçamento",
        dataRevisao:  hoje,
        status:       "aprovada",
        aprovadoPor:  ctx.user?.name || "Sistema",
        isBaseline:   false,
        consolidado:  false,
      }).returning({ id: planejamentoRevisoes.id });

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

  // ── Curva S Financeira ───────────────────────────────────────────────────
  // Distribui o valor total (orçamento ou contrato) pelas atividades folha
  // do cronograma, ponderado pelo peso_financeiro de cada atividade.
  // Se < 20% das atividades têm peso, usa peso igual (1/N).
  getCurvaSFinanceira: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      revisaoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [projeto] = await db.select({
        id:            planejamentoProjetos.id,
        orcamentoId:   planejamentoProjetos.orcamentoId,
        valorContrato: planejamentoProjetos.valorContrato,
      })
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId))
        .limit(1);

      const todasAtividades = await db.select({
        id:             planejamentoAtividades.id,
        eapCodigo:      planejamentoAtividades.eapCodigo,
        nome:           planejamentoAtividades.nome,
        dataInicio:     planejamentoAtividades.dataInicio,
        dataFim:        planejamentoAtividades.dataFim,
        isGrupo:        planejamentoAtividades.isGrupo,
        isMarco:        planejamentoAtividades.isMarco,
        pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
      })
        .from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      const folhas = todasAtividades.filter(a =>
        !a.isGrupo && !a.isMarco && a.dataInicio && a.dataFim,
      );

      if (folhas.length === 0) {
        return { status: "ok" as const, divergencias: [], curva: [], totalVenda: 0 };
      }

      let totalVenda = 0;

      if (projeto?.orcamentoId) {
        const [orc] = await db.select({ totalVenda: orcamentos.totalVenda })
          .from(orcamentos)
          .where(eq(orcamentos.id, projeto.orcamentoId));
        if (orc) totalVenda = n(orc.totalVenda);
      }

      if (totalVenda === 0) {
        totalVenda = n(projeto?.valorContrato);
      }

      if (totalVenda === 0) {
        return { status: "ok" as const, divergencias: [], curva: [], totalVenda: 0 };
      }

      const pesoBruto   = folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
      const ativComPeso = folhas.filter(a => n(a.pesoFinanceiro) > 0).length;
      const usarIgual   = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
      const pesoTotal   = usarIgual ? folhas.length : pesoBruto;

      const dates: Map<string, number> = new Map();
      folhas.forEach(a => {
        const parseDate = (v: any): Date => {
          const s = toDateStr(v).slice(0, 10);
          return new Date(s + "T12:00:00Z");
        };
        const inicio = parseDate(a.dataInicio);
        const fim    = parseDate(a.dataFim);
        if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return;

        const inicioSeg  = new Date(toMondayStr(inicio) + "T12:00:00Z");
        const fimSeg     = new Date(toMondayStr(fim)    + "T12:00:00Z");
        const weeksDiff  = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000);
        const dur        = Math.max(1, weeksDiff + 1);

        const pesoAtiv   = usarIgual ? 1 : n(a.pesoFinanceiro);
        const valorAtiv  = (pesoAtiv / pesoTotal) * totalVenda;
        const semValor   = valorAtiv / dur;

        let cur = new Date(inicioSeg);
        for (let i = 0; i < dur; i++) {
          const key = toMondayStr(cur);
          dates.set(key, (dates.get(key) ?? 0) + semValor);
          cur = new Date(cur.getTime() + 7 * 86400000);
        }
      });

      const valorPorAtiv = new Map<number, number>();
      folhas.forEach(a => {
        const pesoAtiv = usarIgual ? 1 : n(a.pesoFinanceiro);
        valorPorAtiv.set(a.id, (pesoAtiv / pesoTotal) * totalVenda);
      });

      const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      let acum = 0;
      const pontos = sorted.map(([semana, val]) => {
        acum += val;
        return { semana, acumulado: +acum.toFixed(2) };
      });

      if (pontos.length > 0) {
        const primeiraDate = new Date(pontos[0].semana + "T12:00:00Z");
        const semanaAntes  = new Date(primeiraDate.getTime() - 7 * 86400000);
        pontos.unshift({ semana: toMondayStr(semanaAntes), acumulado: 0 });
      }

      const allSemanas = pontos.map(p => p.semana);

      const avancosDB = await db.select({
        atividadeId:       planejamentoAvancos.atividadeId,
        semana:            planejamentoAvancos.semana,
        percentualAcumulado: planejamentoAvancos.percentualAcumulado,
      })
        .from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
        ));

      const bcwpMap = new Map<string, number>();
      let lastRealAvancoSemana = "";
      if (avancosDB.length > 0) {
        const ultimoPctPorAtiv = new Map<number, Map<string, number>>();
        avancosDB.forEach(av => {
          const sem = toMondayStr(new Date(av.semana + "T12:00:00Z"));
          if (!ultimoPctPorAtiv.has(av.atividadeId)) ultimoPctPorAtiv.set(av.atividadeId, new Map());
          ultimoPctPorAtiv.get(av.atividadeId)!.set(sem, n(av.percentualAcumulado));
          if (sem > lastRealAvancoSemana) lastRealAvancoSemana = sem;
        });

        allSemanas.forEach(sem => {
          if (sem > lastRealAvancoSemana) return;
          let totalEV = 0;
          for (const [ativId, valorAtiv] of valorPorAtiv) {
            const pctMap = ultimoPctPorAtiv.get(ativId);
            if (!pctMap) continue;
            let ultimoPct = 0;
            for (const s of allSemanas) {
              if (s > sem) break;
              if (pctMap.has(s)) ultimoPct = pctMap.get(s)!;
            }
            totalEV += (ultimoPct / 100) * valorAtiv;
          }
          if (totalEV > 0) bcwpMap.set(sem, +totalEV.toFixed(2));
        });
      }

      const medicoesDB = await db.select({
        competencia: planejamentoMedicoes.competencia,
        valorMedido: planejamentoMedicoes.valorMedido,
        status:      planejamentoMedicoes.status,
      })
        .from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, input.projetoId));

      const receitaMensal = new Map<string, number>();
      medicoesDB.forEach(m => {
        const val = n(m.valorMedido);
        if (val > 0) receitaMensal.set(m.competencia!, val);
      });

      const receitaMap = new Map<string, number>();
      if (receitaMensal.size > 0) {
        const mesParaSemana = new Map<string, string>();
        allSemanas.forEach(sem => {
          const mesSem = sem.substring(0, 7);
          mesParaSemana.set(mesSem, sem);
        });

        const compsSorted = [...receitaMensal.keys()].sort();
        let recAcum = 0;
        compsSorted.forEach(comp => {
          recAcum += receitaMensal.get(comp)!;
          const semAlvo = mesParaSemana.get(comp);
          if (semAlvo) {
            receitaMap.set(semAlvo, +recAcum.toFixed(2));
          }
        });

        if (recAcum > 0) {
          const lastSet = [...receitaMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))[0];
          if (lastSet) {
            allSemanas.forEach(sem => {
              if (sem > lastSet[0]) return;
              if (!receitaMap.has(sem)) {
                const prev = allSemanas.filter(s => s < sem && receitaMap.has(s)).pop();
                if (prev) receitaMap.set(sem, receitaMap.get(prev)!);
              }
            });
          }
        }
      }

      const bcwpSorted = [...bcwpMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

      const receitaSorted = [...receitaMap.entries()].filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0]));
      const lastReceitaSemana = receitaSorted.length > 0 ? receitaSorted[receitaSorted.length - 1][0] : null;

      const tendenciaMap = new Map<string, number>();
      if (bcwpSorted.length >= 2) {
        const pts = bcwpSorted.map(([sem, val], i) => ({ i, sem, val }));
        const nn = pts.length;
        const xs = pts.map(p => p.i);
        const ys = pts.map(p => p.val);
        const sumX  = xs.reduce((a, b) => a + b, 0);
        const sumY  = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const denom = nn * sumX2 - sumX * sumX;
        if (denom !== 0) {
          const slope = (nn * sumXY - sumX * sumY) / denom;
          const inter = (sumY - slope * sumX) / nn;

          pts.forEach(p => {
            tendenciaMap.set(p.sem, +Math.max(0, (inter + slope * p.i)).toFixed(2));
          });

          const lastIdx = nn - 1;
          const lastPlanSemana = allSemanas[allSemanas.length - 1] ?? "";
          const lastDate = new Date(pts[lastIdx].sem + "T12:00:00Z");
          for (let w = 1; w <= 52; w++) {
            const proj = inter + slope * (lastIdx + w);
            if (proj >= totalVenda * 1.05) break;
            const d = new Date(lastDate.getTime() + w * 7 * 86400000);
            const key = toMondayStr(d);
            if (key > lastPlanSemana) break;
            tendenciaMap.set(key, +Math.max(0, Math.min(totalVenda, proj)).toFixed(2));
          }
        }
      }

      if (lastRealAvancoSemana && pontos.length > 0) {
        const primeiraSemana = pontos[0].semana;
        if (!bcwpMap.has(primeiraSemana)) {
          bcwpMap.set(primeiraSemana, 0);
        }
      }

      const curvaCompleta = pontos.map(p => ({
        semana: p.semana,
        acumulado: p.acumulado,
        bcwp: (lastRealAvancoSemana && p.semana <= lastRealAvancoSemana) ? (bcwpMap.get(p.semana) ?? null) : null,
        receita: (lastReceitaSemana && p.semana <= lastReceitaSemana) ? (receitaMap.get(p.semana) ?? null) : null,
        tendencia: tendenciaMap.get(p.semana) ?? null,
      }));

      return { status: "ok" as const, divergencias: [], curva: curvaCompleta, totalVenda };
    }),

  dashboardGeral: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";

      let allowedObraIds: number[] | null = null;
      if (!isAdmin) {
        const userResult = await db.execute(sql`SELECT allowed_obra_ids FROM users WHERE id = ${ctx.user.id}`);
        const userRows: any[] = userResult?.rows ?? userResult ?? [];
        const raw = userRows[0]?.allowed_obra_ids;
        let parsed: number[] = [];
        try { if (raw) parsed = JSON.parse(raw); } catch {}
        if (parsed.length > 0) {
          allowedObraIds = parsed;
        } else {
          const userEmail = ctx.user.email ?? "";
          if (!userEmail) return { projetos: [], refisData: [], atividadesResumo: [] };
          const empResult = await db.execute(sql`SELECT id FROM employees WHERE "companyId" = ${input.companyId} AND email = ${userEmail} AND "deletedAt" IS NULL LIMIT 1`);
          const empRows: any[] = empResult?.rows ?? empResult ?? [];
          if (!empRows.length) return { projetos: [], refisData: [], atividadesResumo: [] };
          const employeeId = empRows[0].id;
          const obrasResult = await db.execute(sql`
            SELECT DISTINCT of2."obraId" FROM obra_funcionarios of2
            INNER JOIN obras o ON o.id = of2."obraId" AND o."companyId" = ${input.companyId} AND o."deletedAt" IS NULL
            WHERE of2."employeeId" = ${employeeId} AND of2."isActive" = 1
          `);
          const obrasRows: any[] = obrasResult?.rows ?? obrasResult ?? [];
          allowedObraIds = obrasRows.map((r: any) => r.obraId);
          if (allowedObraIds.length === 0) return { projetos: [], refisData: [], atividadesResumo: [] };
        }
      }

      const projRows = await db.select({
        id:                    planejamentoProjetos.id,
        obraId:                planejamentoProjetos.obraId,
        nome:                  planejamentoProjetos.nome,
        cliente:               planejamentoProjetos.cliente,
        responsavel:           planejamentoProjetos.responsavel,
        dataInicio:            planejamentoProjetos.dataInicio,
        dataTerminoContratual: planejamentoProjetos.dataTerminoContratual,
        valorContrato:         planejamentoProjetos.valorContrato,
        status:                planejamentoProjetos.status,
        orcamentoTotalVenda:   orcamentos.totalVenda,
        orcamentoTotalCusto:   orcamentos.totalCusto,
        orcamentoTotalMeta:    orcamentos.totalMeta,
        orcamentoValorNegociado: orcamentos.valorNegociado,
      })
        .from(planejamentoProjetos)
        .leftJoin(orcamentos, eq(planejamentoProjetos.orcamentoId, orcamentos.id))
        .where(
          allowedObraIds !== null
            ? and(eq(planejamentoProjetos.companyId, input.companyId), inArray(planejamentoProjetos.obraId, allowedObraIds.length > 0 ? allowedObraIds : [0]))
            : eq(planejamentoProjetos.companyId, input.companyId)
        )
        .orderBy(desc(planejamentoProjetos.criadoEm));

      const projIds = projRows.map(p => p.id);
      if (projIds.length === 0) {
        return {
          projetos: [],
          refisData: [],
          atividadesResumo: [],
        };
      }

      const refisRows = await db.select({
        projetoId:                 planejamentoRefis.projetoId,
        semana:                    planejamentoRefis.semana,
        avancoPrevisto:            planejamentoRefis.avancoPrevisto,
        avancoRealizado:           planejamentoRefis.avancoRealizado,
        avancoSemanalPrevisto:     planejamentoRefis.avancoSemanalPrevisto,
        avancoSemanalRealizado:    planejamentoRefis.avancoSemanalRealizado,
        spi:                       planejamentoRefis.spi,
        cpi:                       planejamentoRefis.cpi,
        custoPrevisto:             planejamentoRefis.custoPrevisto,
        custoRealizado:            planejamentoRefis.custoRealizado,
        status:                    planejamentoRefis.status,
      })
        .from(planejamentoRefis)
        .where(inArray(planejamentoRefis.projetoId, projIds))
        .orderBy(desc(planejamentoRefis.semana));

      const atividadesResult = await db.execute(sql`
        SELECT
          a.projeto_id,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE a.is_grupo = false AND a.is_marco = false) as total_folhas,
          COUNT(*) FILTER (WHERE a.is_marco = true) as total_marcos
        FROM planejamento_atividades a
        INNER JOIN planejamento_revisoes r ON r.id = a.revisao_id
        WHERE a.projeto_id = ANY(${projIds})
          AND r.status = 'aprovada'
          AND a.deleted_at IS NULL
        GROUP BY a.projeto_id
      `);
      const atividadesResumo = (atividadesResult?.rows ?? atividadesResult ?? []) as any[];

      const avancosResult = await db.execute(sql`
        SELECT
          av.projeto_id,
          MAX(av.percentual_acumulado) as max_avanco
        FROM planejamento_avancos av
        INNER JOIN planejamento_revisoes r ON r.id = av.revisao_id
        WHERE av.projeto_id = ANY(${projIds})
          AND r.status = 'aprovada'
        GROUP BY av.projeto_id
      `);
      const avancosMap: Record<number, number> = {};
      for (const r of (avancosResult?.rows ?? avancosResult ?? []) as any[]) {
        avancosMap[r.projeto_id] = n(r.max_avanco);
      }

      const refisMap = new Map<number, typeof refisRows[0]>();
      for (const r of refisRows) {
        if (r.status === "consolidado" && !refisMap.has(r.projetoId)) refisMap.set(r.projetoId, r);
      }
      const atvMap = new Map<number, any>();
      for (const a of atividadesResumo) atvMap.set(a.projeto_id, a);

      const projetosEnriquecidos = projRows.map(p => {
        const ultimoRefis = refisMap.get(p.id);
        const atv = atvMap.get(p.id);
        const valor = n(p.valorContrato) || n(p.orcamentoValorNegociado) || n(p.orcamentoTotalVenda);
        const custoMeta = n(p.orcamentoTotalMeta) || n(p.orcamentoTotalCusto);

        const avancoPrev = ultimoRefis ? n(ultimoRefis.avancoPrevisto) : 0;
        const avancoReal = ultimoRefis ? n(ultimoRefis.avancoRealizado) : (avancosMap[p.id] ?? 0);
        const spi = ultimoRefis ? n(ultimoRefis.spi) : (avancoPrev > 0 ? avancoReal / avancoPrev : 1);
        const cpi = ultimoRefis ? n(ultimoRefis.cpi) : 1;

        const hoje = new Date().toISOString().split("T")[0];
        const prazo = p.dataTerminoContratual ? toDateStr(p.dataTerminoContratual) : null;
        const atrasado = prazo && prazo < hoje && !(p.status || "").toLowerCase().includes("conclu");

        let diasRestantes: number | null = null;
        if (prazo) {
          const diff = new Date(prazo).getTime() - new Date(hoje).getTime();
          diasRestantes = Math.ceil(diff / 86_400_000);
        }

        return {
          id: p.id,
          obraId: p.obraId,
          nome: p.nome,
          cliente: p.cliente,
          responsavel: p.responsavel,
          dataInicio: p.dataInicio ? toDateStr(p.dataInicio) : null,
          dataTerminoContratual: prazo,
          status: p.status,
          valorContrato: valor,
          custoMeta,
          avancoPrevisto: avancoPrev,
          avancoRealizado: avancoReal,
          desvio: avancoReal - avancoPrev,
          spi,
          cpi,
          custoPrevisto: ultimoRefis ? n(ultimoRefis.custoPrevisto) : 0,
          custoRealizado: ultimoRefis ? n(ultimoRefis.custoRealizado) : 0,
          totalAtividades: atv ? Number(atv.total_folhas) : 0,
          totalMarcos: atv ? Number(atv.total_marcos) : 0,
          atrasado: !!atrasado,
          diasRestantes,
          ultimoRefisSemana: ultimoRefis?.semana ? toDateStr(ultimoRefis.semana) : null,
        };
      });

      return {
        projetos: projetosEnriquecidos,
        refisData: refisRows.map(r => ({
          projetoId: r.projetoId,
          semana: toDateStr(r.semana),
          avancoPrevisto: n(r.avancoPrevisto),
          avancoRealizado: n(r.avancoRealizado),
          spi: n(r.spi),
          cpi: n(r.cpi),
          status: r.status,
        })),
        atividadesResumo: atividadesResumo.map((a: any) => ({
          projetoId: a.projeto_id,
          total: Number(a.total),
          totalFolhas: Number(a.total_folhas),
          totalMarcos: Number(a.total_marcos),
        })),
      };
    }),
});
