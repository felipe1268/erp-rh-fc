import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, inArray, sql, asc } from "drizzle-orm";
import {
  terceiroContratos,
  terceiroContratoItens,
  terceiroMedicoes,
  terceiroMedicaoItens,
  terceiroDocumentos,
  empresasTerceiras,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoProjetos,
  obras,
  comprasCotacoes,
  comprasCotacoesItens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  planejamentoRevisoes,
  fornecedores,
  terceiroContratoTemplates,
  terceiroContratoRevisoes,
  companies,
  orcamentos,
  orcamentoItens,
} from "../../drizzle/schema";

const n = (v: any) => parseFloat(String(v ?? 0)) || 0;

// ══════════════════════════════════════════════════════════════
// CONTRATOS
// ══════════════════════════════════════════════════════════════

export const terceiroContratosRouter = router({

  listarContratos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      empresaTerceiraId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db.select().from(terceiroContratos)
        .where(eq(terceiroContratos.companyId, input.companyId))
        .orderBy(desc(terceiroContratos.criadoEm));
      if (input.obraId) rows = rows.filter(r => r.obraId === input.obraId);
      if (input.empresaTerceiraId) rows = rows.filter(r => r.empresaTerceiraId === input.empresaTerceiraId);
      if (input.status) rows = rows.filter(r => r.status === input.status);

      const empresas = await db.select({ id: empresasTerceiras.id, nomeFantasia: empresasTerceiras.nomeFantasia, razaoSocial: empresasTerceiras.razaoSocial })
        .from(empresasTerceiras).where(eq(empresasTerceiras.companyId, input.companyId));
      const empMap: Record<number, string> = {};
      empresas.forEach(e => { empMap[e.id] = e.nomeFantasia || e.razaoSocial; });

      return rows.map(r => ({
        ...r,
        empresaNome: empMap[r.empresaTerceiraId] || "—",
        saldoDisponivel: n(r.valorTotal) - n(r.valorPago),
        percentualPago: n(r.valorTotal) > 0 ? (n(r.valorPago) / n(r.valorTotal)) * 100 : 0,
      }));
    }),

  getContrato: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.id));
      if (!contrato) return null;

      const itensRaw = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.id))
        .orderBy(asc(terceiroContratoItens.ordem));

      const medicoesRaw = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.id))
        .orderBy(desc(terceiroMedicoes.numero));

      let allMedicaoItens: any[] = [];
      if (medicoesRaw.length > 0) {
        try {
          allMedicaoItens = await db.select().from(terceiroMedicaoItens)
            .where(inArray(terceiroMedicaoItens.medicaoId, medicoesRaw.map(m => m.id)));
        } catch (e) { console.error("[getContrato] medicaoItens query error:", e); }
      }

      let medicoes: any[] = [];

      const documentos = await db.select().from(terceiroDocumentos)
        .where(eq(terceiroDocumentos.contratoId, input.id))
        .orderBy(desc(terceiroDocumentos.criadoEm));

      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));

      let itens: any[] = itensRaw;
      let itensHierarchy: any[] = [];
      const eapCodes = [...new Set(itensRaw.map(it => (it as any).eapCodigo).filter(Boolean))] as string[];
      if (eapCodes.length > 0 && contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const [rev] = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            if (rev) {
              const allAtividades = await db.select({
                eapCodigo: planejamentoAtividades.eapCodigo,
                nome: planejamentoAtividades.nome,
                nivel: planejamentoAtividades.nivel,
                isGrupo: planejamentoAtividades.isGrupo,
                dataInicio: planejamentoAtividades.dataInicio,
                dataFim: planejamentoAtividades.dataFim,
                revisaoId: planejamentoAtividades.revisaoId,
              }).from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`))
                .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));

              const atividadeMap = new Map<string, { nome: string; nivel: number; isGrupo: boolean | null; dataInicio: string | null; dataFim: string | null }>();
              for (const a of allAtividades) {
                if (!a.eapCodigo) continue;
                const existing = atividadeMap.get(a.eapCodigo);
                if (!existing || a.revisaoId === rev.id) {
                  atividadeMap.set(a.eapCodigo, { nome: a.nome, nivel: a.nivel ?? 0, isGrupo: a.isGrupo, dataInicio: a.dataInicio, dataFim: a.dataFim });
                }
              }

              const parentSet = new Set<string>();
              for (const eap of eapCodes) {
                const parts = eap.split(".");
                for (let i = 1; i < parts.length; i++) parentSet.add(parts.slice(0, i).join("."));
              }

              try {
                let orcId: number | null = (contrato as any).orcamentoId ?? null;
                if (!orcId) {
                  const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
                    .where(and(eq(orcamentos.companyId, contrato.companyId), eq(orcamentos.obraId, contrato.obraId)))
                    .orderBy(desc(orcamentos.id)).limit(1);
                  if (orc) orcId = orc.id;
                }
                if (orcId) {
                  const orcItens = await db.select({
                    eapCodigo: orcamentoItens.eapCodigo,
                    descricao: orcamentoItens.descricao,
                    nivel: orcamentoItens.nivel,
                  }).from(orcamentoItens)
                    .where(eq(orcamentoItens.orcamentoId, orcId));
                  for (const oi of orcItens) {
                    if (oi.eapCodigo && oi.descricao) {
                      atividadeMap.set(oi.eapCodigo, {
                        nome: oi.descricao,
                        nivel: oi.nivel ?? oi.eapCodigo.split(".").length,
                        isGrupo: true,
                        dataInicio: atividadeMap.get(oi.eapCodigo)?.dataInicio ?? null,
                        dataFim: atividadeMap.get(oi.eapCodigo)?.dataFim ?? null,
                      });
                    }
                  }
                }
              } catch {}

              for (const parentEap of parentSet) {
                const atv = atividadeMap.get(parentEap);
                const nivel = parentEap.split(".").length;
                itensHierarchy.push({
                  _type: "grupo",
                  eapCodigo: parentEap,
                  nome: atv?.nome ?? `Nível ${parentEap}`,
                  nivel: atv?.nivel ?? nivel,
                  dataInicio: atv?.dataInicio ?? null,
                  dataFim: atv?.dataFim ?? null,
                });
              }
              itensHierarchy.sort((a: any, b: any) => a.eapCodigo.localeCompare(b.eapCodigo, undefined, { numeric: true }));

              itens = itensRaw.map(it => {
                const eap = (it as any).eapCodigo;
                const atv = eap ? atividadeMap.get(eap) : null;
                let origemPath: string | null = null;
                if (eap) {
                  const parts = eap.split(".");
                  const pathParts: string[] = [];
                  for (let i = 1; i <= parts.length; i++) {
                    const parentEap = parts.slice(0, i).join(".");
                    const p = atividadeMap.get(parentEap);
                    if (p) pathParts.push(p.nome);
                  }
                  if (pathParts.length > 1) origemPath = pathParts.slice(0, -1).join(" > ");
                  else if (pathParts.length === 1 && atv) origemPath = pathParts[0];
                }
                return { ...it, atividadeNome: atv?.nome ?? null, atividadeDataInicio: atv?.dataInicio ?? null, atividadeDataFim: atv?.dataFim ?? null, atividadeNivel: atv?.nivel ?? null, origemPath };
              });
            }
          }
        } catch {}
      }

      const atividadeIds = itensRaw.map(i => (i as any).planejamentoAtividadeId).filter(Boolean) as number[];
      let avancoFisicoMap = new Map<number, number>();
      if (atividadeIds.length > 0) {
        try {
          const avancos = await db.select({
            atividadeId: planejamentoAvancos.atividadeId,
            percentualAcumulado: planejamentoAvancos.percentualAcumulado,
            semana: planejamentoAvancos.semana,
          }).from(planejamentoAvancos)
            .where(inArray(planejamentoAvancos.atividadeId, atividadeIds))
            .orderBy(desc(planejamentoAvancos.semana));
          for (const av of avancos) {
            if (!avancoFisicoMap.has(av.atividadeId)) {
              avancoFisicoMap.set(av.atividadeId, n(av.percentualAcumulado));
            }
          }
        } catch {}
      }
      itens = itens.map((it: any) => {
        const atId = it.planejamentoAtividadeId;
        const avancoFisico = atId ? (avancoFisicoMap.get(atId) ?? null) : null;
        const percentualFinanceiro = n(it.valorMedidoAcumulado) > 0 && n(it.valorTotal) > 0
          ? (n(it.valorMedidoAcumulado) / n(it.valorTotal)) * 100 : 0;
        const divergencia = avancoFisico !== null ? percentualFinanceiro - avancoFisico : null;
        return { ...it, avancoFisicoReal: avancoFisico, percentualFinanceiro, divergencia };
      });

      medicoes = medicoesRaw.map(m => ({
        ...m,
        itens: allMedicaoItens
          .filter(i => i.medicaoId === m.id)
          .map(i => {
            const ci = itens.find((c: any) => c.id === i.contratoItemId);
            return {
              ...i,
              descricao: ci?.descricao || `Item #${i.contratoItemId}`,
              eapCodigo: (ci as any)?.eapCodigo || "",
              origemPath: (ci as any)?.origemPath || null,
            };
          }),
      }));

      const valorMedidoAcumulado = itensRaw.reduce((s, i) => s + n(i.valorMedidoAcumulado), 0);
      const percentualMedidoGlobal = n(contrato.valorTotal) > 0 ? (valorMedidoAcumulado / n(contrato.valorTotal)) * 100 : 0;
      const saldoAMedir = n(contrato.valorTotal) - valorMedidoAcumulado;
      const saldoALiberar = valorMedidoAcumulado - n(contrato.valorPago);

      return {
        ...contrato,
        empresa: empresa || null,
        itens,
        itensHierarchy,
        medicoes,
        documentos,
        valorMedidoAcumulado,
        percentualMedidoGlobal,
        saldoAMedir,
        saldoALiberar,
        docsComPendencia: documentos.filter(d => d.status === "pendente" && d.bloqueiaPagemento).length,
      };
      } catch (err: any) { console.error("[getContrato] ERRO:", err?.message || err); throw err; }
    }),

  // Retorna o próximo número de contrato automático para a empresa/ano
  proximoNumeroContrato: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ano = new Date().getFullYear();
      const rows = await db.select({ numeroSequencia: terceiroContratos.numeroSequencia })
        .from(terceiroContratos)
        .where(eq(terceiroContratos.companyId, input.companyId));
      // Encontra o maior sequencial do ano atual
      const maxSeq = rows
        .map(r => r.numeroSequencia ?? 0)
        .reduce((m, v) => Math.max(m, v), 0);
      const proximo = maxSeq + 1;
      const seq = String(proximo).padStart(3, "0");
      return { numero: `CT-${ano}-${seq}`, sequencia: proximo };
    }),

  criarContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      empresaTerceiraId: z.number(),
      obraId: z.number().optional(),
      obraNome: z.string().optional(),
      planejamentoProjetoId: z.number().optional(),
      orcamentoId: z.number().optional(),
      numeroContrato: z.string().optional(),
      descricao: z.string(),
      tipoContrato: z.string().default("empreitada_global"),
      valorOrcamento: z.number().default(0),
      valorTotal: z.number().default(0),
      dataInicio: z.string().optional(),
      dataTermino: z.string().optional(),
      observacoes: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const ano = new Date().getFullYear();

      // Gera número automático se não informado
      let numeroContrato = input.numeroContrato?.trim() || null;
      let numeroSequencia: number | null = null;
      if (!numeroContrato) {
        const rows = await db.select({ numeroSequencia: terceiroContratos.numeroSequencia })
          .from(terceiroContratos)
          .where(eq(terceiroContratos.companyId, input.companyId));
        const maxSeq = rows.map(r => r.numeroSequencia ?? 0).reduce((m, v) => Math.max(m, v), 0);
        numeroSequencia = maxSeq + 1;
        numeroContrato = `CT-${ano}-${String(numeroSequencia).padStart(3, "0")}`;
      }

      const [c] = await db.insert(terceiroContratos).values({
        companyId: input.companyId,
        empresaTerceiraId: input.empresaTerceiraId,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome ?? null,
        planejamentoProjetoId: input.planejamentoProjetoId ?? null,
        orcamentoId: input.orcamentoId ?? null,
        numeroContrato,
        numeroSequencia,
        descricao: input.descricao,
        tipoContrato: input.tipoContrato,
        valorOrcamento: String(input.valorOrcamento),
        valorTotal: String(input.valorTotal),
        dataInicio: input.dataInicio ?? null,
        dataTermino: input.dataTermino ?? null,
        observacoes: input.observacoes ?? null,
        criadoPor: input.criadoPor ?? null,
      } as any).returning();
      return c;
    }),

  atualizarContrato: protectedProcedure
    .input(z.object({
      id: z.number(),
      descricao: z.string().optional(),
      numeroContrato: z.string().optional(),
      valorOrcamento: z.number().optional(),
      valorTotal: z.number().optional(),
      dataInicio: z.string().optional(),
      dataTermino: z.string().optional(),
      status: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const upd: any = { atualizadoEm: new Date().toISOString() };
      if (rest.descricao !== undefined) upd.descricao = rest.descricao;
      if (rest.numeroContrato !== undefined) upd.numeroContrato = rest.numeroContrato;
      if (rest.valorOrcamento !== undefined) upd.valorOrcamento = String(rest.valorOrcamento);
      if (rest.valorTotal !== undefined) upd.valorTotal = String(rest.valorTotal);
      if (rest.dataInicio !== undefined) upd.dataInicio = rest.dataInicio;
      if (rest.dataTermino !== undefined) upd.dataTermino = rest.dataTermino;
      if (rest.status !== undefined) upd.status = rest.status;
      if (rest.observacoes !== undefined) upd.observacoes = rest.observacoes;
      const [c] = await db.update(terceiroContratos).set(upd).where(eq(terceiroContratos.id, id)).returning();
      return c;
    }),

  excluirContrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.id), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato não encontrado");
      const medicoes = await db.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, input.id));
      for (const m of medicoes) {
        await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, m.id));
      }
      await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, input.id));
      await db.delete(terceiroDocumentos).where(eq(terceiroDocumentos.contratoId, input.id));
      await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, input.id));
      await db.delete(terceiroContratos).where(eq(terceiroContratos.id, input.id));
      return { ok: true };
    }),

  excluirContratosLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let deleted = 0;
      for (const cid of input.ids) {
        const [contrato] = await db.select().from(terceiroContratos).where(
          and(eq(terceiroContratos.id, cid), eq(terceiroContratos.companyId, input.companyId))
        );
        if (!contrato) continue;
        const medicoes = await db.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, cid));
        for (const m of medicoes) {
          await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, m.id));
        }
        await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, cid));
        await db.delete(terceiroDocumentos).where(eq(terceiroDocumentos.contratoId, cid));
        await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, cid));
        await db.delete(terceiroContratoRevisoes).where(eq(terceiroContratoRevisoes.contratoId, cid));
        await db.update(comprasCotacoes)
          .set({ status: "aprovada", contratoTerceiroId: null, atualizadoEm: new Date().toISOString() } as any)
          .where(sql`"contrato_terceiro_id" = ${cid} AND "company_id" = ${input.companyId}`);
        await db.delete(terceiroContratos).where(eq(terceiroContratos.id, cid));
        deleted++;
      }
      return { deleted };
    }),

  recalcularDatasCronograma: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato não encontrado");
      if (!contrato.obraId) throw new Error("Contrato não possui obra vinculada");

      const [proj] = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
        .orderBy(desc(planejamentoProjetos.id))
        .limit(1);
      if (!proj) throw new Error("Nenhum projeto de planejamento encontrado para esta obra");

      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
        .orderBy(desc(planejamentoRevisoes.numero))
        .limit(1);
      if (!rev) throw new Error("Nenhuma revisão aprovada encontrada no cronograma");

      const contratoItens = await db.select({ eapCodigo: terceiroContratoItens.eapCodigo })
        .from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId));
      const eapCodes = [...new Set(contratoItens.map(it => (it as any).eapCodigo).filter(Boolean))] as string[];

      let dateRows: any;
      if (eapCodes.length > 0) {
        dateRows = await db.execute(sql`
          SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
          FROM planejamento_atividades
          WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
            AND eap_codigo IN (${sql.join(eapCodes.map(c => sql`${c}`), sql`, `)})
            AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
        `);
      }
      const row = (dateRows as any)?.rows?.[0];
      if (!row?.min_inicio) {
        dateRows = await db.execute(sql`
          SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
          FROM planejamento_atividades
          WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
            AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
        `);
      }
      const fallbackRow = (dateRows as any)?.rows?.[0];
      const finalRow = row?.min_inicio ? row : fallbackRow;
      if (!finalRow?.min_inicio) throw new Error("Nenhuma atividade com data encontrada no cronograma");

      const dataInicio = String(finalRow.min_inicio);
      const dataTermino = finalRow.max_fim ? String(finalRow.max_fim) : null;

      await db.update(terceiroContratos).set({
        dataInicio,
        dataTermino,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(terceiroContratos.id, input.contratoId));

      return { dataInicio, dataTermino, usouEap: eapCodes.length > 0 && !!row?.min_inicio };
    }),

  // ── ITENS DO CONTRATO ──────────────────────────────────────

  listarItens: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const items = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));

      const eapCodes = [...new Set(items.map(it => (it as any).eapCodigo).filter(Boolean))] as string[];
      if (eapCodes.length === 0) return { items, hierarchy: [] };

      const [contrato] = await db.select({ obraId: terceiroContratos.obraId, companyId: terceiroContratos.companyId })
        .from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato?.obraId) return { items, hierarchy: [] };

      try {
        const [proj] = await db.select({ id: planejamentoProjetos.id })
          .from(planejamentoProjetos)
          .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
          .orderBy(desc(planejamentoProjetos.id))
          .limit(1);
        if (!proj) return { items, hierarchy: [] };

        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
          .orderBy(desc(planejamentoRevisoes.numero))
          .limit(1);
        if (!rev) return { items, hierarchy: [] };

        const allAtividades = await db.select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          nivel: planejamentoAtividades.nivel,
          isGrupo: planejamentoAtividades.isGrupo,
          dataInicio: planejamentoAtividades.dataInicio,
          dataFim: planejamentoAtividades.dataFim,
          revisaoId: planejamentoAtividades.revisaoId,
        }).from(planejamentoAtividades)
          .where(and(
            eq(planejamentoAtividades.projetoId, proj.id),
            sql`${planejamentoAtividades.disabled} IS NOT TRUE`,
          ))
          .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));

        const atividadeMap = new Map<string, { nome: string; nivel: number; isGrupo: boolean | null; dataInicio: string | null; dataFim: string | null }>();
        for (const a of allAtividades) {
          if (!a.eapCodigo) continue;
          const existing = atividadeMap.get(a.eapCodigo);
          if (!existing || a.revisaoId === rev.id) {
            atividadeMap.set(a.eapCodigo, { nome: a.nome, nivel: a.nivel ?? 0, isGrupo: a.isGrupo, dataInicio: a.dataInicio, dataFim: a.dataFim });
          }
        }

        const parentSet = new Set<string>();
        for (const eap of eapCodes) {
          const parts = eap.split(".");
          for (let i = 1; i < parts.length; i++) {
            parentSet.add(parts.slice(0, i).join("."));
          }
        }

        try {
          let orcId: number | null = (contrato as any).orcamentoId ?? null;
          if (!orcId) {
            const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
              .where(and(eq(orcamentos.companyId, contrato.companyId), eq(orcamentos.obraId, contrato.obraId)))
              .orderBy(desc(orcamentos.id)).limit(1);
            if (orc) orcId = orc.id;
          }
          if (orcId) {
            const orcItens = await db.select({
              eapCodigo: orcamentoItens.eapCodigo,
              descricao: orcamentoItens.descricao,
              nivel: orcamentoItens.nivel,
            }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, orcId));
            for (const oi of orcItens) {
              if (oi.eapCodigo && oi.descricao) {
                atividadeMap.set(oi.eapCodigo, {
                  nome: oi.descricao,
                  nivel: oi.nivel ?? oi.eapCodigo.split(".").length,
                  isGrupo: true,
                  dataInicio: atividadeMap.get(oi.eapCodigo)?.dataInicio ?? null,
                  dataFim: atividadeMap.get(oi.eapCodigo)?.dataFim ?? null,
                });
              }
            }
          }
        } catch {}

        const hierarchy: any[] = [];
        for (const parentEap of parentSet) {
          const atv = atividadeMap.get(parentEap);
          const nivel = parentEap.split(".").length;
          hierarchy.push({
            _type: "grupo",
            eapCodigo: parentEap,
            nome: atv?.nome ?? `Nível ${parentEap}`,
            nivel: atv?.nivel ?? nivel,
            dataInicio: atv?.dataInicio ?? null,
            dataFim: atv?.dataFim ?? null,
          });
        }
        hierarchy.sort((a, b) => a.eapCodigo.localeCompare(b.eapCodigo, undefined, { numeric: true }));

        const enrichedItems = items.map(it => {
          const eap = (it as any).eapCodigo;
          const atv = eap ? atividadeMap.get(eap) : null;
          let origemPath: string | null = null;
          if (eap) {
            const parts = eap.split(".");
            const pathParts: string[] = [];
            for (let i = 1; i <= parts.length; i++) {
              const parentEap = parts.slice(0, i).join(".");
              const p = atividadeMap.get(parentEap);
              if (p) pathParts.push(p.nome);
            }
            if (pathParts.length > 1) origemPath = pathParts.slice(0, -1).join(" > ");
            else if (pathParts.length === 1 && atv) origemPath = pathParts[0];
          }
          return {
            ...it,
            atividadeNome: atv?.nome ?? null,
            atividadeDataInicio: atv?.dataInicio ?? null,
            atividadeDataFim: atv?.dataFim ?? null,
            atividadeNivel: atv?.nivel ?? null,
            origemPath,
          };
        });

        return { items: enrichedItems, hierarchy };
      } catch {
        return { items, hierarchy: [] };
      }
    }),

  adicionarItem: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      planejamentoAtividadeId: z.number().optional(),
      eapCodigo: z.string().optional(),
      orcamentoItemId: z.number().optional(),
      descricao: z.string(),
      unidade: z.string().optional(),
      quantidade: z.number().default(1),
      valorUnitario: z.number().default(0),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const valorTotal = input.quantidade * input.valorUnitario;
      const [item] = await db.insert(terceiroContratoItens).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        planejamentoAtividadeId: input.planejamentoAtividadeId ?? null,
        eapCodigo: input.eapCodigo ?? null,
        orcamentoItemId: input.orcamentoItemId ?? null,
        descricao: input.descricao,
        unidade: input.unidade ?? null,
        quantidade: String(input.quantidade),
        valorUnitario: String(input.valorUnitario),
        valorTotal: String(valorTotal),
        ordem: input.ordem ?? 0,
      } as any).returning();

      await _recalcularValorContrato(db, input.contratoId);
      return item;
    }),

  relinkEapItens: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      const [cot] = await db.select().from(comprasCotacoes)
        .where(eq((comprasCotacoes as any).contratoTerceiroId, input.contratoId));
      if (!cot) return { updated: 0, msg: "Cotação de origem não encontrada" };

      const cotItens = await db.select().from(comprasCotacoesItens)
        .where(eq(comprasCotacoesItens.cotacaoId, cot.id));

      const scItemIds = cotItens.map(ci => ci.solicitacaoItemId).filter(Boolean) as number[];
      if (scItemIds.length === 0) return { updated: 0, msg: "Itens da cotação não possuem vínculo com SC" };

      const scItems = await db.select({
        id: comprasSolicitacoesItens.id,
        eapCodigo: comprasSolicitacoesItens.eapCodigo,
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
        descricao: comprasSolicitacoesItens.descricao,
      }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      const scMap = new Map(scItems.map(s => [s.id, s]));

      const cotToSc = new Map<number, typeof scItems[0]>();
      for (const ci of cotItens) {
        if (ci.solicitacaoItemId && scMap.has(ci.solicitacaoItemId)) {
          cotToSc.set(ci.id, scMap.get(ci.solicitacaoItemId)!);
        }
      }

      const contratoItens = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));

      let eapToAtividadeId: Record<string, number> = {};
      const [contratoRow] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (contratoRow?.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contratoRow.companyId), eq(planejamentoProjetos.obraId, contratoRow.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const [rev] = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            if (rev) {
              const atividades = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo })
                .from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
              for (const a of atividades) { if (a.eapCodigo) eapToAtividadeId[a.eapCodigo] = a.id; }
            }
          }
        } catch {}
      }

      let updated = 0;
      const cotItensOrdered = [...cotItens].sort((a, b) => a.id - b.id);

      for (let i = 0; i < contratoItens.length && i < cotItensOrdered.length; i++) {
        const ci = contratoItens[i];
        const cotItem = cotItensOrdered[i];
        const scInfo = cotToSc.get(cotItem.id);
        if (scInfo && scInfo.eapCodigo) {
          const upd: any = {};
          if (!(ci as any).eapCodigo) { upd.eapCodigo = scInfo.eapCodigo; upd.orcamentoItemId = scInfo.orcamentoItemId; }
          if (!ci.planejamentoAtividadeId && eapToAtividadeId[scInfo.eapCodigo]) {
            upd.planejamentoAtividadeId = eapToAtividadeId[scInfo.eapCodigo];
          }
          if (Object.keys(upd).length > 0) {
            await db.update(terceiroContratoItens).set(upd).where(eq(terceiroContratoItens.id, ci.id));
            updated++;
          }
        }
      }

      return { updated, msg: `${updated} item(ns) atualizado(s) com EAP e vínculo ao cronograma` };
    }),

  removerItem: protectedProcedure
    .input(z.object({ id: z.number(), contratoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.id, input.id));
      await _recalcularValorContrato(db, input.contratoId);
      return { ok: true };
    }),

  listarAtividadesProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select({
        id: planejamentoAtividades.id,
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
        nivel: planejamentoAtividades.nivel,
        isGrupo: planejamentoAtividades.isGrupo,
        unidade: planejamentoAtividades.unidade,
        quantidadePlanejada: planejamentoAtividades.quantidadePlanejada,
      }).from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.projetoId, input.projetoId))
        .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));
    }),

  importarAtividadesPlanejamento: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      projetoId: z.number(),
      atividadeIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const atividades = await db.select().from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.projetoId, input.projetoId),
          inArray(planejamentoAtividades.id, input.atividadeIds)
        ));
      let ordem = 0;
      for (const at of atividades) {
        await db.insert(terceiroContratoItens).values({
          contratoId: input.contratoId,
          companyId: input.companyId,
          planejamentoAtividadeId: at.id,
          eapCodigo: at.eapCodigo ?? null,
          descricao: at.nome,
          unidade: at.unidade ?? null,
          quantidade: String(at.quantidadePlanejada ?? 1),
          valorUnitario: "0",
          valorTotal: "0",
          ordem: ordem++,
        } as any);
      }
      return { importados: atividades.length };
    }),

  // ── MEDIÇÕES ──────────────────────────────────────────────

  listarMedicoes: protectedProcedure
    .input(z.object({ companyId: z.number(), contratoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.companyId, input.companyId))
        .orderBy(desc(terceiroMedicoes.numero));
      if (input.contratoId) rows = rows.filter(r => r.contratoId === input.contratoId);
      return rows;
    }),

  gerarMedicao: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      periodo: z.string(),
      dataReferencia: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      if (input.dataInicio && input.dataFim) {
        const todasMedicoes = await db.select({
          id: terceiroMedicoes.id,
          numero: terceiroMedicoes.numero,
          dataInicio: terceiroMedicoes.dataInicio,
          dataFim: terceiroMedicoes.dataFim,
          periodo: terceiroMedicoes.periodo,
          status: terceiroMedicoes.status,
        }).from(terceiroMedicoes)
          .where(eq(terceiroMedicoes.contratoId, input.contratoId));
        const ativas = todasMedicoes.filter(m => m.status !== "rejeitada");
        for (const m of ativas) {
          if (m.dataInicio && m.dataFim) {
            if (input.dataInicio <= m.dataFim && input.dataFim >= m.dataInicio) {
              throw new Error(`As datas ${input.dataInicio} a ${input.dataFim} se sobrepõem à Medição ${String(m.numero).padStart(2, "0")} (${m.dataInicio} a ${m.dataFim}). Não é permitido gerar medições com períodos sobrepostos.`);
            }
          }
          if (m.periodo === input.periodo && !m.dataInicio) {
            throw new Error(`Já existe uma medição para o período ${input.periodo}. Delete ou rejeite a existente antes de gerar uma nova.`);
          }
        }
      }

      const itens = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));

      if (!itens.length) throw new Error("Contrato sem itens — adicione atividades antes de gerar medição");

      // Auto-link: vincular itens ao planejamento pelo EAP se ainda não vinculados
      const itensDesvinculados = itens.filter(i => !i.planejamentoAtividadeId);
      console.log(`[gerarMedicao] ${itensDesvinculados.length} itens desvinculados, obraId=${contrato.obraId}`);
      if (itensDesvinculados.length > 0 && contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          console.log(`[gerarMedicao] Projeto planejamento: ${proj ? proj.id : "NÃO ENCONTRADO"}`);
          if (proj) {
            const [rev] = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            console.log(`[gerarMedicao] Revisão aprovada: ${rev ? rev.id : "NÃO ENCONTRADA"}`);
            if (rev) {
              const atividades = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo })
                .from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
              const eapMap: Record<string, number> = {};
              for (const a of atividades) { if (a.eapCodigo) eapMap[a.eapCodigo] = a.id; }
              console.log(`[gerarMedicao] ${atividades.length} atividades no planejamento, ${Object.keys(eapMap).length} com EAP`);
              for (const item of itensDesvinculados) {
                const eap = (item as any).eapCodigo;
                console.log(`[gerarMedicao] Tentando vincular item "${item.descricao}" eapCodigo="${eap}" → match=${eap ? !!eapMap[eap] : false}`);
                if (eap && eapMap[eap]) {
                  await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: eapMap[eap] }).where(eq(terceiroContratoItens.id, item.id));
                  (item as any).planejamentoAtividadeId = eapMap[eap];
                  console.log(`[gerarMedicao] Auto-link OK: "${item.descricao}" → atividade ${eapMap[eap]} (EAP ${eap})`);
                }
              }
            }
          }
        } catch (e) { console.warn("[gerarMedicao] Auto-link falhou:", e); }
      }

      // Contagem de medições anteriores
      const medicoesAnteriores = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.contratoId));
      const numero = medicoesAnteriores.length + 1;
      const valorAcumuladoAnterior = medicoesAnteriores
        .filter(m => m.status === "aprovada" || m.status === "paga")
        .reduce((s, m) => s + n(m.valorMedido), 0);

      let valorMedidoPeriodo = 0;
      const itensMedicao: any[] = [];
      const itensNaoVinculados: string[] = [];

      console.log(`[gerarMedicao] Contrato ${input.contratoId}: ${itens.length} itens, verificando avanços...`);
      for (const item of itens) {
        let percentualFisico = n(item.percentualMedidoAcumulado);

        if (item.planejamentoAtividadeId) {
          const [avanco] = await db.select().from(planejamentoAvancos)
            .where(eq(planejamentoAvancos.atividadeId, item.planejamentoAtividadeId))
            .orderBy(desc(planejamentoAvancos.semana))
            .limit(1);
          console.log(`[gerarMedicao] Item "${item.descricao}" atividadeId=${item.planejamentoAtividadeId} → avanco=${avanco ? n(avanco.percentualAcumulado) : "SEM AVANCO"}`);
          if (avanco) percentualFisico = n(avanco.percentualAcumulado);
        } else {
          console.log(`[gerarMedicao] Item "${item.descricao}" SEM planejamentoAtividadeId (não vinculado)`);
          itensNaoVinculados.push(item.descricao || `Item #${item.id}`);
        }

        const percentualAnterior = n(item.percentualMedidoAcumulado);
        const percentualPeriodo = Math.max(0, percentualFisico - percentualAnterior);
        const valorPeriodo = (percentualPeriodo / 100) * n(item.valorTotal);
        const valorAcumuladoItem = (percentualFisico / 100) * n(item.valorTotal);

        valorMedidoPeriodo += valorPeriodo;

        itensMedicao.push({
          contratoItemId: item.id,
          companyId: input.companyId,
          descricao: item.descricao,
          percentualAvancoFisico: String(percentualFisico),
          percentualAcumuladoAnterior: String(percentualAnterior),
          percentualMedidoPeriodo: String(percentualPeriodo),
          valorMedidoPeriodo: String(valorPeriodo),
          valorAcumulado: String(valorAcumuladoItem),
        });
      }

      const valorAcumulado = valorAcumuladoAnterior + valorMedidoPeriodo;
      const percentualGlobal = n(contrato.valorTotal) > 0
        ? (valorAcumulado / n(contrato.valorTotal)) * 100 : 0;

      const [medicao] = await db.insert(terceiroMedicoes).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        empresaTerceiraId: contrato.empresaTerceiraId,
        obraId: contrato.obraId ?? null,
        numero,
        periodo: input.periodo,
        dataReferencia: input.dataReferencia ?? null,
        dataInicio: input.dataInicio ?? null,
        dataFim: input.dataFim ?? null,
        valorMedido: String(valorMedidoPeriodo),
        valorAcumulado: String(valorAcumulado),
        percentualGlobal: String(percentualGlobal),
        status: "aguardando_aprovacao",
        geradoAutomaticamente: true,
        criadoPor: input.criadoPor ?? null,
      } as any).returning();

      for (const im of itensMedicao) {
        await db.insert(terceiroMedicaoItens).values({ ...im, medicaoId: medicao.id } as any);
      }

      return { medicao, itens: itensMedicao.length, itensNaoVinculados };
    }),

  getMedicao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      if (!medicao) return null;
      const itens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, medicao.empresaTerceiraId));
      const docsAtivos = await db.select().from(terceiroDocumentos)
        .where(and(eq(terceiroDocumentos.contratoId, medicao.contratoId), eq(terceiroDocumentos.bloqueiaPagemento, true)));
      const temDocsPendentes = docsAtivos.some(d => d.status === "pendente");
      return { ...medicao, itens, contrato: contrato || null, empresa: empresa || null, temDocsPendentes };
    }),

  aprovarMedicao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não pode ser aprovada (status: ${existing.status})`);
      const [medicao] = await db.update(terceiroMedicoes)
        .set({ status: "aprovada", aprovadoPor: input.aprovadoPor, aprovadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroMedicoes.id, input.id))
        .returning();

      // Atualiza percentual acumulado nos itens do contrato
      const itensMedicao = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
      for (const im of itensMedicao) {
        await db.update(terceiroContratoItens)
          .set({
            percentualMedidoAcumulado: im.percentualAvancoFisico,
            valorMedidoAcumulado: im.valorAcumulado,
          })
          .where(eq(terceiroContratoItens.id, im.contratoItemId));
      }
      return medicao;
    }),

  rejeitarMedicao: protectedProcedure
    .input(z.object({ id: z.number(), motivo: z.string(), rejeitadoPor: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não pode ser rejeitada (status: ${existing.status})`);
      const [medicao] = await db.update(terceiroMedicoes)
        .set({
          status: "rejeitada",
          motivoRejeicao: input.motivo,
          rejeitadoPor: input.rejeitadoPor ?? null,
          rejeitadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        } as any)
        .where(eq(terceiroMedicoes.id, input.id))
        .returning();
      return medicao;
    }),

  excluirMedicao: protectedProcedure
    .input(z.object({ id: z.number(), contratoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível excluir uma medição já paga");

      if (medicao.status === "aprovada") {
        const itensMedicao = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
        for (const im of itensMedicao) {
          const prevAcum = n(im.percentualAvancoFisico);
          const prevValAcum = n(im.valorAcumulado);
          const [contratoItem] = await db.select().from(terceiroContratoItens).where(eq(terceiroContratoItens.id, im.contratoItemId));
          if (contratoItem) {
            const novoPerc = Math.max(0, n(contratoItem.percentualMedidoAcumulado) - prevAcum);
            const novoVal = Math.max(0, n(contratoItem.valorMedidoAcumulado) - prevValAcum);
            await db.update(terceiroContratoItens).set({
              percentualMedidoAcumulado: String(novoPerc),
              valorMedidoAcumulado: String(novoVal),
            }).where(eq(terceiroContratoItens.id, im.contratoItemId));
          }
        }
      }

      await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
      await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      return { ok: true };
    }),

  editarMedicao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      periodo: z.string().optional(),
      dataReferencia: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      status: z.enum(["rascunho", "aguardando_aprovacao"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível editar uma medição já paga");

      const upd: any = { atualizadoEm: new Date().toISOString() };
      if (input.periodo !== undefined) upd.periodo = input.periodo;
      if (input.dataReferencia !== undefined) upd.dataReferencia = input.dataReferencia;
      if (input.observacoes !== undefined) upd.observacoes = input.observacoes;
      if (input.status !== undefined) {
        upd.status = input.status;
        if (input.status === "rascunho") {
          upd.aprovadoPor = null;
          upd.aprovadoEm = null;
        }
      }

      const [updated] = await db.update(terceiroMedicoes).set(upd).where(eq(terceiroMedicoes.id, input.id)).returning();
      return updated;
    }),

  registrarPagamento: protectedProcedure
    .input(z.object({ medicaoId: z.number(), contratoId: z.number(), valor: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(terceiroMedicoes)
        .set({ status: "paga", atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroMedicoes.id, input.medicaoId));
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      const novoValorPago = n(contrato?.valorPago) + input.valor;
      const [c] = await db.update(terceiroContratos)
        .set({ valorPago: String(novoValorPago), atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId))
        .returning();
      return c;
    }),

  editarMedicaoItem: protectedProcedure
    .input(z.object({
      medicaoItemId: z.number(),
      medicaoId: z.number(),
      percentualMedidoPeriodo: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.medicaoId));
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "aprovada" || medicao.status === "paga") throw new Error("Não é possível editar itens de uma medição já aprovada/paga");

      const [item] = await db.select().from(terceiroMedicaoItens).where(and(eq(terceiroMedicaoItens.id, input.medicaoItemId), eq(terceiroMedicaoItens.medicaoId, input.medicaoId)));
      if (!item) throw new Error("Item da medição não encontrado");

      const [contratoItem] = await db.select().from(terceiroContratoItens).where(eq(terceiroContratoItens.id, item.contratoItemId));
      if (!contratoItem) throw new Error("Item do contrato não encontrado");

      const percentualAnterior = n(item.percentualAcumuladoAnterior);
      const novoPercentualPeriodo = Math.max(0, Math.min(100 - percentualAnterior, input.percentualMedidoPeriodo));
      const novoPercentualFisico = percentualAnterior + novoPercentualPeriodo;
      const novoValorPeriodo = (novoPercentualPeriodo / 100) * n(contratoItem.valorTotal);
      const novoValorAcumulado = (novoPercentualFisico / 100) * n(contratoItem.valorTotal);

      await db.update(terceiroMedicaoItens).set({
        percentualMedidoPeriodo: String(novoPercentualPeriodo),
        percentualAvancoFisico: String(novoPercentualFisico),
        valorMedidoPeriodo: String(novoValorPeriodo),
        valorAcumulado: String(novoValorAcumulado),
      }).where(eq(terceiroMedicaoItens.id, input.medicaoItemId));

      const todosItens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.medicaoId));
      const novoValorMedido = todosItens.reduce((s, i) => s + (i.id === input.medicaoItemId ? novoValorPeriodo : n(i.valorMedidoPeriodo)), 0);
      const medicoesAprovadas = (await db.select().from(terceiroMedicoes)
        .where(and(eq(terceiroMedicoes.contratoId, medicao.contratoId), inArray(terceiroMedicoes.status, ["aprovada", "paga"]))))
        .reduce((s, m) => s + n(m.valorMedido), 0);
      const novoValorAcumuladoMedicao = medicoesAprovadas + novoValorMedido;
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      const novoPercentualGlobal = n(contrato?.valorTotal) > 0 ? (novoValorAcumuladoMedicao / n(contrato.valorTotal)) * 100 : 0;

      await db.update(terceiroMedicoes).set({
        valorMedido: String(novoValorMedido),
        valorAcumulado: String(novoValorAcumuladoMedicao),
        percentualGlobal: String(novoPercentualGlobal),
        atualizadoEm: new Date().toISOString(),
      }).where(eq(terceiroMedicoes.id, input.medicaoId));

      return { ok: true };
    }),

  removerMedicaoItem: protectedProcedure
    .input(z.object({ medicaoItemId: z.number(), medicaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.medicaoId));
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "aprovada" || medicao.status === "paga") throw new Error("Não é possível remover itens de uma medição já aprovada/paga");

      await db.delete(terceiroMedicaoItens).where(and(eq(terceiroMedicaoItens.id, input.medicaoItemId), eq(terceiroMedicaoItens.medicaoId, input.medicaoId)));

      const todosItens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.medicaoId));
      const novoValorMedido = todosItens.reduce((s, i) => s + n(i.valorMedidoPeriodo), 0);
      const medicoesAprovadas = (await db.select().from(terceiroMedicoes)
        .where(and(eq(terceiroMedicoes.contratoId, medicao.contratoId), inArray(terceiroMedicoes.status, ["aprovada", "paga"]))))
        .reduce((s, m) => s + n(m.valorMedido), 0);
      const novoValorAcumuladoMedicao = medicoesAprovadas + novoValorMedido;
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      const novoPercentualGlobal = n(contrato?.valorTotal) > 0 ? (novoValorAcumuladoMedicao / n(contrato.valorTotal)) * 100 : 0;

      await db.update(terceiroMedicoes).set({
        valorMedido: String(novoValorMedido),
        valorAcumulado: String(novoValorAcumuladoMedicao),
        percentualGlobal: String(novoPercentualGlobal),
        atualizadoEm: new Date().toISOString(),
      }).where(eq(terceiroMedicoes.id, input.medicaoId));

      return { ok: true, restantes: todosItens.length };
    }),

  historicoMedicaoItem: protectedProcedure
    .input(z.object({ contratoId: z.number(), contratoItemId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const medicoes = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.contratoId))
        .orderBy(asc(terceiroMedicoes.numero));
      const result: any[] = [];
      for (const m of medicoes) {
        const [item] = await db.select().from(terceiroMedicaoItens)
          .where(and(eq(terceiroMedicaoItens.medicaoId, m.id), eq(terceiroMedicaoItens.contratoItemId, input.contratoItemId)));
        if (item) {
          result.push({
            medicaoId: m.id,
            numero: m.numero,
            periodo: m.periodo,
            status: m.status,
            percentualPeriodo: n(item.percentualMedidoPeriodo),
            percentualAcumulado: n(item.percentualAvancoFisico),
            valorPeriodo: n(item.valorMedidoPeriodo),
            valorAcumulado: n(item.valorAcumulado),
          });
        }
      }
      return result;
    }),

  // ── DOCUMENTOS ────────────────────────────────────────────

  listarDocumentos: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(terceiroDocumentos)
        .where(eq(terceiroDocumentos.contratoId, input.contratoId))
        .orderBy(desc(terceiroDocumentos.criadoEm));
    }),

  criarDocumento: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      empresaTerceiraId: z.number(),
      tipo: z.string(),
      descricao: z.string().optional(),
      competencia: z.string().optional(),
      dataVencimento: z.string().optional(),
      bloqueiaPagemento: z.boolean().default(false),
      enviadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [doc] = await db.insert(terceiroDocumentos).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        empresaTerceiraId: input.empresaTerceiraId,
        tipo: input.tipo,
        descricao: input.descricao ?? null,
        competencia: input.competencia ?? null,
        dataVencimento: input.dataVencimento ?? null,
        bloqueiaPagemento: input.bloqueiaPagemento,
        enviadoPor: input.enviadoPor ?? null,
        status: "pendente",
      } as any).returning();
      return doc;
    }),

  atualizarDocumento: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string().optional(),
      url: z.string().optional(),
      validadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const upd: any = { atualizadoEm: new Date().toISOString() };
      if (input.status) upd.status = input.status;
      if (input.url) upd.url = input.url;
      if (input.validadoPor) { upd.validadoPor = input.validadoPor; upd.validadoEm = new Date().toISOString(); }
      const [doc] = await db.update(terceiroDocumentos).set(upd).where(eq(terceiroDocumentos.id, input.id)).returning();
      return doc;
    }),

  // ── PREVISÃO DE CAIXA ─────────────────────────────────────

  previsaoCaixa: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      let contratos = await db.select().from(terceiroContratos)
        .where(and(
          eq(terceiroContratos.companyId, input.companyId),
          eq(terceiroContratos.status, "ativo")
        ));
      if (input.obraId) contratos = contratos.filter(c => c.obraId === input.obraId);
      if (!contratos.length) return { semanas: [], totalPrevisto: 0, contratos: [] };

      const empresas = await db.select({ id: empresasTerceiras.id, nomeFantasia: empresasTerceiras.nomeFantasia, razaoSocial: empresasTerceiras.razaoSocial })
        .from(empresasTerceiras).where(eq(empresasTerceiras.companyId, input.companyId));
      const empMap: Record<number, string> = {};
      empresas.forEach(e => { empMap[e.id] = e.nomeFantasia || e.razaoSocial; });

      const contratosIds = contratos.map(c => c.id);
      const todosItens = await db.select().from(terceiroContratoItens)
        .where(inArray(terceiroContratoItens.contratoId, contratosIds));

      const atividadeIds = todosItens.filter(i => i.planejamentoAtividadeId).map(i => i.planejamentoAtividadeId!);
      let avancos: any[] = [];
      if (atividadeIds.length) {
        avancos = await db.select().from(planejamentoAvancos)
          .where(inArray(planejamentoAvancos.atividadeId, atividadeIds))
          .orderBy(asc(planejamentoAvancos.semana));
      }

      // Agrupa previsões por semana
      const semanasMap: Record<string, number> = {};
      for (const item of todosItens) {
        if (!item.planejamentoAtividadeId) continue;
        const avancosItem = avancos.filter(a => a.atividadeId === item.planejamentoAtividadeId);
        let prevAnterior = 0;
        for (const av of avancosItem) {
          const prevPeriodo = n(av.percentualSemanal ?? 0);
          const valorSemana = (prevPeriodo / 100) * n(item.valorTotal);
          semanasMap[av.semana] = (semanasMap[av.semana] ?? 0) + valorSemana;
          prevAnterior = n(av.percentualAcumulado);
        }
      }

      const semanas = Object.entries(semanasMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([semana, valor]) => ({ semana, valor }));

      const totalPrevisto = semanas.reduce((s, w) => s + w.valor, 0);

      return {
        semanas,
        totalPrevisto,
        contratos: contratos.map(c => ({
          ...c,
          empresaNome: empMap[c.empresaTerceiraId] || "—",
          percentualPago: n(c.valorTotal) > 0 ? (n(c.valorPago) / n(c.valorTotal)) * 100 : 0,
        })),
      };
    }),

  // ── DASHBOARD ─────────────────────────────────────────────

  dashboardTerceiroContratos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const contratos = await db.select().from(terceiroContratos)
        .where(eq(terceiroContratos.companyId, input.companyId));

      const medicoes = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.companyId, input.companyId));

      const totalContratos = contratos.filter(c => c.status === "ativo").length;
      const valorTotalContratado = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + n(c.valorTotal), 0);
      const valorTotalPago = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + n(c.valorPago), 0);
      const medicoesAguardando = medicoes.filter(m => m.status === "aguardando_aprovacao").length;
      const medicoesAprovadas = medicoes.filter(m => m.status === "aprovada").length;
      const valorMedicoesAprovadas = medicoes.filter(m => m.status === "aprovada").reduce((s, m) => s + n(m.valorMedido), 0);

      return {
        totalContratos,
        valorTotalContratado,
        valorTotalPago,
        saldoALiberar: valorTotalContratado - valorTotalPago,
        medicoesAguardando,
        medicoesAprovadas,
        valorMedicoesAprovadas,
        percentualMedioExecucao: valorTotalContratado > 0 ? (valorTotalPago / valorTotalContratado) * 100 : 0,
      };
    }),

  // ──────────────────────────────────────────────────────────────
  // INTEGRAÇÃO COMPRAS → TERCEIROS
  // Gera contrato de serviço a partir de uma cotação aprovada,
  // vinculando (ou criando) a empresa terceira a partir do fornecedor.
  // ──────────────────────────────────────────────────────────────
  gerarContratoFromCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Carregar cotação
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new Error("Cotação não encontrada");
      if ((cot as any).tipo !== "servico") throw new Error("Apenas cotações do tipo 'serviço' podem gerar contratos de terceiros");
      if ((cot as any).contratoTerceiroId) throw new Error("Esta cotação já gerou um contrato de serviço");

      const isPendente = cot.status === "pendente";

      // 2. Carregar itens
      const itens = await db.select().from(comprasCotacoesItens)
        .where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      // 3. Carregar fornecedor
      if (!cot.fornecedorId) throw new Error("A cotação não possui fornecedor vinculado");
      const [forn] = await db.select().from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId));
      if (!forn) throw new Error("Fornecedor da cotação não encontrado");

      // 4. Find-or-create empresa terceira vinculada ao fornecedor
      const existing = await db.select().from(empresasTerceiras)
        .where(and(
          eq(empresasTerceiras.companyId, input.companyId),
          eq((empresasTerceiras as any).fornecedorId, forn.id),
        ));

      let empresaTerceiraId: number;
      let isNova = false;

      if (existing.length > 0) {
        empresaTerceiraId = existing[0].id;
      } else {
        const [nova] = await db.insert(empresasTerceiras).values({
          companyId: input.companyId,
          fornecedorId: forn.id,
          razaoSocial: forn.razaoSocial,
          nomeFantasia: forn.nomeFantasia || null,
          cnpj: forn.cnpj || "",
          cep: forn.cep || null,
          logradouro: forn.endereco || null,
          numero: forn.numero || null,
          complemento: forn.complemento || null,
          bairro: forn.bairro || null,
          cidade: forn.cidade || null,
          estado: forn.estado || null,
          telefone: forn.telefone || null,
          email: forn.email || null,
          responsavelNome: forn.contatoNome || null,
          banco: forn.banco || null,
          agencia: forn.agencia || null,
          conta: forn.conta || null,
          pixChave: forn.pix || null,
          status: "ativa",
        } as any).returning();
        empresaTerceiraId = nova.id;
        isNova = true;
      }

      // 5. Consultar datas das atividades do cronograma vinculadas aos itens
      let dataInicioContrato = new Date().toISOString().slice(0, 10);
      let dataTerminoContrato: string | null = null;
      try {
        const scItemIds = itens.map(it => it.solicitacaoItemId).filter(Boolean) as number[];
        let eapCodes: string[] = [];
        if (scItemIds.length > 0) {
          const scItensRows = await db.select({
            eapCodigo: comprasSolicitacoesItens.eapCodigo,
            composicaoCodigo: comprasSolicitacoesItens.composicaoCodigo,
          }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
          eapCodes = [...new Set(scItensRows.map(s => s.eapCodigo).filter(Boolean))] as string[];
        }
        if (cot.obraId) {
          if (eapCodes.length > 0) {
            const [proj] = await db.select({ id: planejamentoProjetos.id })
              .from(planejamentoProjetos)
              .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, cot.obraId)))
              .orderBy(desc(planejamentoProjetos.id))
              .limit(1);
            if (proj) {
              const [rev] = await db.select({ id: planejamentoRevisoes.id })
                .from(planejamentoRevisoes)
                .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
                .orderBy(desc(planejamentoRevisoes.numero))
                .limit(1);
              if (rev) {
                const dateRows = await db.execute(sql`
                  SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
                  FROM planejamento_atividades
                  WHERE revisao_id = ${rev.id}
                    AND projeto_id = ${proj.id}
                    AND eap_codigo IN (${sql.join(eapCodes.map(c => sql`${c}`), sql`, `)})
                    AND data_inicio IS NOT NULL
                    AND disabled IS NOT TRUE
                `);
                const row = (dateRows as any).rows?.[0];
                if (row?.min_inicio) {
                  dataInicioContrato = String(row.min_inicio);
                  if (row.max_fim) dataTerminoContrato = String(row.max_fim);
                } else {
                  const allDates = await db.execute(sql`
                    SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
                    FROM planejamento_atividades
                    WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
                      AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
                  `);
                  const allRow = (allDates as any).rows?.[0];
                  if (allRow?.min_inicio) dataInicioContrato = String(allRow.min_inicio);
                  if (allRow?.max_fim) dataTerminoContrato = String(allRow.max_fim);
                }
              }
            }
          } else {
            const [proj] = await db.select({ id: planejamentoProjetos.id })
              .from(planejamentoProjetos)
              .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, cot.obraId)))
              .orderBy(desc(planejamentoProjetos.id))
              .limit(1);
            if (proj) {
              const [rev] = await db.select({ id: planejamentoRevisoes.id })
                .from(planejamentoRevisoes)
                .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
                .orderBy(desc(planejamentoRevisoes.numero))
                .limit(1);
              if (rev) {
                const allDates = await db.execute(sql`
                  SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
                  FROM planejamento_atividades
                  WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
                    AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
                `);
                const allRow = (allDates as any).rows?.[0];
                if (allRow?.min_inicio) dataInicioContrato = String(allRow.min_inicio);
                if (allRow?.max_fim) dataTerminoContrato = String(allRow.max_fim);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[gerarContratoFromCotacao] Erro ao consultar datas do cronograma:", e);
      }

      // 6. Gerar número de contrato CT-AAAA-NNN
      const year = new Date().getFullYear();
      const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` })
        .from(terceiroContratos)
        .where(and(
          eq(terceiroContratos.companyId, input.companyId),
          sql`EXTRACT(YEAR FROM criado_em) = ${year}`,
        ));
      const seq = (Number(cnt) + 1).toString().padStart(3, "0");
      const numeroContrato = `CT-${year}-${seq}`;

      // 7. Criar contrato
      const valorTotal = parseFloat(String(cot.total || "0"));
      const [contrato] = await db.insert(terceiroContratos).values({
        companyId: input.companyId,
        empresaTerceiraId,
        obraId: cot.obraId || null,
        numeroContrato,
        descricao: cot.descricao || `Contrato gerado da cotação ${cot.numeroCotacao}`,
        tipoContrato: "empreitada_global",
        valorTotal: String(valorTotal),
        valorPago: "0",
        dataInicio: dataInicioContrato,
        dataTermino: dataTerminoContrato,
        status: "ativo",
        observacoes: `Gerado automaticamente da cotação ${cot.numeroCotacao}.${cot.condicaoPagamento ? ` Cond. pagamento: ${cot.condicaoPagamento}.` : ""}${(cot as any).modalidadeFd && (cot as any).modalidadeFd !== "normal" ? ` [FD ${(cot as any).fdPagador === "cliente" ? "Cliente" : "FC"}: R$ ${parseFloat((cot as any).fdValor || "0").toFixed(2)}]` : ""}`,
      }).returning();

      // 7. Criar itens do contrato a partir dos itens da cotação (com EAP do SC)
      if (itens.length > 0) {
        const scItemIds = itens.map(it => it.solicitacaoItemId).filter(Boolean) as number[];
        let scItemMap: Record<number, { eapCodigo: string | null; orcamentoItemId: number | null }> = {};
        if (scItemIds.length > 0) {
          const scItems = await db.select({
            id: comprasSolicitacoesItens.id,
            eapCodigo: comprasSolicitacoesItens.eapCodigo,
            orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
          for (const si of scItems) scItemMap[si.id] = { eapCodigo: si.eapCodigo, orcamentoItemId: si.orcamentoItemId };
        }

        let eapToAtividadeId: Record<string, number> = {};
        if (cot.obraId) {
          try {
            const [proj] = await db.select({ id: planejamentoProjetos.id })
              .from(planejamentoProjetos)
              .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, cot.obraId)))
              .orderBy(desc(planejamentoProjetos.id)).limit(1);
            if (proj) {
              const [rev] = await db.select({ id: planejamentoRevisoes.id })
                .from(planejamentoRevisoes)
                .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
                .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
              if (rev) {
                const atividades = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo })
                  .from(planejamentoAtividades)
                  .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
                for (const a of atividades) {
                  if (a.eapCodigo) eapToAtividadeId[a.eapCodigo] = a.id;
                }
              }
            }
          } catch {}
        }

        await db.insert(terceiroContratoItens).values(
          itens.map((it, idx) => {
            const scInfo = it.solicitacaoItemId ? scItemMap[it.solicitacaoItemId] : null;
            const eap = scInfo?.eapCodigo ?? null;
            return {
              contratoId: contrato.id,
              companyId: input.companyId,
              descricao: it.descricao,
              unidade: it.unidade || "vb",
              quantidade: String(it.quantidade || "1"),
              valorUnitario: String(it.precoUnitario || "0"),
              valorTotal: String(it.total || "0"),
              eapCodigo: eap,
              orcamentoItemId: scInfo?.orcamentoItemId ?? null,
              planejamentoAtividadeId: eap && eapToAtividadeId[eap] ? eapToAtividadeId[eap] : null,
              ordem: idx,
            };
          })
        );
      }

      // 8. Marcar cotação como concluída (contrato gerado no módulo Terceiros)
      const cotUpdate: any = { contratoTerceiroId: contrato.id, status: "concluida" };
      if (isPendente) {
        cotUpdate.condicaoPagamento = "Medição conforme avanço físico";
      }
      await db.update(comprasCotacoes)
        .set(cotUpdate)
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "concluida", atualizadoEm: new Date().toISOString() })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      // 9. Auto-recalcular datas do cronograma (se obra vinculada)
      if (contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id))
            .limit(1);
          if (proj) {
            const [rev] = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero))
              .limit(1);
            if (rev) {
              const dateResult = await db.execute(sql`
                SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
                FROM planejamento_atividades
                WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
                  AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
              `);
              const dr = (dateResult as any).rows?.[0];
              if (dr?.min_inicio) {
                await db.update(terceiroContratos).set({
                  dataInicio: String(dr.min_inicio),
                  dataTermino: dr.max_fim ? String(dr.max_fim) : contrato.dataTermino,
                  atualizadoEm: new Date().toISOString(),
                }).where(eq(terceiroContratos.id, contrato.id));
              }
            }
          }
        } catch (e) {
          console.warn("[gerarContratoFromCotacao] Auto-cronograma error:", e);
        }
      }

      return { contratoId: contrato.id, numeroContrato, empresaTerceiraId, isNova };
    }),

  reverterAprovacaoOS: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const userRole = (ctx.user as any)?.role;
      if (userRole !== "admin" && userRole !== "admin_master") {
        throw new Error("Apenas administradores podem reverter a aprovação de uma OS");
      }

      const db = await getDb();

      const [cot] = await db.select().from(comprasCotacoes).where(
        and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId))
      );
      if (!cot) throw new Error("Cotação não encontrada");
      if (cot.status !== "concluida") throw new Error("Só é possível reverter cotações com status 'concluída'");
      const contratoId = (cot as any).contratoTerceiroId;
      if (!contratoId) throw new Error("Cotação não possui contrato de serviço vinculado");

      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, contratoId), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato de serviço não encontrado ou não pertence a esta empresa");

      const medicoes = await db.select({ id: terceiroMedicoes.id, status: terceiroMedicoes.status })
        .from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, contratoId));
      const temMedicaoPaga = medicoes.some(m => m.status === "paga");
      if (temMedicaoPaga) throw new Error("Não é possível reverter: o contrato possui medições já pagas");
      const temMedicaoAprovada = medicoes.some(m => m.status === "aprovada");
      if (temMedicaoAprovada) throw new Error("Não é possível reverter: o contrato possui medições aprovadas. Exclua-as primeiro.");

      for (const m of medicoes) {
        await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, m.id));
      }
      await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, contratoId));
      await db.delete(terceiroDocumentos).where(eq(terceiroDocumentos.contratoId, contratoId));
      await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, contratoId));
      await db.delete(terceiroContratoRevisoes).where(eq(terceiroContratoRevisoes.contratoId, contratoId));
      await db.delete(terceiroContratos).where(eq(terceiroContratos.id, contratoId));

      await db.update(comprasCotacoes)
        .set({ status: "aprovada", contratoTerceiroId: null, atualizadoEm: new Date().toISOString() } as any)
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "concluida", atualizadoEm: new Date().toISOString() })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // TEMPLATE DE CONTRATO
  // ══════════════════════════════════════════════════════════════

  getTemplate: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [tpl] = await db.select().from(terceiroContratoTemplates)
        .where(and(
          eq(terceiroContratoTemplates.companyId, input.companyId),
          eq(terceiroContratoTemplates.ativo, true)
        ))
        .orderBy(desc(terceiroContratoTemplates.versao))
        .limit(1);
      return tpl ?? null;
    }),

  salvarTemplate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      texto: z.string().min(1),
      id: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (input.id) {
        const [cur] = await db.select({ versao: terceiroContratoTemplates.versao }).from(terceiroContratoTemplates).where(eq(terceiroContratoTemplates.id, input.id));
        const novaVersao = (cur?.versao ?? 1) + 1;
        await db.update(terceiroContratoTemplates)
          .set({ nome: input.nome, texto: input.texto, versao: novaVersao, atualizadoEm: new Date().toISOString() })
          .where(eq(terceiroContratoTemplates.id, input.id));
        return { id: input.id, versao: novaVersao };
      }
      // Desativar template anterior
      await db.update(terceiroContratoTemplates)
        .set({ ativo: false })
        .where(eq(terceiroContratoTemplates.companyId, input.companyId));
      const [novo] = await db.insert(terceiroContratoTemplates)
        .values({ companyId: input.companyId, nome: input.nome, texto: input.texto, ativo: true, versao: 1 })
        .returning();
      return { id: novo.id, versao: 1 };
    }),

  gerarTextoContrato: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      const [template] = await db.select().from(terceiroContratoTemplates)
        .where(and(
          eq(terceiroContratoTemplates.companyId, contrato.companyId),
          eq(terceiroContratoTemplates.ativo, true)
        ))
        .orderBy(desc(terceiroContratoTemplates.versao))
        .limit(1);
      if (!template) throw new Error("Nenhum template de contrato cadastrado. Acesse Configurações > Template de Contrato para criar um.");

      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));
      const [company] = await db.select().from(companies).where(eq(companies.id, contrato.companyId));
      const [obra] = contrato.obraId ? await db.select().from(obras).where(eq(obras.id, contrato.obraId)) : [null];

      const fmtDate = (d: string | null | undefined) => {
        if (!d) return "___/___/______";
        const [y, m, day] = d.slice(0, 10).split("-");
        return `${day}/${m}/${y}`;
      };
      const fmtMoney = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
      const endEmpresa = [empresa?.logradouro, empresa?.numero, empresa?.bairro, empresa?.cidade, empresa?.estado].filter(Boolean).join(", ");
      const endCompany = company?.endereco ?? [company?.cidade, company?.estado].filter(Boolean).join(" - ") ?? "";

      const vars: Record<string, string> = {
        "NUMERO_CONTRATO": contrato.numeroContrato ?? "_______________",
        "ANO_ATUAL": new Date().getFullYear().toString(),
        "CONTRATANTE_NOME": company?.razaoSocial ?? "_______________",
        "CONTRATANTE_CNPJ": company?.cnpj ?? "_______________",
        "CONTRATANTE_ENDERECO": endCompany || "_______________",
        "CONTRATANTE_REPRESENTANTE": "Felipe Costa Alves",
        "CONTRATANTE_CARGO": "Sócio Administrador",
        "CONTRATADA_NOME": empresa?.razaoSocial ?? "_______________",
        "CONTRATADA_CNPJ": empresa?.cnpj ?? "_______________",
        "CONTRATADA_ENDERECO": endEmpresa || "_______________",
        "CONTRATADA_REPRESENTANTE": empresa?.responsavelNome ?? "_______________",
        "CONTRATADA_CARGO": empresa?.responsavelCargo ?? "Representante Legal",
        "OBRA_NOME": obra?.nome ?? contrato.obraNome ?? "_______________",
        "DESCRICAO_OBJETO": contrato.descricao ?? "_______________",
        "VALOR_TOTAL": fmtMoney(contrato.valorTotal),
        "DATA_INICIO": fmtDate(contrato.dataInicio ?? undefined),
        "DATA_TERMINO": fmtDate(contrato.dataTermino ?? undefined),
        "CIDADE_ESTADO": [company?.cidade, company?.estado].filter(Boolean).join(" - ") || "Montes Claros - MG",
        "DATA_ASSINATURA": fmtDate(new Date().toISOString()),
      };

      let texto = template.texto;
      for (const [k, v] of Object.entries(vars)) {
        texto = texto.replaceAll(`{{${k}}}`, v);
      }

      // Salvar revisão da versão atual, se já tiver texto
      const versaoAtual = contrato.versaoTexto ?? 0;
      if (contrato.textoContrato && versaoAtual > 0) {
        await db.insert(terceiroContratoRevisoes).values({
          contratoId: contrato.id,
          companyId: contrato.companyId,
          versao: versaoAtual,
          texto: contrato.textoContrato,
          observacao: "Substituído por regeneração automática",
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratos)
        .set({ textoContrato: texto, templateId: template.id, versaoTexto: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId));

      return { texto, versao: novaVersao };
    }),

  salvarTextoContrato: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      texto: z.string(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      // Arquivar versão atual como revisão
      const versaoAtual = contrato.versaoTexto ?? 0;
      if (contrato.textoContrato) {
        await db.insert(terceiroContratoRevisoes).values({
          contratoId: contrato.id,
          companyId: contrato.companyId,
          versao: versaoAtual,
          texto: contrato.textoContrato,
          observacao: input.observacao ?? "Edição manual",
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratos)
        .set({ textoContrato: input.texto, versaoTexto: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId));

      return { versao: novaVersao };
    }),

  listarRevisoes: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(terceiroContratoRevisoes)
        .where(eq(terceiroContratoRevisoes.contratoId, input.contratoId))
        .orderBy(desc(terceiroContratoRevisoes.versao));
    }),

  restaurarRevisao: protectedProcedure
    .input(z.object({ contratoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [rev] = await db.select().from(terceiroContratoRevisoes).where(eq(terceiroContratoRevisoes.id, input.revisaoId));
      if (!rev) throw new Error("Revisão não encontrada");

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      const versaoAtual = contrato?.versaoTexto ?? 0;

      if (contrato?.textoContrato) {
        await db.insert(terceiroContratoRevisoes).values({
          contratoId: input.contratoId,
          companyId: rev.companyId,
          versao: versaoAtual,
          texto: contrato.textoContrato,
          observacao: `Substituído ao restaurar revisão v${rev.versao}`,
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratos)
        .set({ textoContrato: rev.texto, versaoTexto: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId));

      return { versao: novaVersao };
    }),
});

async function _recalcularValorContrato(db: any, contratoId: number) {
  const itens = await db.select().from(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, contratoId));
  const total = itens.reduce((s: number, i: any) => s + n(i.valorTotal), 0);
  await db.update(terceiroContratos).set({ valorTotal: String(total), atualizadoEm: new Date().toISOString() })
    .where(eq(terceiroContratos.id, contratoId));
}
