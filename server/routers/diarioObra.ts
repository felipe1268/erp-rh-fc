import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function rows(result: any): any[] {
  return (result as any).rows ?? result ?? [];
}

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

async function validateRelatorioOwnership(db: any, relatorioId: number, companyId: number): Promise<void> {
  const r = rows(await db.execute(sql`
    SELECT r.id FROM diario_obra_relatorios r
    JOIN diario_obra_obras o ON o.id = r.obra_id
    WHERE r.id = ${relatorioId} AND o.company_id = ${companyId}
  `));
  if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado ou sem permissão' });
}

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (
      u.hostname.endsWith('diariodeobra.app') ||
      u.hostname.endsWith('amazonaws.com') ||
      u.hostname.endsWith('cloudfront.net') ||
      u.hostname.endsWith('blob.core.windows.net') ||
      u.hostname.endsWith('azureedge.net')
    );
  } catch { return false; }
}

async function safeFetch(url: string, timeoutMs = 30000): Promise<Buffer | null> {
  if (!isAllowedUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const arrBuf = await resp.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    if (buf.length > MAX_UPLOAD_SIZE) return null;
    return buf;
  } catch { return null; }
}

async function validateObraOwnership(db: any, obraId: number, companyId: number): Promise<void> {
  const r = rows(await db.execute(sql`
    SELECT id FROM diario_obra_obras WHERE id = ${obraId} AND company_id = ${companyId}
  `));
  if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Obra não encontrada ou sem permissão' });
}

