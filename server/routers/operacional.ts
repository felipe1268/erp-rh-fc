import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

function rows(result: any): any[] {
  return (result as any).rows ?? result ?? [];
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
        SELECT id, numero, data, status FROM diario_obra_relatorios
        WHERE obra_id = ${input.obraId} ORDER BY data DESC LIMIT 7
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (input.fonte === 'importado') {
        const conditions = [
          sql`company_id = ${input.companyId}`,
          sql`obra_id = ${input.obraId}`,
        ];
        if (input.mes) conditions.push(sql`TO_CHAR(data, 'YYYY-MM') = ${input.mes}`);
        const where = sql.join(conditions, sql` AND `);
        const result = rows(await db.execute(sql`
          SELECT id, obra_id, company_id, external_id, numero, data, status, responsavel_nome,
                 clima_manha, clima_tarde, clima_noite, hora_inicio, hora_fim, horas_trabalhadas,
                 observacoes, importado_em, created_at, updated_at, 'importado' as fonte
          FROM diario_obra_relatorios WHERE ${where} ORDER BY data DESC, numero DESC
        `));
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
    .query(async ({ input }) => {
      const db = await getDb();
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
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = await getDb();
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
    .mutation(async ({ input }) => {
      const db = await getDb();
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const ownership = rows(await db.execute(sql`SELECT id FROM rdo_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`));
      if (ownership.length === 0) throw new Error("RDO não encontrado ou sem permissão");
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
    .mutation(async ({ input }) => {
      const db = await getDb();
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rdo = rows(await db.execute(sql`SELECT id FROM rdo_relatorios WHERE id = ${input.rdoId} AND company_id = ${input.companyId}`));
      if (!rdo.length) throw new Error("RDO não encontrado");
      await db.execute(sql`
        INSERT INTO rdo_mao_obra (rdo_id, tipo, empresa_nome, funcao, quantidade, presente)
        VALUES (${input.rdoId}, ${input.tipo}, ${input.empresaNome || null}, ${input.funcao}, ${input.quantidade}, ${input.presente})
      `);
      return { ok: true };
    }),

  removerMaoObra: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rdo = rows(await db.execute(sql`SELECT id FROM rdo_relatorios WHERE id = ${input.rdoId} AND company_id = ${input.companyId}`));
      if (!rdo.length) throw new Error("RDO não encontrado");
      await db.execute(sql`
        INSERT INTO rdo_atividades (rdo_id, descricao, local, percentual_avanco, status)
        VALUES (${input.rdoId}, ${input.descricao}, ${input.local || null}, ${input.percentualAvanco || 0}, ${input.status})
      `);
      return { ok: true };
    }),

  removerAtividade: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rdo = rows(await db.execute(sql`SELECT id FROM rdo_relatorios WHERE id = ${input.rdoId} AND company_id = ${input.companyId}`));
      if (!rdo.length) throw new Error("RDO não encontrado");
      await db.execute(sql`
        INSERT INTO rdo_equipamentos (rdo_id, nome, tipo, situacao, horas_uso)
        VALUES (${input.rdoId}, ${input.nome}, ${input.tipo || null}, ${input.situacao}, ${input.horasUso || 0})
      `);
      return { ok: true };
    }),

  removerEquipamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rdo = rows(await db.execute(sql`SELECT id FROM rdo_relatorios WHERE id = ${input.rdoId} AND company_id = ${input.companyId}`));
      if (!rdo.length) throw new Error("RDO não encontrado");
      await db.execute(sql`
        INSERT INTO rdo_materiais (rdo_id, tipo, descricao, quantidade, unidade, fornecedor, nota_fiscal)
        VALUES (${input.rdoId}, ${input.tipo}, ${input.descricao}, ${input.quantidade || 0}, ${input.unidade || null}, ${input.fornecedor || null}, ${input.notaFiscal || null})
      `);
      return { ok: true };
    }),

  removerMaterial: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rdo = rows(await db.execute(sql`SELECT id FROM rdo_relatorios WHERE id = ${input.rdoId} AND company_id = ${input.companyId}`));
      if (!rdo.length) throw new Error("RDO não encontrado");
      await db.execute(sql`
        INSERT INTO rdo_fotos (rdo_id, foto_url, legenda, disciplina, local)
        VALUES (${input.rdoId}, ${input.fotoUrl}, ${input.legenda || null}, ${input.disciplina || null}, ${input.local || null})
      `);
      return { ok: true };
    }),

  removerFotoRDO: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM rdo_fotos WHERE id = ${input.id}
        AND rdo_id IN (SELECT id FROM rdo_relatorios WHERE company_id = ${input.companyId})
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
    .query(async ({ input }) => {
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT cm.*,
          (SELECT COALESCE(SUM(volume_entregue), 0) FROM concretagem_lancamentos WHERE mapa_id = cm.id) as volume_realizado
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
    .mutation(async ({ input }) => {
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
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const mapa = rows(await db.execute(sql`SELECT id FROM concretagem_mapa WHERE id = ${input.mapaId} AND company_id = ${input.companyId}`));
      if (!mapa.length) throw new Error("Elemento não encontrado");

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
          tempo_maximo_minutos, temperatura, observacoes, status
        ) VALUES (
          ${input.mapaId}, ${input.companyId}, ${input.obraId}, ${input.dataLancamento},
          ${input.fornecedor || null}, ${input.notaFiscal || null},
          ${input.fckNota || null}, ${input.slumpPrevisto || null}, ${input.slumpRealizado || null},
          ${input.volumeEntregue},
          ${input.horaSaidaUsina || null}, ${input.horaChegadaObra || null},
          ${input.horaInicioLancamento || null}, ${input.horaFimLancamento || null},
          ${tempoMax}, ${input.temperatura || null}, ${input.observacoes || null}, 'lancado'
        ) RETURNING id
      `));
      const lancamentoId = result[0]?.id;

      await db.execute(sql`UPDATE concretagem_mapa SET status = 'concretado', updated_at = NOW() WHERE id = ${input.mapaId} AND company_id = ${input.companyId}`);

      return { ok: true, id: lancamentoId, tempoMaximoMinutos: tempoMax };
    }),

  listarLancamentos: protectedProcedure
    .input(z.object({ mapaId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT cl.*, (SELECT COUNT(*) FROM concretagem_cps WHERE lancamento_id = cl.id) as total_cps
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      const lanc = rows(await db.execute(sql`SELECT id FROM concretagem_lancamentos WHERE id = ${input.lancamentoId} AND company_id = ${input.companyId}`));
      if (!lanc.length) throw new Error("Lançamento não encontrado");

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
    .mutation(async ({ input }) => {
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
      return { ok: true };
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
