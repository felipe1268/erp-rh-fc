import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getEffectiveAllowedObraIds, userCanAccessObra, recordTrashEntry, getUserCompanyLinks } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { verificarAssinaturaMemorial } from "../services/assinaturaMemorial";

function rows(result: any): any[] {
  return (result as any).rows ?? result ?? [];
}

// Guard PERMISSIVO de empresa (mesmo padrão de medicao/compras): admin libera;
// usuário sem vínculo libera; bloqueia usuário vinculado tentando outra empresa.
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
// Guard combinado empresa+obra para o Mapa de Concretagem.
async function assertConcretagemAccess(ctxUser: any, companyId: number, obraId: number) {
  await assertCompanyAccess(ctxUser, companyId);
  if (!(await userCanAccessObra(ctxUser.id, ctxUser.role, obraId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
  }
}

// Guards locais: garantem que o usuário tem acesso à obra do RDO antes de
// criar/editar/excluir filhos (mão de obra, atividades, etc.) por rdoId/relatorioId.
async function assertRdoObraAccess(ctx: any, rdoId: number, companyId: number) {
  const db = await getDb();
  const own = rows(await db.execute(sql`SELECT obra_id FROM rdo_relatorios WHERE id = ${rdoId} AND company_id = ${companyId}`));
  if (!own.length) throw new TRPCError({ code: "NOT_FOUND", message: "RDO não encontrado" });
  if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
  }
}
async function assertRdoImportadoObraAccess(ctx: any, relatorioId: number, companyId: number) {
  const db = await getDb();
  const own = rows(await db.execute(sql`SELECT obra_id FROM diario_obra_relatorios WHERE id = ${relatorioId} AND company_id = ${companyId}`));
  if (!own.length) throw new TRPCError({ code: "NOT_FOUND", message: "Relatório não encontrado" });
  if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este relatório" });
  }
}
// Variante para mutations remover* que recebem o id do FILHO (rdo_atividades, etc).
// childTable é injetado como literal SQL; childId/companyId são forçados a Number antes de virar SQL.
async function assertRdoChildObraAccess(ctx: any, childTable: string, childId: number, companyId: number) {
  const db = await getDb();
  const cid = Number(childId), coid = Number(companyId);
  const own = rows(await db.execute(sql.raw(
    `SELECT r.obra_id FROM ${childTable} c JOIN rdo_relatorios r ON r.id = c.rdo_id WHERE c.id = ${cid} AND r.company_id = ${coid}`
  )));
  if (!own.length) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
  if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
  }
}
async function assertRdoImportadoChildObraAccess(ctx: any, childTable: string, childId: number, companyId: number) {
  const db = await getDb();
  const cid = Number(childId), coid = Number(companyId);
  const own = rows(await db.execute(sql.raw(
    `SELECT r.obra_id FROM ${childTable} c JOIN diario_obra_relatorios r ON r.id = c.relatorio_id WHERE c.id = ${cid} AND r.company_id = ${coid}`
  )));
  if (!own.length) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
  if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este relatório" });
  }
}

// Captura snapshot de um filho de RDO antes de hard delete e grava na lixeira central.
async function snapshotRdoChild(ctx: any, childTable: string, entityType: string, childId: number, companyId: number, label: string) {
  const db = await getDb();
  const cid = Number(childId);
  const r = await db.execute(sql.raw(`SELECT * FROM ${childTable} WHERE id = ${cid} LIMIT 1`));
  const row = ((r as any)?.rows ?? r ?? [])[0];
  if (!row) return;
  await recordTrashEntry({
    entityType,
    entityId: cid,
    companyId,
    obraId: null,
    parentEntity: childTable.startsWith("diario_obra_") ? "rdoRelatorioImportado" : "rdoRelatorio",
    parentId: Number(row.rdo_id ?? row.relatorio_id ?? 0) || null,
    label,
    snapshot: row,
    deletedBy: ctx.user.name ?? null,
    deletedByUserId: ctx.user.id,
  });
}