export const diarioObraRouter = router({

  listarObras: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [sql`company_id = ${input.companyId}`];
      if (input.status && input.status !== 'todas') {
        conditions.push(sql`status = ${input.status}`);
      }
      if (input.busca) {
        conditions.push(sql`(LOWER(nome) LIKE ${'%' + input.busca.toLowerCase() + '%'} OR LOWER(cliente) LIKE ${'%' + input.busca.toLowerCase() + '%'})`);
      }
      const where = sql.join(conditions, sql` AND `);
      return rows(await db.execute(sql`
        SELECT id, company_id, external_id, nome, endereco, cidade, estado, cliente, contrato, responsavel,
               status, data_inicio, data_previsao_fim, data_fim, prazo_contratual, area_total, observacoes,
               total_relatorios, total_fotos, importado_em, atualizado_em, created_at
        FROM diario_obra_obras WHERE ${where} ORDER BY nome
      `));
    }),

  getObra: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT * FROM diario_obra_obras WHERE id = ${input.id} AND company_id = ${input.companyId}
      `));
      if (!r[0]) return null;
      const obra = r[0];
      if (obra.logo_data) {
        obra.logo_base64 = Buffer.from(obra.logo_data).toString('base64');
        delete obra.logo_data;
      }
      return obra;
    }),

  criarObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      endereco: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      cliente: z.string().optional(),
      contrato: z.string().optional(),
      responsavel: z.string().optional(),
      status: z.string().optional(),
      dataInicio: z.string().optional(),
      dataPrevisaoFim: z.string().optional(),
      prazoContratual: z.number().optional(),
      areaTotal: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_obras (company_id, nome, endereco, cidade, estado, cep, cliente, contrato, responsavel, status, data_inicio, data_previsao_fim, prazo_contratual, area_total, observacoes)
        VALUES (${input.companyId}, ${input.nome}, ${input.endereco || null}, ${input.cidade || null}, ${input.estado || null}, ${input.cep || null}, ${input.cliente || null}, ${input.contrato || null}, ${input.responsavel || null}, ${input.status || 'em_andamento'}, ${input.dataInicio || null}, ${input.dataPrevisaoFim || null}, ${input.prazoContratual || null}, ${input.areaTotal || null}, ${input.observacoes || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  atualizarObra: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().optional(),
      endereco: z.string().optional(),
      cidade: z.string().optional(),
      estado: z.string().optional(),
      cep: z.string().optional(),
      cliente: z.string().optional(),
      contrato: z.string().optional(),
      responsavel: z.string().optional(),
      status: z.string().optional(),
      dataInicio: z.string().optional(),
      dataPrevisaoFim: z.string().optional(),
      dataFim: z.string().optional(),
      prazoContratual: z.number().optional(),
      areaTotal: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE diario_obra_obras SET
          nome = COALESCE(${input.nome || null}, nome),
          endereco = COALESCE(${input.endereco || null}, endereco),
          cidade = COALESCE(${input.cidade || null}, cidade),
          estado = COALESCE(${input.estado || null}, estado),
          cep = COALESCE(${input.cep || null}, cep),
          cliente = COALESCE(${input.cliente || null}, cliente),
          contrato = COALESCE(${input.contrato || null}, contrato),
          responsavel = COALESCE(${input.responsavel || null}, responsavel),
          status = COALESCE(${input.status || null}, status),
          data_inicio = COALESCE(${input.dataInicio || null}, data_inicio),
          data_previsao_fim = COALESCE(${input.dataPrevisaoFim || null}, data_previsao_fim),
          data_fim = COALESCE(${input.dataFim || null}, data_fim),
          prazo_contratual = COALESCE(${input.prazoContratual || null}, prazo_contratual),
          area_total = COALESCE(${input.areaTotal || null}, area_total),
          observacoes = COALESCE(${input.observacoes || null}, observacoes),
          atualizado_em = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { success: true };
    }),

  deletarObra: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`DELETE FROM diario_obra_obras WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { success: true };
    }),

  listarRelatorios: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), mes: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [
        sql`company_id = ${input.companyId}`,
        sql`obra_id = ${input.obraId}`,
      ];
      if (input.mes) {
        conditions.push(sql`TO_CHAR(data, 'YYYY-MM') = ${input.mes}`);
      }
      if (input.status) {
        conditions.push(sql`status = ${input.status}`);
      }
      const where = sql.join(conditions, sql` AND `);
      return rows(await db.execute(sql`
        SELECT id, obra_id, company_id, external_id, numero, data, status, responsavel_nome,
               clima_manha, clima_tarde, clima_noite, hora_inicio, hora_fim, horas_trabalhadas,
               observacoes, importado_em, created_at, updated_at
        FROM diario_obra_relatorios WHERE ${where} ORDER BY data DESC, numero DESC
      `));
    }),

  getRelatorio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT id, obra_id, company_id, external_id, numero, data, status, responsavel_nome, responsavel_id,
               clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
               indice_pluviometrico, hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim,
               horas_trabalhadas, observacoes, visitantes, dds_realizado, dds_tema, pdf_url, dados_json,
               importado_em, created_at, updated_at
        FROM diario_obra_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}
      `));
      if (!r[0]) return null;
      const rel = r[0];

      const [maoObra, equipamentos, atividades, ocorrencias, materiais, comentarios] = await Promise.all([
        db.execute(sql`SELECT id, nome, funcao, categoria, empresa, tipo, presente, hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim, horas_trabalhadas, registro, observacao FROM diario_obra_mao_obra WHERE relatorio_id = ${input.id} ORDER BY tipo, nome`),
        db.execute(sql`SELECT id, nome, tipo, quantidade, hora_inicio, hora_fim, horas_trabalhadas, operativo, situacao, observacao FROM diario_obra_equipamentos WHERE relatorio_id = ${input.id} ORDER BY nome`),
        db.execute(sql`SELECT id, item, descricao, local, etapa, status, percentual_avanco, observacao, unidade, quantidade_prevista, quantidade_realizada, quantidade_acumulada FROM diario_obra_atividades WHERE relatorio_id = ${input.id} ORDER BY item, id`),
        db.execute(sql`SELECT id, descricao, tipo, providencia FROM diario_obra_ocorrencias WHERE relatorio_id = ${input.id} ORDER BY id`),
        db.execute(sql`SELECT id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor FROM diario_obra_materiais WHERE relatorio_id = ${input.id} ORDER BY tipo, id`),
        db.execute(sql`SELECT id, texto, autor, data_hora FROM diario_obra_comentarios WHERE relatorio_id = ${input.id} ORDER BY data_hora`),
      ]);

      const fotosRaw = rows(await db.execute(sql`SELECT id, descricao, mime_type, tamanho_bytes, created_at FROM diario_obra_fotos WHERE relatorio_id = ${input.id} ORDER BY id`));
      const videosRaw = rows(await db.execute(sql`SELECT id, descricao, mime_type, duracao, tamanho_bytes, created_at FROM diario_obra_videos WHERE relatorio_id = ${input.id} ORDER BY id`));

      return {
        ...rel,
        maoObra: rows(maoObra),
        equipamentos: rows(equipamentos),
        atividades: rows(atividades),
        ocorrencias: rows(ocorrencias),
        materiais: rows(materiais),
        comentarios: rows(comentarios),
        fotos: fotosRaw,
        videos: videosRaw,
      };
    }),

  getFotoData: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT f.foto_data, f.mime_type FROM diario_obra_fotos f
        JOIN diario_obra_relatorios r ON r.id = f.relatorio_id
        WHERE f.id = ${input.id} AND r.company_id = ${input.companyId}
      `));
      if (!r[0] || !r[0].foto_data) return null;
      return {
        base64: Buffer.from(r[0].foto_data).toString('base64'),
        mimeType: r[0].mime_type || 'image/jpeg',
      };
    }),

  getThumbnailData: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT f.thumbnail_data, f.mime_type FROM diario_obra_fotos f
        JOIN diario_obra_relatorios r ON r.id = f.relatorio_id
        WHERE f.id = ${input.id} AND r.company_id = ${input.companyId}
      `));
      if (!r[0] || !r[0].thumbnail_data) return null;
      return {
        base64: Buffer.from(r[0].thumbnail_data).toString('base64'),
        mimeType: r[0].mime_type || 'image/jpeg',
      };
    }),

  getVideoData: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT v.video_data, v.mime_type FROM diario_obra_videos v
        JOIN diario_obra_relatorios r ON r.id = v.relatorio_id
        WHERE v.id = ${input.id} AND r.company_id = ${input.companyId}
      `));
      if (!r[0] || !r[0].video_data) return null;
      return {
        base64: Buffer.from(r[0].video_data).toString('base64'),
        mimeType: r[0].mime_type || 'video/mp4',
      };
    }),

  getPdfData: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT pdf_data FROM diario_obra_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}
      `));
      if (!r[0] || !r[0].pdf_data) return null;
      return { base64: Buffer.from(r[0].pdf_data).toString('base64') };
    }),

  criarRelatorio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      data: z.string(),
      responsavelNome: z.string().optional(),
      responsavelId: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateObraOwnership(db, input.obraId, input.companyId);

      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_relatorios (company_id, obra_id, data, numero, status, responsavel_nome, responsavel_id, observacoes)
        VALUES (${input.companyId}, ${input.obraId}, ${input.data},
          (SELECT COALESCE(MAX(numero), 0) + 1 FROM diario_obra_relatorios WHERE obra_id = ${input.obraId}),
          'rascunho', ${input.responsavelNome || null}, ${input.responsavelId || null}, ${input.observacoes || null})
        RETURNING id, numero
      `));
      return { id: r[0].id, numero: r[0].numero };
    }),

  atualizarRelatorio: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      data: z.string().optional(),
      responsavelNome: z.string().optional(),
      responsavelId: z.number().optional(),
      climaManha: z.string().optional(),
      climaTarde: z.string().optional(),
      climaNoite: z.string().optional(),
      condicaoManha: z.string().optional(),
      condicaoTarde: z.string().optional(),
      condicaoNoite: z.string().optional(),
      indicePluviometrico: z.number().optional(),
      horaInicio: z.string().optional(),
      horaFim: z.string().optional(),
      horaIntervaloInicio: z.string().optional(),
      horaIntervaloFim: z.string().optional(),
      horasTrabalhadas: z.number().optional(),
      observacoes: z.string().optional(),
      visitantes: z.string().optional(),
      ddsRealizado: z.boolean().optional(),
      ddsTema: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE diario_obra_relatorios SET
          data = COALESCE(${input.data || null}, data),
          responsavel_nome = COALESCE(${input.responsavelNome || null}, responsavel_nome),
          responsavel_id = COALESCE(${input.responsavelId || null}, responsavel_id),
          clima_manha = COALESCE(${input.climaManha || null}, clima_manha),
          clima_tarde = COALESCE(${input.climaTarde || null}, clima_tarde),
          clima_noite = COALESCE(${input.climaNoite || null}, clima_noite),
          condicao_manha = COALESCE(${input.condicaoManha || null}, condicao_manha),
          condicao_tarde = COALESCE(${input.condicaoTarde || null}, condicao_tarde),
          condicao_noite = COALESCE(${input.condicaoNoite || null}, condicao_noite),
          indice_pluviometrico = COALESCE(${input.indicePluviometrico || null}, indice_pluviometrico),
          hora_inicio = COALESCE(${input.horaInicio || null}, hora_inicio),
          hora_fim = COALESCE(${input.horaFim || null}, hora_fim),
          hora_intervalo_inicio = COALESCE(${input.horaIntervaloInicio || null}, hora_intervalo_inicio),
          hora_intervalo_fim = COALESCE(${input.horaIntervaloFim || null}, hora_intervalo_fim),
          horas_trabalhadas = COALESCE(${input.horasTrabalhadas || null}, horas_trabalhadas),
          observacoes = COALESCE(${input.observacoes || null}, observacoes),
          visitantes = COALESCE(${input.visitantes || null}, visitantes),
          dds_realizado = COALESCE(${input.ddsRealizado ?? null}, dds_realizado),
          dds_tema = COALESCE(${input.ddsTema || null}, dds_tema),
          updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { success: true };
    }),

  finalizarRelatorio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE diario_obra_relatorios SET status = 'finalizado', updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND status = 'rascunho'
      `);
      return { success: true };
    }),

  reabrirRelatorio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE diario_obra_relatorios SET status = 'rascunho', updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND status = 'finalizado'
      `);
      return { success: true };
    }),

  deletarRelatorio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`DELETE FROM diario_obra_relatorios WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { success: true };
    }),

  addMaoObra: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      nome: z.string().optional(), funcao: z.string().optional(), categoria: z.string().optional(),
      empresa: z.string().optional(), tipo: z.string().optional(), presente: z.boolean().optional(),
      horaInicio: z.string().optional(), horaFim: z.string().optional(),
      horaIntervaloInicio: z.string().optional(), horaIntervaloFim: z.string().optional(),
      horasTrabalhadas: z.number().optional(), registro: z.string().optional(), observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_mao_obra (relatorio_id, nome, funcao, categoria, empresa, tipo, presente, hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim, horas_trabalhadas, registro, observacao)
        VALUES (${input.relatorioId}, ${input.nome || null}, ${input.funcao || null}, ${input.categoria || null}, ${input.empresa || null}, ${input.tipo || 'proprio'}, ${input.presente ?? true}, ${input.horaInicio || null}, ${input.horaFim || null}, ${input.horaIntervaloInicio || null}, ${input.horaIntervaloFim || null}, ${input.horasTrabalhadas || null}, ${input.registro || null}, ${input.observacao || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerMaoObra: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_mao_obra WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
      return { success: true };
    }),

  addEquipamento: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      nome: z.string().optional(), tipo: z.string().optional(), quantidade: z.number().optional(),
      horaInicio: z.string().optional(), horaFim: z.string().optional(),
      horasTrabalhadas: z.number().optional(), operativo: z.boolean().optional(),
      situacao: z.string().optional(), observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_equipamentos (relatorio_id, nome, tipo, quantidade, hora_inicio, hora_fim, horas_trabalhadas, operativo, situacao, observacao)
        VALUES (${input.relatorioId}, ${input.nome || null}, ${input.tipo || null}, ${input.quantidade || 1}, ${input.horaInicio || null}, ${input.horaFim || null}, ${input.horasTrabalhadas || null}, ${input.operativo ?? true}, ${input.situacao || null}, ${input.observacao || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerEquipamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_equipamentos WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
      return { success: true };
    }),

  addAtividade: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      item: z.string().optional(), descricao: z.string().optional(), local: z.string().optional(),
      etapa: z.string().optional(), status: z.string().optional(), percentualAvanco: z.number().optional(),
      observacao: z.string().optional(), unidade: z.string().optional(),
      quantidadePrevista: z.number().optional(), quantidadeRealizada: z.number().optional(),
      quantidadeAcumulada: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_atividades (relatorio_id, item, descricao, local, etapa, status, percentual_avanco, observacao, unidade, quantidade_prevista, quantidade_realizada, quantidade_acumulada)
        VALUES (${input.relatorioId}, ${input.item || null}, ${input.descricao || null}, ${input.local || null}, ${input.etapa || null}, ${input.status || null}, ${input.percentualAvanco || null}, ${input.observacao || null}, ${input.unidade || null}, ${input.quantidadePrevista || null}, ${input.quantidadeRealizada || null}, ${input.quantidadeAcumulada || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerAtividade: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_atividades WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
      return { success: true };
    }),

  addOcorrencia: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      descricao: z.string(), tipo: z.string().optional(), providencia: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_ocorrencias (relatorio_id, descricao, tipo, providencia)
        VALUES (${input.relatorioId}, ${input.descricao}, ${input.tipo || null}, ${input.providencia || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerOcorrencia: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_ocorrencias WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
      return { success: true };
    }),

  addMaterial: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      tipo: z.string().optional(), descricao: z.string().optional(), quantidade: z.number().optional(),
      unidade: z.string().optional(), notaFiscal: z.string().optional(), fornecedor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_materiais (relatorio_id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor)
        VALUES (${input.relatorioId}, ${input.tipo || 'recebido'}, ${input.descricao || null}, ${input.quantidade || null}, ${input.unidade || null}, ${input.notaFiscal || null}, ${input.fornecedor || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerMaterial: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_materiais WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
      return { success: true };
    }),

  addComentario: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      texto: z.string(), autor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_comentarios (relatorio_id, texto, autor)
        VALUES (${input.relatorioId}, ${input.texto}, ${input.autor || null})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerComentario: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_comentarios WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado' });
      return { success: true };
    }),

  addFoto: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      descricao: z.string().optional(),
      base64: z.string().max(70_000_000),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const buf = Buffer.from(input.base64, 'base64');
      if (buf.length > MAX_UPLOAD_SIZE) throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Arquivo muito grande (máx 50MB)' });
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_fotos (relatorio_id, descricao, foto_data, mime_type, tamanho_bytes)
        VALUES (${input.relatorioId}, ${input.descricao || null}, ${buf}, ${input.mimeType || 'image/jpeg'}, ${buf.length})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerFoto: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_fotos WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Foto não encontrada' });
      return { success: true };
    }),

  addVideo: protectedProcedure
    .input(z.object({
      relatorioId: z.number(), companyId: z.number(),
      descricao: z.string().optional(),
      base64: z.string().max(70_000_000),
      mimeType: z.enum(['video/mp4', 'video/webm', 'video/quicktime']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await validateRelatorioOwnership(db, input.relatorioId, input.companyId);
      const buf = Buffer.from(input.base64, 'base64');
      if (buf.length > MAX_UPLOAD_SIZE) throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Arquivo muito grande (máx 50MB)' });
      const r = rows(await db.execute(sql`
        INSERT INTO diario_obra_videos (relatorio_id, descricao, video_data, mime_type, tamanho_bytes)
        VALUES (${input.relatorioId}, ${input.descricao || null}, ${buf}, ${input.mimeType || 'video/mp4'}, ${buf.length})
        RETURNING id
      `));
      return { id: r[0].id };
    }),

  removerVideo: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        DELETE FROM diario_obra_videos WHERE id = ${input.id}
        AND relatorio_id IN (SELECT r.id FROM diario_obra_relatorios r JOIN diario_obra_obras o ON o.id = r.obra_id WHERE o.company_id = ${input.companyId})
        RETURNING id
      `));
      if (!r[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vídeo não encontrado' });
      return { success: true };
    }),

  statsObras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'em_andamento') as em_andamento,
          COUNT(*) FILTER (WHERE status = 'concluida') as concluida,
          COUNT(*) FILTER (WHERE status = 'paralisada') as paralisada,
          COUNT(*) as total,
          COALESCE(SUM(total_relatorios), 0) as total_relatorios,
          COALESCE(SUM(total_fotos), 0) as total_fotos
        FROM diario_obra_obras WHERE company_id = ${input.companyId}
      `));
      return r[0] || { em_andamento: 0, concluida: 0, paralisada: 0, total: 0, total_relatorios: 0, total_fotos: 0 };
    }),

  importarObras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const token = process.env.DIARIO_OBRA_API_TOKEN;
      if (!token) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Token do Diário de Obra não configurado' });

      const resp = await fetch('https://api.diariodeobra.app/v2/obras', {
        headers: { 'token': token, 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro API: ${resp.status}` });
      const obras = await resp.json();
      const db = await getDb();

      let importadas = 0;
      let ignoradas = 0;

      for (const obra of (obras as any[])) {
        const extId = obra._id;
        if (!extId) continue;

        const existing = rows(await db.execute(sql`
          SELECT id FROM diario_obra_obras WHERE company_id = ${input.companyId} AND external_id = ${extId}
        `));
        if (existing.length > 0) { ignoradas++; continue; }

        const statusMap: Record<number, string> = { 1: 'em_andamento', 2: 'paralisada', 3: 'em_andamento', 4: 'concluida' };
        const statusVal = statusMap[obra.status?.id] || 'em_andamento';

        await db.execute(sql`
          INSERT INTO diario_obra_obras (company_id, external_id, nome, status, dados_json)
          VALUES (
            ${input.companyId}, ${extId}, ${obra.nome || 'Sem nome'},
            ${statusVal}, ${JSON.stringify(obra)}
          )
        `);
        importadas++;
      }
      return { importadas, ignoradas, total: (obras as any[]).length };
    }),

  importarRelatoriosObra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), comMidia: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const token = process.env.DIARIO_OBRA_API_TOKEN;
      if (!token) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Token do Diário de Obra não configurado' });
      const db = await getDb();

      const obraRows = rows(await db.execute(sql`
        SELECT external_id FROM diario_obra_obras WHERE id = ${input.obraId} AND company_id = ${input.companyId}
      `));
      if (!obraRows[0]?.external_id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Obra não encontrada ou sem external_id' });
      const externalObraId = obraRows[0].external_id;

      const resp = await fetch(`https://api.diariodeobra.app/v2/obras/${externalObraId}/relatorios`, {
        headers: { 'token': token },
      });
      if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro API relatórios: ${resp.status}` });
      const relatorios = await resp.json();

      let importados = 0;
      let ignorados = 0;
      let fotosImportadas = 0;
      let videosImportados = 0;

      function parseDate(dateStr: string | null | undefined): string | null {
        if (!dateStr) return null;
        const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return dateStr;
      }

      for (const rel of (relatorios as any[])) {
        const relExtId = rel._id;
        if (!relExtId) continue;

        const existing = rows(await db.execute(sql`
          SELECT id FROM diario_obra_relatorios WHERE obra_id = ${input.obraId} AND external_id = ${relExtId}
        `));
        if (existing.length > 0) { ignorados++; continue; }

        let detResp;
        try {
          detResp = await fetch(`https://api.diariodeobra.app/v2/obras/${externalObraId}/relatorios/${relExtId}`, {
            headers: { 'token': token },
          });
        } catch { ignorados++; continue; }
        if (!detResp.ok) { ignorados++; continue; }
        const det = await detResp.json() as any;

        const statusMap: Record<number, string> = { 1: 'rascunho', 2: 'finalizado', 3: 'aprovado', 4: 'pendente' };
        const statusVal = statusMap[det.status?.id] || 'rascunho';
        const hor = det.horarioDeTrabalho || {};

        const relRows = rows(await db.execute(sql`
          INSERT INTO diario_obra_relatorios (
            company_id, obra_id, external_id, numero, data, status, responsavel_nome,
            clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
            indice_pluviometrico, hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim,
            horas_trabalhadas, pdf_url, dados_json, importado_em
          ) VALUES (
            ${input.companyId}, ${input.obraId}, ${relExtId}, ${det.numero || rel.numero || null},
            ${parseDate(det.data || rel.data) || new Date().toISOString().split('T')[0]},
            ${statusVal},
            ${det.criadoPor?.usuario?.nome || null},
            ${det.clima?.manha?.clima || null},
            ${det.clima?.tarde?.clima || null},
            ${det.clima?.noite?.clima || null},
            ${det.clima?.manha?.condicao || null},
            ${det.clima?.tarde?.condicao || null},
            ${det.clima?.noite?.condicao || null},
            ${det.clima?.indicePluviometrico || null},
            ${hor.expedienteInicio || null},
            ${hor.expedienteFim || null},
            ${hor.intervaloInicio || null},
            ${hor.intervaloFim || null},
            ${hor.horasTrabalhadas || null},
            ${det.linkPdf || null},
            ${JSON.stringify(det)}, NOW()
          ) RETURNING id
        `));
        const newRelId = relRows[0].id;

        const maoObraOpcao = det.maoDeObra?.opcaoSelecionada || 'personalizada';
        const maoObraList = det.maoDeObra?.[maoObraOpcao] || det.maoDeObra?.personalizada || det.maoDeObra?.padrao || [];
        for (const mo of maoObraList) {
          await db.execute(sql`
            INSERT INTO diario_obra_mao_obra (relatorio_id, nome, funcao, categoria, empresa, tipo, presente, hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim, horas_trabalhadas, registro, observacao, dados_json)
            VALUES (${newRelId}, ${mo.nome || null}, ${mo.funcao || null}, ${mo.categoria?.descricao || null}, ${mo.empresa || null}, ${maoObraOpcao === 'padrao' ? 'proprio' : 'proprio'}, ${mo.presenca ?? true}, ${mo.horaInicio || null}, ${mo.horaFim || null}, ${null}, ${null}, ${mo.horasTrabalhadas || null}, ${mo.registro || null}, ${null}, ${JSON.stringify(mo)})
          `);
        }

        const equipList = det.equipamentos || [];
        for (const eq of equipList) {
          await db.execute(sql`
            INSERT INTO diario_obra_equipamentos (relatorio_id, nome, tipo, quantidade, hora_inicio, hora_fim, horas_trabalhadas, operativo, situacao, observacao, dados_json)
            VALUES (${newRelId}, ${eq.descricao || eq.nome || null}, ${eq.tipo || null}, ${eq.quantidade || 1}, ${eq.horaInicio || null}, ${eq.horaFim || null}, ${eq.horasTrabalhadas || null}, ${eq.operativo ?? true}, ${eq.situacao || null}, ${eq.observacao || null}, ${JSON.stringify(eq)})
          `);
        }

        const atividadeList = det.atividades || [];
        for (const at of atividadeList) {
          const cp = at.controleDeProducao || {};
          await db.execute(sql`
            INSERT INTO diario_obra_atividades (relatorio_id, item, descricao, local, etapa, status, percentual_avanco, observacao, unidade, quantidade_prevista, quantidade_realizada, quantidade_acumulada, dados_json)
            VALUES (${newRelId}, ${at.item || null}, ${at.descricao || null}, ${null}, ${at.etapa?.descricao || null}, ${null}, ${at.porcentagem || null}, ${at.observacao || null}, ${cp.unidade || null}, ${cp.quantidade || null}, ${cp.realizado || null}, ${cp.acumulado || null}, ${JSON.stringify(at)})
          `);
        }

        const ocorrList = det.ocorrencias || [];
        for (const oc of ocorrList) {
          await db.execute(sql`
            INSERT INTO diario_obra_ocorrencias (relatorio_id, descricao, tipo, providencia, dados_json)
            VALUES (${newRelId}, ${oc.descricao || ''}, ${oc.tipo || null}, ${oc.providencia || null}, ${JSON.stringify(oc)})
          `);
        }

        const matRecebido = det.controleDeMaterial?.recebido || [];
        for (const m of matRecebido) {
          await db.execute(sql`
            INSERT INTO diario_obra_materiais (relatorio_id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor, dados_json)
            VALUES (${newRelId}, ${'recebido'}, ${m.descricao || null}, ${m.quantidade || null}, ${m.unidade || null}, ${m.notaFiscal || null}, ${m.fornecedor || null}, ${JSON.stringify(m)})
          `);
        }
        const matUtilizado = det.controleDeMaterial?.utilizado || [];
        for (const m of matUtilizado) {
          await db.execute(sql`
            INSERT INTO diario_obra_materiais (relatorio_id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor, dados_json)
            VALUES (${newRelId}, ${'utilizado'}, ${m.descricao || null}, ${m.quantidade || null}, ${m.unidade || null}, ${m.notaFiscal || null}, ${m.fornecedor || null}, ${JSON.stringify(m)})
          `);
        }

        const comentList = det.comentarios || [];
        for (const c of comentList) {
          await db.execute(sql`
            INSERT INTO diario_obra_comentarios (relatorio_id, texto, autor, data_hora, dados_json)
            VALUES (${newRelId}, ${c.texto || c.descricao || ''}, ${c.usuario?.nome || c.autor || null}, ${c.dataHora || c.created || null}, ${JSON.stringify(c)})
          `);
        }

        if (input.comMidia !== false) {
          const fotoList = det.galeriaDeFotos || [];
          for (const f of fotoList) {
            const fotoUrl = f.url;
            let fotoData = null;
            let thumbData = null;
            let tamanho = f.tamanho || 0;

            if (fotoUrl) {
              fotoData = await safeFetch(fotoUrl);
              if (fotoData) tamanho = fotoData.length;
            }

            const thumbUrl = f.urlMiniatura;
            if (thumbUrl) {
              thumbData = await safeFetch(thumbUrl);
            }

            const ext = (f.arquivo || '').split('.').pop()?.toLowerCase() || 'jpeg';
            const mimeMap: Record<string, string> = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

            await db.execute(sql`
              INSERT INTO diario_obra_fotos (relatorio_id, external_id, descricao, url_original, foto_data, thumbnail_data, mime_type, tamanho_bytes, dados_json)
              VALUES (${newRelId}, ${f._id || null}, ${f.descricao || null}, ${fotoUrl || null}, ${fotoData}, ${thumbData}, ${mimeMap[ext] || 'image/jpeg'}, ${tamanho}, ${JSON.stringify(f)})
            `);
            if (fotoData) fotosImportadas++;
          }

          const videoList = det.videos || [];
          for (const v of videoList) {
            const videoUrl = v.url;
            let videoData = null;
            let thumbData = null;
            let tamanho = v.tamanho || 0;

            if (videoUrl) {
              videoData = await safeFetch(videoUrl, 120000);
              if (videoData) tamanho = videoData.length;
            }

            const thumbUrl = v.urlMiniatura;
            if (thumbUrl) {
              thumbData = await safeFetch(thumbUrl);
            }

            await db.execute(sql`
              INSERT INTO diario_obra_videos (relatorio_id, external_id, descricao, url_original, video_data, thumbnail_data, mime_type, duracao, tamanho_bytes, dados_json)
              VALUES (${newRelId}, ${v._id || null}, ${v.descricao || null}, ${videoUrl || null}, ${videoData}, ${thumbData}, ${v.mimeType || 'video/mp4'}, ${v.duracao || null}, ${tamanho}, ${JSON.stringify(v)})
            `);
            if (videoData) videosImportados++;
          }
        }

        importados++;
      }

      await db.execute(sql`
        UPDATE diario_obra_obras SET
          total_relatorios = (SELECT COUNT(*) FROM diario_obra_relatorios WHERE obra_id = ${input.obraId}),
          total_fotos = (SELECT COUNT(*) FROM diario_obra_fotos f JOIN diario_obra_relatorios r ON r.id = f.relatorio_id WHERE r.obra_id = ${input.obraId}),
          atualizado_em = NOW()
        WHERE id = ${input.obraId}
      `);

      return { importados, ignorados, total: (relatorios as any[]).length, fotosImportadas, videosImportados };
    }),
});