export const operacionalRouter = router({
  listarObrasUnificadas: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const mainObras = rows(await db.execute(sql`
        SELECT o.id, o.nome, o.status, o."companyId" as company_id, 'principal' as fonte,
          (SELECT COUNT(*) FROM rdo_relatorios r WHERE r.obra_id = o.id AND r.company_id = ${input.companyId}) as total_relatorios
        FROM obras o WHERE o."companyId" = ${input.companyId}
        ${input.status && input.status !== 'todas' ? sql`AND o.status = ${input.status}` : sql``}
        ORDER BY o.nome
      `));
      const dioObras = rows(await db.execute(sql`
        SELECT d.id, d.nome, d.status, d.company_id, 'importado' as fonte, d.logo_url,
          (SELECT COUNT(*) FROM diario_obra_relatorios r WHERE r.obra_id = d.id) as total_relatorios,
          d.total_fotos
        FROM diario_obra_obras d WHERE d.company_id = ${input.companyId}
        ${input.status && input.status !== 'todas' ? sql`AND d.status = ${input.status}` : sql``}
        ORDER BY d.nome
      `));
      return { principais: mainObras, importadas: dioObras };
    }),

  getObraImportada: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const obraRows = rows(await db.execute(sql`
        SELECT id, nome, status, company_id, endereco, cliente as contratante, responsavel,
               data_inicio, data_previsao_fim as data_previsao_termino, contrato as numero_contrato,
               prazo_contratual as prazo_contratual_original, logo_url, observacoes, external_id
        FROM diario_obra_obras WHERE id = ${input.obraId} AND company_id = ${input.companyId}
      `));
      if (!obraRows[0]) return null;
      const obra = obraRows[0];
      const stats = rows(await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM diario_obra_relatorios WHERE obra_id = ${input.obraId}) as total_relatorios,
          (SELECT COUNT(*) FROM diario_obra_atividades a JOIN diario_obra_relatorios r ON a.relatorio_id = r.id WHERE r.obra_id = ${input.obraId}) as total_atividades,
          (SELECT COUNT(*) FROM diario_obra_ocorrencias o JOIN diario_obra_relatorios r ON o.relatorio_id = r.id WHERE r.obra_id = ${input.obraId}) as total_ocorrencias,
          (SELECT COUNT(*) FROM diario_obra_comentarios c JOIN diario_obra_relatorios r ON c.relatorio_id = r.id WHERE r.obra_id = ${input.obraId}) as total_comentarios,
          (SELECT COUNT(*) FROM diario_obra_fotos f JOIN diario_obra_relatorios r ON f.relatorio_id = r.id WHERE r.obra_id = ${input.obraId}) as total_fotos
      `));
      const relatoriosRecentes = rows(await db.execute(sql`
        SELECT r.id, r.numero, r.data, r.status, r.external_id,
          COALESCE((SELECT COUNT(*) FROM diario_obra_fotos f WHERE f.relatorio_id = r.id), 0) as total_fotos,
          COALESCE((SELECT COUNT(*) FROM diario_obra_videos v WHERE v.relatorio_id = r.id), 0) as total_videos
        FROM diario_obra_relatorios r
        WHERE r.obra_id = ${input.obraId} ORDER BY r.data DESC LIMIT 7
      `));
      let prazoContratual = obra.prazo_contratual_original ? Number(obra.prazo_contratual_original) : null;
      let prazoDecorrido = null;
      let prazoVencer = null;
      if (obra.data_inicio && obra.data_previsao_termino) {
        const inicio = new Date(obra.data_inicio);
        const fim = new Date(obra.data_previsao_termino);
        const hoje = new Date();
        if (!prazoContratual) prazoContratual = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
        prazoDecorrido = Math.max(0, Math.ceil((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
        prazoVencer = Math.max(0, prazoContratual - prazoDecorrido);
      } else if (obra.data_inicio && prazoContratual) {
        const inicio = new Date(obra.data_inicio);
        const hoje = new Date();
        prazoDecorrido = Math.max(0, Math.ceil((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
        prazoVencer = Math.max(0, prazoContratual - prazoDecorrido);
      }

      const dbFotos = rows(await db.execute(sql`
        SELECT f.id, f.descricao FROM diario_obra_fotos f
        JOIN diario_obra_relatorios r ON f.relatorio_id = r.id
        WHERE r.obra_id = ${input.obraId}
        ORDER BY f.id DESC LIMIT 12
      `));
      let apiPhotos: any[] = [];
      let apiVideos: any[] = [];
      let apiStats: any = null;
      const token = process.env.DIARIO_OBRA_API_TOKEN;
      if (token && obra.external_id) {
        try {
          const resp = await fetch(`https://api.diariodeobra.app/v2/obras/${obra.external_id}`, {
            headers: { 'token': token },
            signal: AbortSignal.timeout(8000),
          });
          if (resp.ok) {
            const apiData = await resp.json() as any;
            apiPhotos = (apiData.visaoGeral?.ultimasFotos || []).slice(0, 12).map((f: any) => ({
              url: f.url,
              urlMiniatura: f.urlMiniatura,
            }));
            apiVideos = (apiData.visaoGeral?.ultimosVideos || apiData.visaoGeral?.ultimasVideos || []).slice(0, 6).map((v: any) => ({
              url: v.url,
              urlMiniatura: v.urlFoto || v.urlMiniatura || v.url,
              duracao: v.duracao,
            }));
            apiStats = apiData.visaoGeral?.total || null;
            if (!obra.endereco && apiData.endereco) obra.endereco = apiData.endereco;
            if (!obra.responsavel && apiData.responsavel) obra.responsavel = apiData.responsavel;
            if (!obra.numero_contrato && apiData.numeroContrato) obra.numero_contrato = apiData.numeroContrato;
            if (!obra.observacoes && apiData.observacao) obra.observacoes = apiData.observacao;
            if (!obra.contratante && apiData.cliente) obra.contratante = apiData.cliente;
            if (apiData.prazo) {
              prazoContratual = apiData.prazo.contratual || prazoContratual;
              prazoDecorrido = apiData.prazo.decorrido ?? prazoDecorrido;
              prazoVencer = apiData.prazo.aVencer ?? prazoVencer;
            }
          }
        } catch {}
      }

      if (token && obra.external_id && relatoriosRecentes.length > 0) {
        try {
          const recsWithExtId = relatoriosRecentes.filter((r: any) => r.external_id);
          const detailPromises = recsWithExtId.map((r: any) =>
            fetch(`https://api.diariodeobra.app/v2/obras/${obra.external_id}/relatorios/${r.external_id}`, {
              headers: { 'token': token },
              signal: AbortSignal.timeout(6000),
            }).then(res => res.ok ? res.json() : null).catch(() => null)
          );
          const details = await Promise.all(detailPromises);
          const countMap = new Map<string, { fotos: number; videos: number }>();
          details.forEach((det: any, i: number) => {
            if (det) {
              countMap.set(recsWithExtId[i].external_id, {
                fotos: (det.galeriaDeFotos || []).length,
                videos: (det.videos || []).length,
              });
            }
          });
          for (const r of relatoriosRecentes as any[]) {
            if (r.external_id && countMap.has(r.external_id)) {
              const c = countMap.get(r.external_id)!;
              r.total_fotos = Math.max(Number(r.total_fotos) || 0, c.fotos);
              r.total_videos = Math.max(Number(r.total_videos) || 0, c.videos);
            }
          }
        } catch {}
      }

      const mergedStats = apiStats ? {
        total_relatorios: apiStats.relatorios ?? stats[0]?.total_relatorios ?? 0,
        total_atividades: apiStats.atividades ?? stats[0]?.total_atividades ?? 0,
        total_ocorrencias: apiStats.ocorrencias ?? stats[0]?.total_ocorrencias ?? 0,
        total_comentarios: apiStats.comentarios ?? stats[0]?.total_comentarios ?? 0,
        total_fotos: apiStats.fotos ?? stats[0]?.total_fotos ?? 0,
        total_videos: apiStats.videos ?? 0,
      } : { ...(stats[0] || {}), total_videos: 0 };

      const finalPhotos = apiPhotos.length > 0 ? apiPhotos : dbFotos.map((f: any) => ({
        url: `/api/diario-obra/foto/${f.id}`,
        urlMiniatura: `/api/diario-obra/foto/${f.id}`,
        dbId: f.id,
      }));

      return {
        ...obra,
        stats: mergedStats,
        fotosRecentes: finalPhotos,
        relatoriosRecentes,
        prazoContratual, prazoDecorrido, prazoVencer,
        videosRecentes: apiVideos,
      };
    }),

  listarRDOs: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), mes: z.string().optional(), fonte: z.enum(['principal', 'importado']).optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // Bloqueia obras fora da lista permitida do usuário (admin/admin_master => sem restrição).
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && !allowed.includes(input.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
      }
      if (input.fonte === 'importado') {
        const conditions = [
          sql`company_id = ${input.companyId}`,
          sql`obra_id = ${input.obraId}`,
        ];
        if (input.mes) conditions.push(sql`TO_CHAR(data, 'YYYY-MM') = ${input.mes}`);
        const where = sql.join(conditions, sql` AND `);
        const result = rows(await db.execute(sql`
          SELECT r.id, r.obra_id, r.company_id, r.external_id, r.numero, r.data, r.status, r.responsavel_nome,
                 r.clima_manha, r.clima_tarde, r.clima_noite, r.hora_inicio, r.hora_fim, r.horas_trabalhadas,
                 r.observacoes, r.importado_em, r.created_at, r.updated_at, 'importado' as fonte,
                 COALESCE((SELECT COUNT(*) FROM diario_obra_fotos f WHERE f.relatorio_id = r.id), 0) as total_fotos,
                 COALESCE((SELECT COUNT(*) FROM diario_obra_videos v WHERE v.relatorio_id = r.id), 0) as total_videos
          FROM diario_obra_relatorios r WHERE ${where} ORDER BY r.data DESC, r.numero DESC
        `));
        const token = process.env.DIARIO_OBRA_API_TOKEN;
        const obra = rows(await db.execute(sql`SELECT external_id FROM diario_obra_obras WHERE id = ${input.obraId}`));
        const obraExtId = obra[0]?.external_id;
        if (token && obraExtId) {
          try {
            const recsWithExtId = result.filter((r: any) => r.external_id).slice(0, 15);
            const detailPromises = recsWithExtId.map((r: any) =>
              fetch(`https://api.diariodeobra.app/v2/obras/${obraExtId}/relatorios/${r.external_id}`, {
                headers: { 'token': token },
                signal: AbortSignal.timeout(6000),
              }).then(res => res.ok ? res.json() : null).catch(() => null)
            );
            const details = await Promise.all(detailPromises);
            const countMap = new Map<string, { fotos: number; videos: number }>();
            details.forEach((det: any, i: number) => {
              if (det) {
                countMap.set(recsWithExtId[i].external_id, {
                  fotos: (det.galeriaDeFotos || []).length,
                  videos: (det.videos || []).length,
                });
              }
            });
            for (const r of result as any[]) {
              if (r.external_id && countMap.has(r.external_id)) {
                const c = countMap.get(r.external_id)!;
                r.total_fotos = Math.max(Number(r.total_fotos) || 0, c.fotos);
                r.total_videos = Math.max(Number(r.total_videos) || 0, c.videos);
              }
            }
          } catch {}
        }
        return result;
      }
      const conditions = [
        sql`company_id = ${input.companyId}`,
        sql`obra_id = ${input.obraId}`,
      ];
      if (input.mes) {
        conditions.push(sql`TO_CHAR(data, 'YYYY-MM') = ${input.mes}`);
      }
      const where = sql.join(conditions, sql` AND `);
      return rows(await db.execute(sql`SELECT *, 'principal' as fonte FROM rdo_relatorios WHERE ${where} ORDER BY data DESC`));
    }),

  getRDO: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), fonte: z.enum(['principal', 'importado']).optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // Guard de acesso à obra: descobre obra_id do RDO antes de retornar.
      const tabela = input.fonte === 'importado' ? sql`diario_obra_relatorios` : sql`rdo_relatorios`;
      const own = rows(await db.execute(sql`SELECT obra_id FROM ${tabela} WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      const obraId = own[0]?.obra_id ?? null;
      if (obraId != null && !(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(obraId)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
      }
      if (input.fonte === 'importado') {
        const relRows = rows(await db.execute(sql`
          SELECT id, obra_id, company_id, external_id, numero, data, status, responsavel_nome,
                 clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
                 hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim, horas_trabalhadas,
                 observacoes, pdf_url, dados_json, importado_em, created_at, updated_at, 'importado' as fonte
          FROM diario_obra_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}
        `));
        if (!relRows[0]) return null;
        const rel = relRows[0];
        const [maoObra, equipamentos, atividades, ocorrencias, materiais, comentarios] = await Promise.all([
          db.execute(sql`SELECT id, nome, funcao, categoria, presente, hora_inicio, hora_fim, horas_trabalhadas, dados_json FROM diario_obra_mao_obra WHERE relatorio_id = ${input.id} ORDER BY nome`),
          db.execute(sql`SELECT id, nome, tipo, quantidade, hora_inicio, hora_fim, horas_trabalhadas, operativo, situacao, observacao FROM diario_obra_equipamentos WHERE relatorio_id = ${input.id} ORDER BY nome`),
          db.execute(sql`SELECT id, item, descricao, etapa, percentual_avanco, observacao, unidade, quantidade_prevista, quantidade_realizada, quantidade_acumulada FROM diario_obra_atividades WHERE relatorio_id = ${input.id} ORDER BY item, id`),
          db.execute(sql`SELECT id, descricao, tipo, providencia FROM diario_obra_ocorrencias WHERE relatorio_id = ${input.id} ORDER BY id`),
          db.execute(sql`SELECT id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor FROM diario_obra_materiais WHERE relatorio_id = ${input.id} ORDER BY tipo, id`),
          db.execute(sql`SELECT id, texto, autor, data_hora FROM diario_obra_comentarios WHERE relatorio_id = ${input.id} ORDER BY data_hora`),
        ]);
        const fotosImport = rows(await db.execute(sql`SELECT id, descricao, mime_type, tamanho_bytes, created_at FROM diario_obra_fotos WHERE relatorio_id = ${input.id} ORDER BY id`));

        let apiFotos: any[] = [];
        let apiVideos: any[] = [];
        const token = process.env.DIARIO_OBRA_API_TOKEN;
        if (token && rel.external_id) {
          const obraRow = rows(await db.execute(sql`SELECT external_id FROM diario_obra_obras WHERE id = ${rel.obra_id}`));
          const obraExtId = obraRow[0]?.external_id;
          if (obraExtId) {
            try {
              const resp = await fetch(`https://api.diariodeobra.app/v2/obras/${obraExtId}/relatorios/${rel.external_id}`, {
                headers: { 'token': token },
                signal: AbortSignal.timeout(8000),
              });
              if (resp.ok) {
                const apiData = await resp.json() as any;
                apiFotos = (apiData.galeriaDeFotos || []).map((f: any) => ({
                  url: f.url,
                  urlMiniatura: f.urlMiniatura || f.url,
                  descricao: f.descricao,
                }));
                apiVideos = (apiData.videos || []).map((v: any) => ({
                  url: v.url,
                  urlFoto: v.urlFoto || v.arquivoFoto || v.url,
                  duracao: v.duracao,
                  descricao: v.descricao,
                }));
              }
            } catch {}
          }
        }

        const finalFotos = apiFotos.length > 0 ? apiFotos : fotosImport.map((f: any) => ({
          url: `/api/diario-obra/foto/${f.id}`,
          urlMiniatura: `/api/diario-obra/foto/${f.id}`,
          descricao: f.descricao,
          dbId: f.id,
        }));

        return { ...rel, maoObra: rows(maoObra), equipamentos: rows(equipamentos), atividades: rows(atividades), ocorrencias: rows(ocorrencias), materiais: rows(materiais), comentarios: rows(comentarios), fotos: finalFotos, videos: apiVideos };
      }
      const rdoRows = rows(await db.execute(sql`SELECT *, 'principal' as fonte FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      const rdoData = rdoRows[0] || null;
      if (!rdoData) return null;

      const maoObra = rows(await db.execute(sql`SELECT * FROM rdo_mao_obra WHERE rdo_id = ${input.id} ORDER BY tipo, funcao`));
      const equipamentos = rows(await db.execute(sql`SELECT * FROM rdo_equipamentos WHERE rdo_id = ${input.id} ORDER BY nome`));
      const atividades = rows(await db.execute(sql`SELECT * FROM rdo_atividades WHERE rdo_id = ${input.id} ORDER BY id`));
      const materiais = rows(await db.execute(sql`SELECT * FROM rdo_materiais WHERE rdo_id = ${input.id} ORDER BY tipo, id`));
      const fotos = rows(await db.execute(sql`SELECT * FROM rdo_fotos WHERE rdo_id = ${input.id} ORDER BY id`));

      return { ...rdoData, maoObra, equipamentos, atividades, materiais, fotos };
    }),

  criarRDO: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      data: z.string(),
      responsavelNome: z.string().optional(),
      responsavelId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, input.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
      }
      const db = await getDb();
      const existingRows = rows(await db.execute(sql`
        SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId} AND data = ${input.data}
      `));
      if (existingRows.length > 0) return { id: existingRows[0].id, jaExistia: true };

      const result = rows(await db.execute(sql`
        INSERT INTO rdo_relatorios (company_id, obra_id, data, responsavel_nome, responsavel_id, status)
        VALUES (${input.companyId}, ${input.obraId}, ${input.data}, ${input.responsavelNome || null}, ${input.responsavelId || null}, 'rascunho')
        RETURNING id
      `));
      const rdoId = result[0]?.id;

      await autoPreencherRDO(db, rdoId, input.companyId, input.obraId);

      return { id: rdoId, jaExistia: false };
    }),

  // NOTA: assertRDOAccess é um guard local que valida acesso à obra do RDO
  // antes de qualquer mutation por id. Carrega obra_id do banco e delega para
  // userCanAccessObra (helper centralizado em server/db.ts).
  atualizarRDO: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      climaManha: z.string().optional(),
      climaTarde: z.string().optional(),
      temperaturaMin: z.number().optional(),
      temperaturaMax: z.number().optional(),
      choveu: z.boolean().optional(),
      horasTrabalhadas: z.number().optional(),
      horaInicio: z.string().optional(),
      horaFim: z.string().optional(),
      observacoes: z.string().optional(),
      visitantes: z.string().optional(),
      ddsRealizado: z.boolean().optional(),
      ddsTema: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const own = rows(await db.execute(sql`SELECT obra_id FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (own.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "RDO não encontrado" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
      }
      await db.execute(sql`
        UPDATE rdo_relatorios SET
          clima_manha = COALESCE(${input.climaManha ?? null}, clima_manha),
          clima_tarde = COALESCE(${input.climaTarde ?? null}, clima_tarde),
          temperatura_min = COALESCE(${input.temperaturaMin ?? null}, temperatura_min),
          temperatura_max = COALESCE(${input.temperaturaMax ?? null}, temperatura_max),
          choveu = COALESCE(${input.choveu ?? null}, choveu),
          horas_trabalhadas = COALESCE(${input.horasTrabalhadas ?? null}, horas_trabalhadas),
          hora_inicio = COALESCE(${input.horaInicio ?? null}, hora_inicio),
          hora_fim = COALESCE(${input.horaFim ?? null}, hora_fim),
          observacoes = COALESCE(${input.observacoes ?? null}, observacoes),
          visitantes = COALESCE(${input.visitantes ?? null}, visitantes),
          dds_realizado = COALESCE(${input.ddsRealizado ?? null}, dds_realizado),
          dds_tema = COALESCE(${input.ddsTema ?? null}, dds_tema),
          updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  finalizarRDO: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      responsavelNome: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const own = rows(await db.execute(sql`SELECT obra_id FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (own.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "RDO não encontrado" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
      }
      await db.execute(sql`
        UPDATE rdo_relatorios SET
          status = 'finalizado',
          assinatura_responsavel = ${input.responsavelNome},
          assinatura_data = NOW(),
          updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  deletarRDO: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const ownership = rows(await db.execute(sql`SELECT id, obra_id FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (ownership.length === 0) throw new Error("RDO não encontrado ou sem permissão");
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(ownership[0].obra_id)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
      }
      await db.execute(sql`BEGIN`);
      try {
        await db.execute(sql`DELETE FROM rdo_fotos WHERE rdo_id = ${input.id}`);
        await db.execute(sql`DELETE FROM rdo_materiais WHERE rdo_id = ${input.id}`);
        await db.execute(sql`DELETE FROM rdo_atividades WHERE rdo_id = ${input.id}`);
        await db.execute(sql`DELETE FROM rdo_equipamentos WHERE rdo_id = ${input.id}`);
        await db.execute(sql`DELETE FROM rdo_mao_obra WHERE rdo_id = ${input.id}`);
        await db.execute(sql`DELETE FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`);
        await db.execute(sql`COMMIT`);
      } catch (e) {
        await db.execute(sql`ROLLBACK`);
        throw e;
      }
      return { ok: true };
    }),

  reabrirRDO: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const own = rows(await db.execute(sql`SELECT obra_id FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (own.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "RDO não encontrado" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, Number(own[0].obra_id)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este RDO" });
      }
      await db.execute(sql`
        UPDATE rdo_relatorios SET status = 'rascunho', updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND status = 'finalizado'
      `);
      return { ok: true };
    }),

  adicionarMaoObra: protectedProcedure
    .input(z.object({
      rdoId: z.number(),
      companyId: z.number(),
      tipo: z.string().default("proprio"),
      empresaNome: z.string().optional(),
      funcao: z.string(),
      quantidade: z.number(),
      presente: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoObraAccess(ctx, input.rdoId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO rdo_mao_obra (rdo_id, tipo, empresa_nome, funcao, quantidade, presente)
        VALUES (${input.rdoId}, ${input.tipo}, ${input.empresaNome || null}, ${input.funcao}, ${input.quantidade}, ${input.presente})
      `);
      return { ok: true };
    }),

  removerMaoObra: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoChildObraAccess(ctx, "rdo_mao_obra", input.id, input.companyId);
      await snapshotRdoChild(ctx, "rdo_mao_obra", "rdoMaoObra", input.id, input.companyId, `RDO Mão de Obra #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM rdo_mao_obra WHERE id = ${input.id}
        AND rdo_id IN (SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarAtividade: protectedProcedure
    .input(z.object({
      rdoId: z.number(),
      companyId: z.number(),
      descricao: z.string(),
      local: z.string().optional(),
      percentualAvanco: z.number().optional(),
      status: z.string().default("em_andamento"),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoObraAccess(ctx, input.rdoId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO rdo_atividades (rdo_id, descricao, local, percentual_avanco, status)
        VALUES (${input.rdoId}, ${input.descricao}, ${input.local || null}, ${input.percentualAvanco || 0}, ${input.status})
      `);
      return { ok: true };
    }),

  removerAtividade: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoChildObraAccess(ctx, "rdo_atividades", input.id, input.companyId);
      await snapshotRdoChild(ctx, "rdo_atividades", "rdoAtividade", input.id, input.companyId, `RDO Atividade #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM rdo_atividades WHERE id = ${input.id}
        AND rdo_id IN (SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarEquipamento: protectedProcedure
    .input(z.object({
      rdoId: z.number(),
      companyId: z.number(),
      nome: z.string(),
      tipo: z.string().optional(),
      situacao: z.string().default("operando"),
      horasUso: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoObraAccess(ctx, input.rdoId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO rdo_equipamentos (rdo_id, nome, tipo, situacao, horas_uso)
        VALUES (${input.rdoId}, ${input.nome}, ${input.tipo || null}, ${input.situacao}, ${input.horasUso || 0})
      `);
      return { ok: true };
    }),

  removerEquipamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoChildObraAccess(ctx, "rdo_equipamentos", input.id, input.companyId);
      await snapshotRdoChild(ctx, "rdo_equipamentos", "rdoEquipamento", input.id, input.companyId, `RDO Equipamento #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM rdo_equipamentos WHERE id = ${input.id}
        AND rdo_id IN (SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarMaterial: protectedProcedure
    .input(z.object({
      rdoId: z.number(),
      companyId: z.number(),
      tipo: z.string().default("recebido"),
      descricao: z.string(),
      quantidade: z.number().optional(),
      unidade: z.string().optional(),
      fornecedor: z.string().optional(),
      notaFiscal: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoObraAccess(ctx, input.rdoId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO rdo_materiais (rdo_id, tipo, descricao, quantidade, unidade, fornecedor, nota_fiscal)
        VALUES (${input.rdoId}, ${input.tipo}, ${input.descricao}, ${input.quantidade || 0}, ${input.unidade || null}, ${input.fornecedor || null}, ${input.notaFiscal || null})
      `);
      return { ok: true };
    }),

  removerMaterial: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoChildObraAccess(ctx, "rdo_materiais", input.id, input.companyId);
      await snapshotRdoChild(ctx, "rdo_materiais", "rdoMaterial", input.id, input.companyId, `RDO Material #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM rdo_materiais WHERE id = ${input.id}
        AND rdo_id IN (SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarFotoRDO: protectedProcedure
    .input(z.object({
      rdoId: z.number(),
      companyId: z.number(),
      fotoUrl: z.string(),
      legenda: z.string().optional(),
      disciplina: z.string().optional(),
      local: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoObraAccess(ctx, input.rdoId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO rdo_fotos (rdo_id, foto_url, legenda, disciplina, local)
        VALUES (${input.rdoId}, ${input.fotoUrl}, ${input.legenda || null}, ${input.disciplina || null}, ${input.local || null})
      `);
      return { ok: true };
    }),

  removerFotoRDO: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoChildObraAccess(ctx, "rdo_fotos", input.id, input.companyId);
      await snapshotRdoChild(ctx, "rdo_fotos", "rdoFoto", input.id, input.companyId, `RDO Foto #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM rdo_fotos WHERE id = ${input.id}
        AND rdo_id IN (SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  atualizarRDOImportado: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      climaManha: z.string().optional(),
      climaTarde: z.string().optional(),
      condicaoManha: z.string().optional(),
      condicaoTarde: z.string().optional(),
      horaInicio: z.string().optional(),
      horaFim: z.string().optional(),
      horaIntervaloInicio: z.string().optional(),
      horaIntervaloFim: z.string().optional(),
      horasTrabalhadas: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.id, input.companyId);
      const db = await getDb();
      const rel = rows(await db.execute(sql`SELECT status FROM diario_obra_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (!rel.length) throw new Error("Relatório não encontrado");
      if (rel[0].status === 'aprovado' || rel[0].status === 'finalizado') {
        throw new Error("Relatório aprovado/finalizado não pode ser editado. Reabra como rascunho primeiro.");
      }
      await db.execute(sql`
        UPDATE diario_obra_relatorios SET
          clima_manha = COALESCE(${input.climaManha ?? null}, clima_manha),
          clima_tarde = COALESCE(${input.climaTarde ?? null}, clima_tarde),
          condicao_manha = COALESCE(${input.condicaoManha ?? null}, condicao_manha),
          condicao_tarde = COALESCE(${input.condicaoTarde ?? null}, condicao_tarde),
          hora_inicio = COALESCE(${input.horaInicio ?? null}, hora_inicio),
          hora_fim = COALESCE(${input.horaFim ?? null}, hora_fim),
          hora_intervalo_inicio = COALESCE(${input.horaIntervaloInicio ?? null}, hora_intervalo_inicio),
          hora_intervalo_fim = COALESCE(${input.horaIntervaloFim ?? null}, hora_intervalo_fim),
          horas_trabalhadas = COALESCE(${input.horasTrabalhadas ?? null}, horas_trabalhadas),
          observacoes = COALESCE(${input.observacoes ?? null}, observacoes),
          updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  validarRDOImportado: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      status: z.enum(['aprovado', 'revisao', 'finalizado', 'rascunho']),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.id, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        UPDATE diario_obra_relatorios SET status = ${input.status}, updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  adicionarMaoObraImportado: protectedProcedure
    .input(z.object({
      relatorioId: z.number(),
      companyId: z.number(),
      nome: z.string(),
      funcao: z.string().optional(),
      categoria: z.string().optional(),
      presente: z.boolean().default(true),
      horaInicio: z.string().optional(),
      horaFim: z.string().optional(),
      horasTrabalhadas: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.relatorioId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO diario_obra_mao_obra (relatorio_id, nome, funcao, categoria, presente, hora_inicio, hora_fim, horas_trabalhadas)
        VALUES (${input.relatorioId}, ${input.nome}, ${input.funcao || null}, ${input.categoria || 'Direta'}, ${input.presente}, ${input.horaInicio || null}, ${input.horaFim || null}, ${input.horasTrabalhadas || null})
      `);
      return { ok: true };
    }),

  removerMaoObraImportado: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoChildObraAccess(ctx, "diario_obra_mao_obra", input.id, input.companyId);
      await snapshotRdoChild(ctx, "diario_obra_mao_obra", "rdoMaoObra", input.id, input.companyId, `RDO Mão de Obra (importado) #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM diario_obra_mao_obra WHERE id = ${input.id}
        AND relatorio_id IN (SELECT id FROM diario_obra_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarAtividadeImportado: protectedProcedure
    .input(z.object({
      relatorioId: z.number(),
      companyId: z.number(),
      descricao: z.string(),
      item: z.string().optional(),
      etapa: z.string().optional(),
      percentualAvanco: z.number().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.relatorioId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO diario_obra_atividades (relatorio_id, descricao, item, etapa, percentual_avanco, observacao)
        VALUES (${input.relatorioId}, ${input.descricao}, ${input.item || null}, ${input.etapa || null}, ${input.percentualAvanco || 0}, ${input.observacao || null})
      `);
      return { ok: true };
    }),

  removerAtividadeImportado: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoChildObraAccess(ctx, "diario_obra_atividades", input.id, input.companyId);
      await snapshotRdoChild(ctx, "diario_obra_atividades", "rdoAtividade", input.id, input.companyId, `RDO Atividade (importada) #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM diario_obra_atividades WHERE id = ${input.id}
        AND relatorio_id IN (SELECT id FROM diario_obra_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarEquipamentoImportado: protectedProcedure
    .input(z.object({
      relatorioId: z.number(),
      companyId: z.number(),
      nome: z.string(),
      tipo: z.string().optional(),
      quantidade: z.number().default(1),
      situacao: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.relatorioId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO diario_obra_equipamentos (relatorio_id, nome, tipo, quantidade, situacao, observacao)
        VALUES (${input.relatorioId}, ${input.nome}, ${input.tipo || null}, ${input.quantidade}, ${input.situacao || 'operando'}, ${input.observacao || null})
      `);
      return { ok: true };
    }),

  removerEquipamentoImportado: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoChildObraAccess(ctx, "diario_obra_equipamentos", input.id, input.companyId);
      await snapshotRdoChild(ctx, "diario_obra_equipamentos", "rdoEquipamento", input.id, input.companyId, `RDO Equipamento (importado) #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM diario_obra_equipamentos WHERE id = ${input.id}
        AND relatorio_id IN (SELECT id FROM diario_obra_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarOcorrenciaImportado: protectedProcedure
    .input(z.object({
      relatorioId: z.number(),
      companyId: z.number(),
      descricao: z.string(),
      tipo: z.string().optional(),
      providencia: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.relatorioId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO diario_obra_ocorrencias (relatorio_id, descricao, tipo, providencia)
        VALUES (${input.relatorioId}, ${input.descricao}, ${input.tipo || null}, ${input.providencia || null})
      `);
      return { ok: true };
    }),

  removerOcorrenciaImportado: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoChildObraAccess(ctx, "diario_obra_ocorrencias", input.id, input.companyId);
      await snapshotRdoChild(ctx, "diario_obra_ocorrencias", "rdoOcorrencia", input.id, input.companyId, `RDO Ocorrência (importada) #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM diario_obra_ocorrencias WHERE id = ${input.id}
        AND relatorio_id IN (SELECT id FROM diario_obra_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarComentarioImportado: protectedProcedure
    .input(z.object({
      relatorioId: z.number(),
      companyId: z.number(),
      texto: z.string(),
      autor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.relatorioId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO diario_obra_comentarios (relatorio_id, texto, autor, data_hora)
        VALUES (${input.relatorioId}, ${input.texto}, ${input.autor || 'Usuário'}, NOW())
      `);
      return { ok: true };
    }),

  removerComentarioImportado: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoChildObraAccess(ctx, "diario_obra_comentarios", input.id, input.companyId);
      await snapshotRdoChild(ctx, "diario_obra_comentarios", "rdoComentario", input.id, input.companyId, `RDO Comentário (importado) #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM diario_obra_comentarios WHERE id = ${input.id}
        AND relatorio_id IN (SELECT id FROM diario_obra_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  adicionarMaterialImportado: protectedProcedure
    .input(z.object({
      relatorioId: z.number(),
      companyId: z.number(),
      tipo: z.string().default('recebido'),
      descricao: z.string(),
      quantidade: z.number().optional(),
      unidade: z.string().optional(),
      notaFiscal: z.string().optional(),
      fornecedor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoObraAccess(ctx, input.relatorioId, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO diario_obra_materiais (relatorio_id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor)
        VALUES (${input.relatorioId}, ${input.tipo}, ${input.descricao}, ${input.quantidade || 0}, ${input.unidade || null}, ${input.notaFiscal || null}, ${input.fornecedor || null})
      `);
      return { ok: true };
    }),

  removerMaterialImportado: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertRdoImportadoChildObraAccess(ctx, "diario_obra_materiais", input.id, input.companyId);
      await snapshotRdoChild(ctx, "diario_obra_materiais", "rdoMaterial", input.id, input.companyId, `RDO Material (importado) #${input.id}`);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM diario_obra_materiais WHERE id = ${input.id}
        AND relatorio_id IN (SELECT id FROM diario_obra_relatorios WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  listarNCs: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [
        sql`company_id = ${input.companyId}`,
        sql`obra_id = ${input.obraId}`,
      ];
      if (input.status) conditions.push(sql`status = ${input.status}`);
      const where = sql.join(conditions, sql` AND `);
      return rows(await db.execute(sql`SELECT * FROM nao_conformidades WHERE ${where} ORDER BY data_abertura DESC`));
    }),

  criarNC: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      origem: z.string(),
      origemId: z.number().optional(),
      descricao: z.string(),
      disciplina: z.string().optional(),
      local: z.string().optional(),
      gravidade: z.string().default("media"),
      responsavelNome: z.string().optional(),
      prazo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const countRows = rows(await db.execute(sql`SELECT COUNT(*) as total FROM nao_conformidades WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}`));
      const seq = parseInt(countRows[0]?.total || "0") + 1;
      const numeroNc = `NC-${String(seq).padStart(4, "0")}`;

      await db.execute(sql`
        INSERT INTO nao_conformidades (company_id, obra_id, numero_nc, origem, origem_id, data_abertura, descricao, disciplina, local, gravidade, responsavel_nome, prazo, status)
        VALUES (${input.companyId}, ${input.obraId}, ${numeroNc}, ${input.origem}, ${input.origemId || null}, CURRENT_DATE, ${input.descricao}, ${input.disciplina || null}, ${input.local || null}, ${input.gravidade}, ${input.responsavelNome || null}, ${input.prazo || null}, 'aberta')
      `);
      return { ok: true, numero: numeroNc };
    }),

  atualizarNC: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      planoAcao: z.string().optional(),
      prazo: z.string().optional(),
      responsavelNome: z.string().optional(),
      status: z.string().optional(),
      evidenciaFechamentoUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const sets: any[] = [];
      if (input.planoAcao !== undefined) sets.push(sql`plano_acao = ${input.planoAcao}`);
      if (input.prazo !== undefined) sets.push(sql`prazo = ${input.prazo}`);
      if (input.responsavelNome !== undefined) sets.push(sql`responsavel_nome = ${input.responsavelNome}`);
      if (input.status !== undefined) {
        sets.push(sql`status = ${input.status}`);
        if (input.status === "fechada") sets.push(sql`data_fechamento = CURRENT_DATE`);
      }
      if (input.evidenciaFechamentoUrl !== undefined) sets.push(sql`evidencia_fechamento_url = ${input.evidenciaFechamentoUrl}`);
      sets.push(sql`updated_at = NOW()`);

      const setClause = sql.join(sets, sql`, `);
      await db.execute(sql`UPDATE nao_conformidades SET ${setClause} WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  listarChecklists: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT cp.*, ct.nome as template_nome, ct.disciplina as template_disciplina
        FROM checklists_preenchidos cp
        LEFT JOIN checklists_templates ct ON cp.template_id = ct.id
        WHERE cp.company_id = ${input.companyId} AND cp.obra_id = ${input.obraId}
        ORDER BY cp.data DESC
      `));
    }),

  listarTemplatesChecklist: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT t.*, (SELECT COUNT(*) FROM checklists_template_itens WHERE template_id = t.id) as total_itens
        FROM checklists_templates t
        WHERE t.company_id = ${input.companyId} AND t.is_active = true
        ORDER BY t.nome
      `));
    }),

  criarTemplateChecklist: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string(),
      disciplina: z.string().optional(),
      descricao: z.string().optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        categoria: z.string().optional(),
        fotoObrigatoria: z.boolean().default(false),
        criticidade: z.string().default("normal"),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const tRows = rows(await db.execute(sql`
        INSERT INTO checklists_templates (company_id, nome, disciplina, descricao)
        VALUES (${input.companyId}, ${input.nome}, ${input.disciplina || null}, ${input.descricao || null})
        RETURNING id
      `));
      const templateId = tRows[0]?.id;
      for (let i = 0; i < input.itens.length; i++) {
        const item = input.itens[i];
        await db.execute(sql`
          INSERT INTO checklists_template_itens (template_id, ordem, descricao, categoria, foto_obrigatoria, criticidade)
          VALUES (${templateId}, ${i + 1}, ${item.descricao}, ${item.categoria || null}, ${item.fotoObrigatoria}, ${item.criticidade})
        `);
      }
      return { ok: true, id: templateId };
    }),

  criarChecklistPreenchido: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      templateId: z.number(),
      local: z.string().optional(),
      pavimento: z.string().optional(),
      responsavelNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const tmpl = rows(await db.execute(sql`SELECT id FROM checklists_templates WHERE id = ${input.templateId} AND company_id = ${input.companyId}`));
      if (!tmpl.length) throw new Error("Template não encontrado");

      const cRows = rows(await db.execute(sql`
        INSERT INTO checklists_preenchidos (company_id, obra_id, template_id, data, local, pavimento, responsavel_nome, status)
        VALUES (${input.companyId}, ${input.obraId}, ${input.templateId}, CURRENT_DATE, ${input.local || null}, ${input.pavimento || null}, ${input.responsavelNome || null}, 'em_andamento')
        RETURNING id
      `));
      const checklistId = cRows[0]?.id;

      const itens = rows(await db.execute(sql`
        SELECT * FROM checklists_template_itens WHERE template_id = ${input.templateId} ORDER BY ordem
      `));
      for (const item of itens) {
        await db.execute(sql`
          INSERT INTO checklists_respostas (checklist_id, item_id, descricao_item, resposta)
          VALUES (${checklistId}, ${item.id}, ${item.descricao}, 'na')
        `);
      }
      return { ok: true, id: checklistId };
    }),

  getChecklistRespostas: protectedProcedure
    .input(z.object({ checklistId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const cl = rows(await db.execute(sql`SELECT id FROM checklists_preenchidos WHERE id = ${input.checklistId} AND company_id = ${input.companyId}`));
      if (!cl.length) return [];

      return rows(await db.execute(sql`
        SELECT cr.*, cti.categoria, cti.foto_obrigatoria, cti.criticidade
        FROM checklists_respostas cr
        LEFT JOIN checklists_template_itens cti ON cr.item_id = cti.id
        WHERE cr.checklist_id = ${input.checklistId}
        ORDER BY cti.ordem
      `));
    }),

  responderChecklist: protectedProcedure
    .input(z.object({
      respostaId: z.number(),
      companyId: z.number(),
      resposta: z.string(),
      observacao: z.string().optional(),
      fotoUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE checklists_respostas SET resposta = ${input.resposta}, observacao = ${input.observacao || null}, foto_url = ${input.fotoUrl || null}
        WHERE id = ${input.respostaId}
        AND checklist_id IN (SELECT id FROM checklists_preenchidos WHERE company_id = ${input.companyId})
      `);
      return { ok: true };
    }),

  listarConcretagem: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertConcretagemAccess(ctx.user, input.companyId, input.obraId);
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT cm.*,
          (SELECT COALESCE(SUM(volume_entregue), 0) FROM concretagem_lancamentos WHERE mapa_id = cm.id) as volume_realizado,
          (SELECT COUNT(*) FROM concretagem_lancamentos WHERE mapa_id = cm.id) as total_lancamentos,
          (SELECT COUNT(*) FROM concretagem_trechos t WHERE t.mapa_id = cm.id AND t.deleted_at IS NULL) as total_trechos,
          (SELECT COUNT(*) FROM ensaios_tecnologicos e JOIN concretagem_lancamentos cl ON cl.id = e.lancamento_id WHERE cl.mapa_id = cm.id) as ensaios_total,
          (SELECT COUNT(*) FROM ensaios_tecnologicos e JOIN concretagem_lancamentos cl ON cl.id = e.lancamento_id WHERE cl.mapa_id = cm.id AND e.resultado = 'reprovado') as ensaios_reprovados,
          (SELECT COUNT(*) FROM ensaios_tecnologicos e JOIN concretagem_lancamentos cl ON cl.id = e.lancamento_id WHERE cl.mapa_id = cm.id AND e.resultado = 'aprovado') as ensaios_aprovados
        FROM concretagem_mapa cm
        WHERE cm.company_id = ${input.companyId} AND cm.obra_id = ${input.obraId}
        ORDER BY cm.pavimento, cm.elemento
      `));
    }),

  criarElementoConcretagem: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      pavimento: z.string().optional(),
      elemento: z.string(),
      tipoElemento: z.string().optional(),
      fck: z.number(),
      volumePrevisto: z.number(),
      dataPrevista: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertConcretagemAccess(ctx.user, input.companyId, input.obraId);
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO concretagem_mapa (company_id, obra_id, pavimento, elemento, tipo_elemento, fck, volume_previsto, data_prevista, status)
        VALUES (${input.companyId}, ${input.obraId}, ${input.pavimento || null}, ${input.elemento}, ${input.tipoElemento || null}, ${input.fck}, ${input.volumePrevisto}, ${input.dataPrevista || null}, 'pendente')
      `);
      return { ok: true };
    }),

  registrarLancamento: protectedProcedure
    .input(z.object({
      mapaId: z.number(),
      companyId: z.number(),
      obraId: z.number(),
      dataLancamento: z.string(),
      fornecedor: z.string().optional(),
      notaFiscal: z.string().optional(),
      fckNota: z.number().optional(),
      slumpPrevisto: z.number().optional(),
      slumpRealizado: z.number().optional(),
      volumeEntregue: z.number(),
      horaSaidaUsina: z.string().optional(),
      horaChegadaObra: z.string().optional(),
      horaInicioLancamento: z.string().optional(),
      horaFimLancamento: z.string().optional(),
      temperatura: z.number().optional(),
      observacoes: z.string().optional(),
      fiscalNoteId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const mapa = rows(await db.execute(sql`SELECT id, obra_id FROM concretagem_mapa WHERE id = ${input.mapaId} AND company_id = ${input.companyId}`));
      if (!mapa.length) throw new Error("Elemento não encontrado");
      // Obra SEMPRE derivada do elemento (nunca do input) + guard de acesso.
      const obraDoMapa = Number(mapa[0].obra_id);
      await assertConcretagemAccess(ctx.user, input.companyId, obraDoMapa);
      // Poka-yoke anti-IDOR: a NF-e vinculada precisa ser da MESMA empresa.
      if (input.fiscalNoteId) {
        const nf = rows(await db.execute(sql`SELECT id FROM fiscal_notes WHERE id = ${input.fiscalNoteId} AND company_id = ${input.companyId}`));
        if (!nf.length) throw new Error("Nota fiscal não encontrada");
      }

      let tempoMax: number | null = null;
      if (input.horaSaidaUsina && input.horaFimLancamento) {
        const [h1, m1] = input.horaSaidaUsina.split(":").map(Number);
        const [h2, m2] = input.horaFimLancamento.split(":").map(Number);
        tempoMax = (h2 * 60 + m2) - (h1 * 60 + m1);
      }

      const result = rows(await db.execute(sql`
        INSERT INTO concretagem_lancamentos (
          mapa_id, company_id, obra_id, data_lancamento, fornecedor, nota_fiscal,
          fck_nota, slump_previsto, slump_realizado, volume_entregue,
          hora_saida_usina, hora_chegada_obra, hora_inicio_lancamento, hora_fim_lancamento,
          tempo_maximo_minutos, temperatura, observacoes, fiscal_note_id, status
        ) VALUES (
          ${input.mapaId}, ${input.companyId}, ${obraDoMapa}, ${input.dataLancamento},
          ${input.fornecedor || null}, ${input.notaFiscal || null},
          ${input.fckNota || null}, ${input.slumpPrevisto || null}, ${input.slumpRealizado || null},
          ${input.volumeEntregue},
          ${input.horaSaidaUsina || null}, ${input.horaChegadaObra || null},
          ${input.horaInicioLancamento || null}, ${input.horaFimLancamento || null},
          ${tempoMax}, ${input.temperatura || null}, ${input.observacoes || null}, ${input.fiscalNoteId || null}, 'lancado'
        ) RETURNING id
      `));
      const lancamentoId = result[0]?.id;

      await db.execute(sql`UPDATE concretagem_mapa SET status = 'concretado', updated_at = NOW() WHERE id = ${input.mapaId} AND company_id = ${input.companyId}`);

      return { ok: true, id: lancamentoId, tempoMaximoMinutos: tempoMax };
    }),

  listarLancamentos: protectedProcedure
    .input(z.object({ mapaId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const mapa = rows(await db.execute(sql`SELECT obra_id FROM concretagem_mapa WHERE id = ${input.mapaId} AND company_id = ${input.companyId}`));
      if (!mapa.length) return [];
      await assertConcretagemAccess(ctx.user, input.companyId, Number(mapa[0].obra_id));
      return rows(await db.execute(sql`
        SELECT cl.*,
          (SELECT COUNT(*) FROM concretagem_cps WHERE lancamento_id = cl.id) as total_cps,
          (SELECT COUNT(*) FROM ensaios_tecnologicos e WHERE e.lancamento_id = cl.id) as ensaios_total,
          (SELECT COUNT(*) FROM ensaios_tecnologicos e WHERE e.lancamento_id = cl.id AND e.resultado = 'reprovado') as ensaios_reprovados,
          (SELECT COUNT(*) FROM ensaios_tecnologicos e WHERE e.lancamento_id = cl.id AND e.resultado = 'aprovado') as ensaios_aprovados
        FROM concretagem_lancamentos cl
        WHERE cl.mapa_id = ${input.mapaId}
        AND cl.mapa_id IN (SELECT id FROM concretagem_mapa WHERE company_id = ${input.companyId})
        ORDER BY cl.data_lancamento DESC
      `));
    }),

  registrarCP: protectedProcedure
    .input(z.object({
      lancamentoId: z.number(),
      companyId: z.number(),
      numeroCp: z.string(),
      dataMoldagem: z.string(),
      fckProjeto: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const lanc = rows(await db.execute(sql`SELECT id, obra_id FROM concretagem_lancamentos WHERE id = ${input.lancamentoId} AND company_id = ${input.companyId}`));
      if (!lanc.length) throw new Error("Lançamento não encontrado");
      await assertConcretagemAccess(ctx.user, input.companyId, Number(lanc[0].obra_id));

      const d = new Date(input.dataMoldagem);
      const d7 = new Date(d); d7.setDate(d7.getDate() + 7);
      const d14 = new Date(d); d14.setDate(d14.getDate() + 14);
      const d28 = new Date(d); d28.setDate(d28.getDate() + 28);
      await db.execute(sql`
        INSERT INTO concretagem_cps (lancamento_id, numero_cp, data_moldagem, data_ruptura_7d, data_ruptura_14d, data_ruptura_28d, fck_projeto)
        VALUES (${input.lancamentoId}, ${input.numeroCp}, ${input.dataMoldagem},
          ${d7.toISOString().split("T")[0]}, ${d14.toISOString().split("T")[0]}, ${d28.toISOString().split("T")[0]},
          ${input.fckProjeto})
      `);
      return { ok: true };
    }),

  // ===== Rev. 4865 — Mapa de Concretagem na planta + rastreio de ensaios =====
  // Nota de remessa é DIGITADA pelo usuário na obra (decisão do user 08/08/2026 —
  // sem picker SEFAZ; o número serve como referência para localizar o caminhão).

  // Trechos concretados desenhados na planta (geometria normalizada 0..1 sobre o
  // PDF da biblioteca da obra — mesmo padrão do Levantamento de Campo).
  listarTrechosConcretagem: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertConcretagemAccess(ctx.user, input.companyId, input.obraId);
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT t.*, cm.elemento, cm.pavimento, cm.fck
        FROM concretagem_trechos t
        JOIN concretagem_mapa cm ON cm.id = t.mapa_id
        WHERE t.company_id = ${input.companyId} AND t.obra_id = ${input.obraId} AND t.deleted_at IS NULL
        ORDER BY t.id
      `));
    }),

  salvarTrechoConcretagem: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      mapaId: z.number(),
      pavimentoId: z.number().optional(),
      pdfId: z.number(),
      pagina: z.number().default(1),
      geometriaJson: z.string().max(100_000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertConcretagemAccess(ctx.user, input.companyId, input.obraId);
      const mapa = rows(await db.execute(sql`
        SELECT id FROM concretagem_mapa WHERE id = ${input.mapaId} AND company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `));
      if (!mapa.length) throw new TRPCError({ code: "NOT_FOUND", message: "Elemento não encontrado" });
      // Anti-IDOR: o PDF precisa ser da MESMA empresa E de um pavimento DESTA obra
      // (mesma resolução do viewer: medicao_campo_pdfs.pavimento_id → obra_pavimentos).
      const pdf = rows(await db.execute(sql`
        SELECT p.id FROM medicao_campo_pdfs p
        JOIN medicao_campo c ON c.id = p.medicao_campo_id
        JOIN obra_pavimentos op ON op.id = p.pavimento_id
        WHERE p.id = ${input.pdfId} AND c.company_id = ${input.companyId}
          AND op.obra_id = ${input.obraId} AND op.company_id = ${input.companyId}
      `));
      if (!pdf.length) throw new TRPCError({ code: "NOT_FOUND", message: "Planta não encontrada nesta obra" });
      // Geometria: array de pontos {x,y} normalizados 0..1 (validação estrita).
      let pts: any[] = [];
      try { pts = JSON.parse(input.geometriaJson); } catch { /* inválido */ }
      if (!Array.isArray(pts) || pts.length < 3 || !pts.every((p) =>
        p && typeof p.x === "number" && typeof p.y === "number" &&
        p.x >= -0.05 && p.x <= 1.05 && p.y >= -0.05 && p.y <= 1.05)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Desenhe o trecho com pelo menos 3 pontos" });
      }
      const geometria = JSON.stringify(pts.map((p) => ({ x: p.x, y: p.y })));
      const res = rows(await db.execute(sql`
        INSERT INTO concretagem_trechos (company_id, obra_id, mapa_id, pavimento_id, pdf_id, pagina, geometria_json)
        VALUES (${input.companyId}, ${input.obraId}, ${input.mapaId}, ${input.pavimentoId || null}, ${input.pdfId}, ${input.pagina || 1}, ${geometria})
        RETURNING id
      `));
      return { ok: true, id: res[0]?.id };
    }),

  excluirTrechoConcretagem: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const own = rows(await db.execute(sql`SELECT obra_id FROM concretagem_trechos WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL`));
      if (!own.length) throw new TRPCError({ code: "NOT_FOUND", message: "Trecho não encontrado" });
      await assertConcretagemAccess(ctx.user, input.companyId, Number(own[0].obra_id));
      await db.execute(sql`UPDATE concretagem_trechos SET deleted_at = NOW() WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  // Caminhões (lançamentos) de uma obra, para o Ensaio vincular o corpo de prova
  // ao caminhão exato — rastreabilidade concreto ensaiado ↔ trecho da planta.
  listarLancamentosObra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertConcretagemAccess(ctx.user, input.companyId, input.obraId);
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT cl.id, cl.data_lancamento, cl.fornecedor, cl.nota_fiscal, cl.fck_nota,
               cl.volume_entregue, cl.slump_previsto, cm.elemento, cm.pavimento, cm.fck as fck_elemento
        FROM concretagem_lancamentos cl
        JOIN concretagem_mapa cm ON cm.id = cl.mapa_id
        WHERE cl.company_id = ${input.companyId} AND cl.obra_id = ${input.obraId}
        ORDER BY cl.data_lancamento DESC, cl.id DESC
        LIMIT 200
      `));
    }),

  listarFotos: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), data: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [
        sql`company_id = ${input.companyId}`,
        sql`obra_id = ${input.obraId}`,
      ];
      if (input.data) conditions.push(sql`data = ${input.data}`);
      const where = sql.join(conditions, sql` AND `);
      return rows(await db.execute(sql`SELECT * FROM registro_fotografico WHERE ${where} ORDER BY created_at DESC`));
    }),

  adicionarFoto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      fotoUrl: z.string(),
      legenda: z.string().optional(),
      disciplina: z.string().optional(),
      local: z.string().optional(),
      pavimento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, input.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
      }
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO registro_fotografico (company_id, obra_id, data, foto_url, legenda, disciplina, local, pavimento)
        VALUES (${input.companyId}, ${input.obraId}, CURRENT_DATE, ${input.fotoUrl}, ${input.legenda || null}, ${input.disciplina || null}, ${input.local || null}, ${input.pavimento || null})
      `);
      return { ok: true };
    }),

  dashboardOperacional: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rdoStats = rows(await db.execute(sql`
        SELECT
          COUNT(*) as total_rdos,
          COUNT(*) FILTER (WHERE status = 'finalizado') as finalizados,
          COUNT(*) FILTER (WHERE status = 'rascunho') as rascunhos,
          COUNT(*) FILTER (WHERE choveu = true) as dias_chuva
        FROM rdo_relatorios WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `))[0] || {};

      const ncStats = rows(await db.execute(sql`
        SELECT
          COUNT(*) as total_ncs,
          COUNT(*) FILTER (WHERE status = 'aberta') as abertas,
          COUNT(*) FILTER (WHERE status = 'fechada') as fechadas
        FROM nao_conformidades WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `))[0] || {};

      const concStats = rows(await db.execute(sql`
        SELECT
          COUNT(*) as total_elementos,
          COUNT(*) FILTER (WHERE status = 'concretado') as concretados,
          COUNT(*) FILTER (WHERE status = 'pendente') as pendentes,
          COALESCE(SUM(volume_previsto), 0) as volume_previsto_total
        FROM concretagem_mapa WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `))[0] || {};

      const checkStats = rows(await db.execute(sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'concluido') as concluidos
        FROM checklists_preenchidos WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `))[0] || {};

      const fotoStats = rows(await db.execute(sql`
        SELECT COUNT(*) as total FROM registro_fotografico WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `))[0] || {};

      const rdoHojeRows = rows(await db.execute(sql`
        SELECT id, status FROM rdo_relatorios
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId} AND data = CURRENT_DATE
      `));

      return {
        rdo: { ...rdoStats, hojeStatus: rdoHojeRows[0]?.status || "nao_criado", hojeId: rdoHojeRows[0]?.id },
        ncs: ncStats,
        concretagem: concStats,
        checklists: checkStats,
        fotos: fotoStats,
      };
    }),

  listarLiberacaoTemplates: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT t.*, (SELECT COUNT(*) FROM liberacao_servicos_template_itens WHERE template_id = t.id)::int as total_itens
        FROM liberacao_servicos_templates t
        WHERE t.company_id = ${input.companyId} AND t.is_active = true
        ORDER BY t.tipo_servico, t.nome
      `));
    }),

  getLiberacaoTemplateItens: protectedProcedure
    .input(z.object({ templateId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const t = rows(await db.execute(sql`SELECT id FROM liberacao_servicos_templates WHERE id = ${input.templateId} AND company_id = ${input.companyId}`));
      if (!t.length) return [];
      return rows(await db.execute(sql`SELECT * FROM liberacao_servicos_template_itens WHERE template_id = ${input.templateId} ORDER BY ordem`));
    }),

  listarLiberacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), tipoServico: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conds = [sql`ls.company_id = ${input.companyId}`, sql`ls.obra_id = ${input.obraId}`];
      if (input.tipoServico) conds.push(sql`ls.tipo_servico = ${input.tipoServico}`);
      if (input.status) conds.push(sql`ls.status = ${input.status}`);
      const where = sql.join(conds, sql` AND `);
      return rows(await db.execute(sql`
        SELECT ls.*,
          (SELECT COUNT(*) FROM liberacao_servicos_itens WHERE liberacao_id = ls.id)::int as total_itens,
          (SELECT COUNT(*) FROM liberacao_servicos_itens WHERE liberacao_id = ls.id AND resposta = 'conforme')::int as itens_ok,
          (SELECT COUNT(*) FROM liberacao_servicos_itens WHERE liberacao_id = ls.id AND resposta = 'nao_conforme')::int as itens_nc
        FROM liberacao_servicos ls
        WHERE ${where}
        ORDER BY ls.data_criacao DESC
      `));
    }),

  criarLiberacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      templateId: z.number(),
      local: z.string().optional(),
      pavimento: z.string().optional(),
      elemento: z.string().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userName = (ctx as any).user?.name || 'Sistema';
      const tmpl = rows(await db.execute(sql`SELECT * FROM liberacao_servicos_templates WHERE id = ${input.templateId} AND company_id = ${input.companyId}`));
      if (!tmpl.length) throw new Error("Template não encontrado");
      const t = tmpl[0];

      const lRows = rows(await db.execute(sql`
        INSERT INTO liberacao_servicos (company_id, obra_id, tipo_servico, local, pavimento, elemento, descricao, criado_por, status)
        VALUES (${input.companyId}, ${input.obraId}, ${t.tipo_servico}, ${input.local || null}, ${input.pavimento || null}, ${input.elemento || null}, ${input.descricao || null}, ${userName}, 'pendente')
        RETURNING id
      `));
      const libId = lRows[0]?.id;

      const itens = rows(await db.execute(sql`SELECT * FROM liberacao_servicos_template_itens WHERE template_id = ${input.templateId} ORDER BY ordem`));
      for (const item of itens) {
        await db.execute(sql`
          INSERT INTO liberacao_servicos_itens (liberacao_id, descricao, categoria, ordem, foto_obrigatoria, resposta)
          VALUES (${libId}, ${item.descricao}, ${item.categoria || null}, ${item.ordem}, ${item.foto_obrigatoria}, 'pendente')
        `);
      }
      return { ok: true, id: libId };
    }),

  getLiberacaoDetalhe: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const lib = rows(await db.execute(sql`SELECT * FROM liberacao_servicos WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (!lib.length) throw new Error("Liberação não encontrada");
      const itens = rows(await db.execute(sql`SELECT * FROM liberacao_servicos_itens WHERE liberacao_id = ${input.id} ORDER BY ordem`));
      return { ...lib[0], itens };
    }),

  responderLiberacaoItem: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      companyId: z.number(),
      liberacaoId: z.number(),
      resposta: z.string(),
      observacao: z.string().optional(),
      midiasUrls: z.array(z.object({ url: z.string(), tipo: z.string() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const lib = rows(await db.execute(sql`SELECT id FROM liberacao_servicos WHERE id = ${input.liberacaoId} AND company_id = ${input.companyId}`));
      if (!lib.length) throw new Error("Liberação não encontrada");
      const midiasJson = input.midiasUrls && input.midiasUrls.length > 0 ? JSON.stringify(input.midiasUrls) : '[]';
      await db.execute(sql`
        UPDATE liberacao_servicos_itens SET resposta = ${input.resposta}, observacao = ${input.observacao || null}, midias_urls = ${midiasJson}::jsonb
        WHERE id = ${input.itemId} AND liberacao_id = ${input.liberacaoId}
      `);
      return { ok: true };
    }),

  assinarLiberacao: protectedProcedure
    .input(z.object({
      liberacaoId: z.number(),
      companyId: z.number(),
      papel: z.enum(['fiscal', 'encarregado', 'engenheiro']),
      nome: z.string(),
      assinaturaUrl: z.string(),
      assinaturaBase64: z.string().optional(),
      employeeId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const lib = rows(await db.execute(sql`SELECT * FROM liberacao_servicos WHERE id = ${input.liberacaoId} AND company_id = ${input.companyId}`));
      if (!lib.length) throw new Error("Liberação não encontrada");

      if (input.papel === 'fiscal') {
        await db.execute(sql`UPDATE liberacao_servicos SET assinatura_fiscal_nome = ${input.nome}, assinatura_fiscal_url = ${input.assinaturaUrl}, assinatura_fiscal_data = NOW() WHERE id = ${input.liberacaoId}`);
      } else if (input.papel === 'encarregado') {
        await db.execute(sql`UPDATE liberacao_servicos SET assinatura_encarregado_nome = ${input.nome}, assinatura_encarregado_url = ${input.assinaturaUrl}, assinatura_encarregado_data = NOW() WHERE id = ${input.liberacaoId}`);
      } else {
        await db.execute(sql`UPDATE liberacao_servicos SET assinatura_engenheiro_nome = ${input.nome}, assinatura_engenheiro_url = ${input.assinaturaUrl}, assinatura_engenheiro_data = NOW() WHERE id = ${input.liberacaoId}`);
      }

      let verif = { primeiraAssinatura: false, assinaturaDivergente: false, similaridade: null as number | null };
      if (input.employeeId && input.assinaturaBase64) {
        verif = await verificarAssinaturaMemorial(db, input.employeeId, input.assinaturaBase64);
      }

      return { ok: true, ...verif };
    }),

  finalizarLiberacao: protectedProcedure
    .input(z.object({
      liberacaoId: z.number(),
      companyId: z.number(),
      status: z.enum(['liberado', 'reprovado']),
      motivoReprovacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (input.status === 'liberado') {
        await db.execute(sql`UPDATE liberacao_servicos SET status = 'liberado', data_liberacao = NOW() WHERE id = ${input.liberacaoId} AND company_id = ${input.companyId}`);
      } else {
        await db.execute(sql`UPDATE liberacao_servicos SET status = 'reprovado', data_reprovacao = NOW(), motivo_reprovacao = ${input.motivoReprovacao || null} WHERE id = ${input.liberacaoId} AND company_id = ${input.companyId}`);
      }
      return { ok: true };
    }),

  uploadLiberacaoMedia: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const { storagePut } = await import("../storage");
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
      if (!allowedMimes.includes(input.contentType)) throw new Error("Tipo não permitido");
      const buf = Buffer.from(input.base64, 'base64');
      const isVideo = input.contentType.startsWith('video');
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (buf.length > maxSize) throw new Error(isVideo ? "Vídeo muito grande (máx 50MB)" : "Foto muito grande (máx 10MB)");
      const ext = input.contentType.includes('png') ? 'png' : input.contentType.includes('webp') ? 'webp' : isVideo ? 'mp4' : 'jpg';
      const key = `liberacoes/${input.companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      return { url: url || `/api/files/${key}` };
    }),

  listarEnsaios: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      tipo: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      let query = sql`
        SELECT e.*, 
          (SELECT COUNT(*) FROM ensaios_corpos_prova cp WHERE cp.ensaio_id = e.id) as total_cps,
          (SELECT COUNT(*) FROM ensaios_corpos_prova cp WHERE cp.ensaio_id = e.id AND cp.status = 'rompido') as cps_rompidos,
          (SELECT AVG(cp.resistencia_mpa) FROM ensaios_corpos_prova cp WHERE cp.ensaio_id = e.id AND cp.resistencia_mpa IS NOT NULL) as media_resistencia
        FROM ensaios_tecnologicos e
        WHERE e.company_id = ${input.companyId}
      `;
      if (input.obraId) query = sql`${query} AND e.obra_id = ${input.obraId}`;
      if (input.tipo) query = sql`${query} AND e.tipo = ${input.tipo}`;
      if (input.status) query = sql`${query} AND e.status = ${input.status}`;
      query = sql`${query} ORDER BY e.data_coleta DESC, e.id DESC`;
      return rows(await db.execute(query));
    }),

  getEnsaio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ensaio = rows(await db.execute(sql`SELECT * FROM ensaios_tecnologicos WHERE id = ${input.id} AND company_id = ${input.companyId}`))[0];
      if (!ensaio) return null;
      const cps = rows(await db.execute(sql`SELECT * FROM ensaios_corpos_prova WHERE ensaio_id = ${input.id} ORDER BY idade_dias, numero_cp`));
      return { ...ensaio, corpos_prova: cps };
    }),

  criarEnsaio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      obraNome: z.string().optional(),
      tipo: z.string(),
      subtipo: z.string().optional(),
      numeroEnsaio: z.string().optional(),
      dataColeta: z.string(),
      dataRuptura: z.string().optional(),
      idadeDias: z.number().optional(),
      localColeta: z.string().optional(),
      elementoEstrutural: z.string().optional(),
      peca: z.string().optional(),
      fornecedorConcreto: z.string().optional(),
      notaFiscal: z.string().optional(),
      traco: z.string().optional(),
      fckProjeto: z.number().optional(),
      slumpPrevisto: z.number().optional(),
      slumpRealizado: z.number().optional(),
      temperatura: z.number().optional(),
      volumeM3: z.number().optional(),
      laboratorio: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
      corposProva: z.array(z.object({
        numeroCp: z.string(),
        idadeDias: z.number(),
        dataRuptura: z.string().optional(),
      })).optional(),
      lancamentoId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const userName = ctx.user?.name || ctx.user?.email || 'sistema';
      // Anti-IDOR: o caminhão vinculado precisa ser da MESMA empresa, o usuário
      // precisa de acesso à obra dele, e a obra do ensaio (se informada) deve bater.
      if (input.lancamentoId) {
        const lanc = rows(await db.execute(sql`SELECT id, obra_id FROM concretagem_lancamentos WHERE id = ${input.lancamentoId} AND company_id = ${input.companyId}`));
        if (!lanc.length) throw new Error("Caminhão (lançamento) não encontrado");
        await assertConcretagemAccess(ctx.user, input.companyId, Number(lanc[0].obra_id));
        if (input.obraId && Number(input.obraId) !== Number(lanc[0].obra_id)) {
          throw new Error("O caminhão selecionado é de outra obra");
        }
      }
      const numRes = rows(await db.execute(sql`SELECT COUNT(*) + 1 as num FROM ensaios_tecnologicos WHERE company_id = ${input.companyId}`));
      const autoNum = input.numeroEnsaio || `ENS-${String(numRes[0]?.num || 1).padStart(4, '0')}`;

      const res = rows(await db.execute(sql`
        INSERT INTO ensaios_tecnologicos (
          company_id, obra_id, obra_nome, tipo, subtipo, numero_ensaio,
          data_coleta, data_ruptura, idade_dias, local_coleta, elemento_estrutural,
          peca, fornecedor_concreto, nota_fiscal, traco, fck_projeto,
          slump_previsto, slump_realizado, temperatura, volume_m3,
          laboratorio, responsavel, observacoes, created_by, lancamento_id, status
        ) VALUES (
          ${input.companyId}, ${input.obraId || null}, ${input.obraNome || null},
          ${input.tipo}, ${input.subtipo || null}, ${autoNum},
          ${input.dataColeta}, ${input.dataRuptura || null}, ${input.idadeDias || null},
          ${input.localColeta || null}, ${input.elementoEstrutural || null},
          ${input.peca || null}, ${input.fornecedorConcreto || null},
          ${input.notaFiscal || null}, ${input.traco || null}, ${input.fckProjeto || null},
          ${input.slumpPrevisto || null}, ${input.slumpRealizado || null},
          ${input.temperatura || null}, ${input.volumeM3 || null},
          ${input.laboratorio || null}, ${input.responsavel || null},
          ${input.observacoes || null}, ${userName}, ${input.lancamentoId || null}, 'pendente'
        ) RETURNING *
      `));

      const ensaio = res[0];
      if (ensaio && input.corposProva?.length) {
        for (const cp of input.corposProva) {
          await db.execute(sql`
            INSERT INTO ensaios_corpos_prova (ensaio_id, numero_cp, idade_dias, data_ruptura, status)
            VALUES (${ensaio.id}, ${cp.numeroCp}, ${cp.idadeDias}, ${cp.dataRuptura || null}, 'pendente')
          `);
        }
      }
      return ensaio;
    }),

  atualizarEnsaio: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      obraId: z.number().optional(),
      obraNome: z.string().optional(),
      tipo: z.string().optional(),
      subtipo: z.string().optional(),
      dataColeta: z.string().optional(),
      dataRuptura: z.string().optional(),
      dataResultado: z.string().optional(),
      idadeDias: z.number().optional(),
      localColeta: z.string().optional(),
      elementoEstrutural: z.string().optional(),
      peca: z.string().optional(),
      fornecedorConcreto: z.string().optional(),
      notaFiscal: z.string().optional(),
      traco: z.string().optional(),
      fckProjeto: z.number().optional(),
      slumpPrevisto: z.number().optional(),
      slumpRealizado: z.number().optional(),
      temperatura: z.number().optional(),
      volumeM3: z.number().optional(),
      laboratorio: z.string().optional(),
      responsavel: z.string().optional(),
      status: z.string().optional(),
      resultado: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...fields } = input;
      const sets: any[] = [];
      if (fields.obraId !== undefined) sets.push(sql`obra_id = ${fields.obraId}`);
      if (fields.obraNome !== undefined) sets.push(sql`obra_nome = ${fields.obraNome}`);
      if (fields.tipo !== undefined) sets.push(sql`tipo = ${fields.tipo}`);
      if (fields.subtipo !== undefined) sets.push(sql`subtipo = ${fields.subtipo}`);
      if (fields.dataColeta !== undefined) sets.push(sql`data_coleta = ${fields.dataColeta}`);
      if (fields.dataRuptura !== undefined) sets.push(sql`data_ruptura = ${fields.dataRuptura}`);
      if (fields.dataResultado !== undefined) sets.push(sql`data_resultado = ${fields.dataResultado}`);
      if (fields.idadeDias !== undefined) sets.push(sql`idade_dias = ${fields.idadeDias}`);
      if (fields.localColeta !== undefined) sets.push(sql`local_coleta = ${fields.localColeta}`);
      if (fields.elementoEstrutural !== undefined) sets.push(sql`elemento_estrutural = ${fields.elementoEstrutural}`);
      if (fields.peca !== undefined) sets.push(sql`peca = ${fields.peca}`);
      if (fields.fornecedorConcreto !== undefined) sets.push(sql`fornecedor_concreto = ${fields.fornecedorConcreto}`);
      if (fields.notaFiscal !== undefined) sets.push(sql`nota_fiscal = ${fields.notaFiscal}`);
      if (fields.traco !== undefined) sets.push(sql`traco = ${fields.traco}`);
      if (fields.fckProjeto !== undefined) sets.push(sql`fck_projeto = ${fields.fckProjeto}`);
      if (fields.slumpPrevisto !== undefined) sets.push(sql`slump_previsto = ${fields.slumpPrevisto}`);
      if (fields.slumpRealizado !== undefined) sets.push(sql`slump_realizado = ${fields.slumpRealizado}`);
      if (fields.temperatura !== undefined) sets.push(sql`temperatura = ${fields.temperatura}`);
      if (fields.volumeM3 !== undefined) sets.push(sql`volume_m3 = ${fields.volumeM3}`);
      if (fields.laboratorio !== undefined) sets.push(sql`laboratorio = ${fields.laboratorio}`);
      if (fields.responsavel !== undefined) sets.push(sql`responsavel = ${fields.responsavel}`);
      if (fields.status !== undefined) sets.push(sql`status = ${fields.status}`);
      if (fields.resultado !== undefined) sets.push(sql`resultado = ${fields.resultado}`);
      if (fields.observacoes !== undefined) sets.push(sql`observacoes = ${fields.observacoes}`);
      sets.push(sql`updated_at = NOW()`);
      if (sets.length === 1) return { success: true };
      const setCombined = sets.reduce((a, b) => sql`${a}, ${b}`);
      await db.execute(sql`UPDATE ensaios_tecnologicos SET ${setCombined} WHERE id = ${id} AND company_id = ${input.companyId}`);
      return { success: true };
    }),

  deletarEnsaio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`DELETE FROM ensaios_tecnologicos WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { success: true };
    }),

  adicionarCorpoProva: protectedProcedure
    .input(z.object({
      ensaioId: z.number(),
      companyId: z.number(),
      numeroCp: z.string(),
      idadeDias: z.number(),
      dataRuptura: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const owner = rows(await db.execute(sql`SELECT id FROM ensaios_tecnologicos WHERE id = ${input.ensaioId} AND company_id = ${input.companyId}`))[0];
      if (!owner) throw new Error("Ensaio não encontrado");
      const res = rows(await db.execute(sql`
        INSERT INTO ensaios_corpos_prova (ensaio_id, numero_cp, idade_dias, data_ruptura, status)
        VALUES (${input.ensaioId}, ${input.numeroCp}, ${input.idadeDias}, ${input.dataRuptura || null}, 'pendente')
        RETURNING *
      `));
      return res[0];
    }),

  registrarRuptura: protectedProcedure
    .input(z.object({
      cpId: z.number(),
      companyId: z.number(),
      resistenciaMpa: z.number(),
      tipoRuptura: z.string().optional(),
      massaKg: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const cpOwner = rows(await db.execute(sql`
        SELECT cp.id FROM ensaios_corpos_prova cp
        JOIN ensaios_tecnologicos e ON e.id = cp.ensaio_id
        WHERE cp.id = ${input.cpId} AND e.company_id = ${input.companyId}
      `))[0];
      if (!cpOwner) throw new Error("Corpo de prova não encontrado");
      await db.execute(sql`
        UPDATE ensaios_corpos_prova SET
          resistencia_mpa = ${input.resistenciaMpa},
          tipo_ruptura = ${input.tipoRuptura || null},
          massa_kg = ${input.massaKg || null},
          observacoes = ${input.observacoes || null},
          data_ruptura = COALESCE(data_ruptura, CURRENT_DATE),
          status = 'rompido'
        WHERE id = ${input.cpId}
      `);
      const cp = rows(await db.execute(sql`SELECT ensaio_id FROM ensaios_corpos_prova WHERE id = ${input.cpId}`))[0];
      if (cp) {
        const allCps = rows(await db.execute(sql`SELECT status FROM ensaios_corpos_prova WHERE ensaio_id = ${cp.ensaio_id}`));
        const allRompidos = allCps.every((c: any) => c.status === 'rompido');
        const rompidos = rows(await db.execute(sql`SELECT resistencia_mpa FROM ensaios_corpos_prova WHERE ensaio_id = ${cp.ensaio_id} AND resistencia_mpa IS NOT NULL`));
        const media = rompidos.length > 0 ? rompidos.reduce((s: number, r: any) => s + parseFloat(r.resistencia_mpa), 0) / rompidos.length : null;
        const ensaio = rows(await db.execute(sql`SELECT fck_projeto FROM ensaios_tecnologicos WHERE id = ${cp.ensaio_id}`))[0];
        const fck = ensaio?.fck_projeto ? parseFloat(ensaio.fck_projeto) : null;
        let resultado = null;
        if (media !== null && fck !== null) {
          resultado = media >= fck ? 'aprovado' : 'reprovado';
        }
        if (allRompidos) {
          await db.execute(sql`UPDATE ensaios_tecnologicos SET status = 'concluido', resultado = ${resultado}, data_resultado = CURRENT_DATE, updated_at = NOW() WHERE id = ${cp.ensaio_id}`);
        } else if (resultado) {
          await db.execute(sql`UPDATE ensaios_tecnologicos SET resultado = ${resultado}, updated_at = NOW() WHERE id = ${cp.ensaio_id}`);
        }
      }
      return { success: true };
    }),

  deletarCorpoProva: protectedProcedure
    .input(z.object({ cpId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const cpOwner = rows(await db.execute(sql`
        SELECT cp.id FROM ensaios_corpos_prova cp
        JOIN ensaios_tecnologicos e ON e.id = cp.ensaio_id
        WHERE cp.id = ${input.cpId} AND e.company_id = ${input.companyId}
      `))[0];
      if (!cpOwner) throw new Error("Corpo de prova não encontrado");
      await db.execute(sql`DELETE FROM ensaios_corpos_prova WHERE id = ${input.cpId}`);
      return { success: true };
    }),

  dashboardEnsaios: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const totais = rows(await db.execute(sql`
        SELECT status, COUNT(*) as count FROM ensaios_tecnologicos WHERE company_id = ${input.companyId} GROUP BY status
      `));
      const resultados = rows(await db.execute(sql`
        SELECT resultado, COUNT(*) as count FROM ensaios_tecnologicos WHERE company_id = ${input.companyId} AND resultado IS NOT NULL GROUP BY resultado
      `));
      const porTipo = rows(await db.execute(sql`
        SELECT tipo, COUNT(*) as count FROM ensaios_tecnologicos WHERE company_id = ${input.companyId} GROUP BY tipo ORDER BY count DESC
      `));
      const porObra = rows(await db.execute(sql`
        SELECT obra_nome, COUNT(*) as count,
          COUNT(*) FILTER (WHERE resultado = 'aprovado') as aprovados,
          COUNT(*) FILTER (WHERE resultado = 'reprovado') as reprovados
        FROM ensaios_tecnologicos WHERE company_id = ${input.companyId} AND obra_nome IS NOT NULL
        GROUP BY obra_nome ORDER BY count DESC
      `));
      const recentes = rows(await db.execute(sql`
        SELECT e.id, e.numero_ensaio, e.tipo, e.obra_nome, e.data_coleta, e.status, e.resultado, e.fck_projeto,
          (SELECT AVG(cp.resistencia_mpa) FROM ensaios_corpos_prova cp WHERE cp.ensaio_id = e.id AND cp.resistencia_mpa IS NOT NULL) as media_resistencia
        FROM ensaios_tecnologicos e WHERE e.company_id = ${input.companyId}
        ORDER BY e.created_at DESC LIMIT 10
      `));
      return { totais, resultados, porTipo, porObra, recentes };
    }),
});

async function autoPreencherRDO(db: any, rdoId: number, companyId: number, obraId: number) {
  try {
    const equips = rows(await db.execute(sql`
      SELECT nome, tipo_equipamento as tipo FROM equipment
      WHERE company_id = ${companyId} AND status_equipamento = 'Ativo'
      AND (obra_id = ${obraId} OR obra_id IS NULL)
      LIMIT 50
    `));
    for (const eq of equips) {
      await db.execute(sql`
        INSERT INTO rdo_equipamentos (rdo_id, nome, tipo, situacao) VALUES (${rdoId}, ${eq.nome}, ${eq.tipo || null}, 'operando')
      `);
    }
  } catch {}

  try {
    const funcs = rows(await db.execute(sql`
      SELECT funcao, COUNT(*) as qtd FROM employees
      WHERE company_id = ${companyId} AND status = 'Ativo'
      AND (obra_id = ${obraId} OR obra_id IS NULL)
      GROUP BY funcao ORDER BY funcao
    `));
    for (const f of funcs) {
      await db.execute(sql`
        INSERT INTO rdo_mao_obra (rdo_id, tipo, funcao, quantidade, presente)
        VALUES (${rdoId}, 'proprio', ${f.funcao || 'Geral'}, ${parseInt(f.qtd) || 0}, true)
      `);
    }
  } catch {}
}
