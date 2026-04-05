const { Pool } = require('../node_modules/pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

const token = process.env.DIARIO_OBRA_API_TOKEN;
const COMPANY_ID = 60002;
const SKIP_MEDIA = process.argv.includes('--skip-media');
const ONLY_OBRA_ID = process.argv.find(a => a.startsWith('--obra='))?.split('=')[1];
const START_FROM = parseInt(process.argv.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5');

async function safeFetch(url, timeoutMs) {
  try {
    const u = new URL(url);
    const allowed = ['diariodeobra.app','amazonaws.com','cloudfront.net','blob.core.windows.net','azureedge.net'];
    if (u.protocol !== 'https:' || !allowed.some(d => u.hostname.endsWith(d))) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 50 * 1024 * 1024) return null;
    return buf;
  } catch { return null; }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return dateStr;
}

function nullIfEmpty(v) { return (v === '' || v === undefined) ? null : v; }
function safeTime(v) {
  if (!v || v === '') return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return v;
  return null;
}
function safeNumeric(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function processOneRelatorio(obraId, externalObraId, relExtId, relNumero) {
  const ex = await pool.query('SELECT id FROM diario_obra_relatorios WHERE obra_id = $1 AND external_id = $2', [obraId, relExtId]);
  if (ex.rows.length > 0) return { status: 'skip' };

  let det;
  try {
    let retries = 3;
    while (retries > 0) {
      const detResp = await fetch(`https://api.diariodeobra.app/v2/obras/${externalObraId}/relatorios/${relExtId}`, {
        headers: { 'token': token },
      });
      if (detResp.status === 429) {
        await delay(5000);
        retries--;
        continue;
      }
      if (!detResp.ok) return { status: 'error', msg: `API ${detResp.status}` };
      det = await detResp.json();
      break;
    }
    if (!det) return { status: 'error', msg: 'rate limited' };
  } catch (e) { return { status: 'error', msg: e.message }; }

  const statusMap = { 1: 'rascunho', 2: 'finalizado', 3: 'aprovado', 4: 'pendente' };
  const hor = det.horarioDeTrabalho || {};

  try {
    const relResult = await pool.query(
      `INSERT INTO diario_obra_relatorios (company_id, obra_id, external_id, numero, data, status, responsavel_nome,
       clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
       hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim, horas_trabalhadas,
       pdf_url, dados_json, importado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()) RETURNING id`,
      [COMPANY_ID, obraId, relExtId, det.numero, parseDate(det.data),
       statusMap[det.status?.id] || 'rascunho',
       det.criadoPor?.usuario?.nome || null,
       nullIfEmpty(det.clima?.manha?.clima), nullIfEmpty(det.clima?.tarde?.clima), nullIfEmpty(det.clima?.noite?.clima),
       nullIfEmpty(det.clima?.manha?.condicao), nullIfEmpty(det.clima?.tarde?.condicao), nullIfEmpty(det.clima?.noite?.condicao),
       safeTime(hor.expedienteInicio), safeTime(hor.expedienteFim), safeTime(hor.intervaloInicio), safeTime(hor.intervaloFim),
       nullIfEmpty(hor.horasTrabalhadas), det.linkPdf || null, JSON.stringify(det)]
    );
    const newRelId = relResult.rows[0].id;

    const maoObraOpcao = det.maoDeObra?.opcaoSelecionada || 'personalizada';
    const moList = det.maoDeObra?.[maoObraOpcao] || [];
    for (const mo of moList) {
      await pool.query(
        `INSERT INTO diario_obra_mao_obra (relatorio_id, nome, funcao, categoria, presente, hora_inicio, hora_fim, horas_trabalhadas, dados_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [newRelId, mo.nome, mo.funcao, mo.categoria?.descricao, mo.presenca ?? true, safeTime(mo.horaInicio), safeTime(mo.horaFim), nullIfEmpty(mo.horasTrabalhadas), JSON.stringify(mo)]
      );
    }

    for (const eq of (det.equipamentos || [])) {
      await pool.query(
        `INSERT INTO diario_obra_equipamentos (relatorio_id, nome, tipo, quantidade, hora_inicio, hora_fim, horas_trabalhadas, operativo, situacao, observacao, dados_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [newRelId, eq.descricao||eq.nome, eq.tipo, safeNumeric(eq.quantidade)||1, safeTime(eq.horaInicio), safeTime(eq.horaFim), nullIfEmpty(eq.horasTrabalhadas), eq.operativo??true, nullIfEmpty(eq.situacao), nullIfEmpty(eq.observacao), JSON.stringify(eq)]
      );
    }

    for (const at of (det.atividades || [])) {
      const cp = at.controleDeProducao || {};
      await pool.query(
        `INSERT INTO diario_obra_atividades (relatorio_id, item, descricao, etapa, percentual_avanco, observacao, unidade, quantidade_prevista, quantidade_realizada, quantidade_acumulada, dados_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [newRelId, nullIfEmpty(at.item), at.descricao, at.etapa?.descricao, safeNumeric(at.porcentagem), nullIfEmpty(at.observacao), nullIfEmpty(cp.unidade), safeNumeric(cp.quantidade), safeNumeric(cp.realizado), safeNumeric(cp.acumulado), JSON.stringify(at)]
      );
    }

    for (const oc of (det.ocorrencias || [])) {
      await pool.query(
        `INSERT INTO diario_obra_ocorrencias (relatorio_id, descricao, tipo, providencia, dados_json) VALUES ($1,$2,$3,$4,$5)`,
        [newRelId, oc.descricao||'', nullIfEmpty(oc.tipo), nullIfEmpty(oc.providencia), JSON.stringify(oc)]
      );
    }

    for (const m of (det.controleDeMaterial?.recebido || [])) {
      await pool.query(
        `INSERT INTO diario_obra_materiais (relatorio_id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor, dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newRelId, 'recebido', m.descricao, safeNumeric(m.quantidade), nullIfEmpty(m.unidade), nullIfEmpty(m.notaFiscal), nullIfEmpty(m.fornecedor), JSON.stringify(m)]
      );
    }
    for (const m of (det.controleDeMaterial?.utilizado || [])) {
      await pool.query(
        `INSERT INTO diario_obra_materiais (relatorio_id, tipo, descricao, quantidade, unidade, nota_fiscal, fornecedor, dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newRelId, 'utilizado', m.descricao, safeNumeric(m.quantidade), nullIfEmpty(m.unidade), nullIfEmpty(m.notaFiscal), nullIfEmpty(m.fornecedor), JSON.stringify(m)]
      );
    }

    for (const c of (det.comentarios || [])) {
      let dataHora = c.dataHora || c.created || null;
      if (dataHora) {
        const dm = dataHora.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/);
        if (dm) dataHora = `${dm[3]}-${dm[2]}-${dm[1]} ${dm[4]}`;
      }
      await pool.query(
        `INSERT INTO diario_obra_comentarios (relatorio_id, texto, autor, data_hora, dados_json) VALUES ($1,$2,$3,$4,$5)`,
        [newRelId, c.texto||c.descricao||'', c.usuario?.nome||c.autor, dataHora, JSON.stringify(c)]
      );
    }

    let fotosOk = 0, videosOk = 0;

    if (!SKIP_MEDIA) {
      for (const f of (det.galeriaDeFotos || [])) {
        let fotoData = null, thumbData = null, tamanho = f.tamanho || 0;
        if (f.url) { fotoData = await safeFetch(f.url); if (fotoData) { tamanho = fotoData.length; fotosOk++; } }
        if (f.urlMiniatura) { thumbData = await safeFetch(f.urlMiniatura); }
        const ext = (f.arquivo||'').split('.').pop()?.toLowerCase()||'jpeg';
        const mm = { jpeg:'image/jpeg', jpg:'image/jpeg', png:'image/png' };
        await pool.query(
          `INSERT INTO diario_obra_fotos (relatorio_id, external_id, descricao, url_original, foto_data, thumbnail_data, mime_type, tamanho_bytes, dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [newRelId, f._id, f.descricao, f.url, fotoData, thumbData, mm[ext]||'image/jpeg', tamanho, JSON.stringify(f)]
        );
      }

      for (const v of (det.videos || [])) {
        let videoData = null, thumbData = null, tamanho = v.tamanho || 0;
        if (v.url) { videoData = await safeFetch(v.url, 120000); if (videoData) { tamanho = videoData.length; videosOk++; } }
        if (v.urlMiniatura) { thumbData = await safeFetch(v.urlMiniatura); }
        await pool.query(
          `INSERT INTO diario_obra_videos (relatorio_id, external_id, descricao, url_original, video_data, thumbnail_data, mime_type, duracao, tamanho_bytes, dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [newRelId, v._id, v.descricao, v.url, videoData, thumbData, v.mimeType||'video/mp4', v.duracao, tamanho, JSON.stringify(v)]
        );
      }
    }

    return { status: 'ok', fotos: fotosOk, videos: videosOk };
  } catch (e) {
    return { status: 'error', msg: e.message };
  }
}

async function runBatch(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchAllRelatorios(externalId) {
  const allRels = [];
  let page = 1;
  while (true) {
    const resp = await fetch(`https://api.diariodeobra.app/v2/obras/${externalId}/relatorios?pagina=${page}`, {
      headers: { 'token': token },
    });
    if (resp.status === 429) {
      await delay(5000);
      continue;
    }
    if (!resp.ok) break;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allRels.push(...data);
    if (data.length < 30) break;
    page++;
    if (page % 10 === 0) await delay(500);
  }
  return allRels;
}

async function importRelatoriosObra(obraId, externalId, obraNome) {
  const rels = await fetchAllRelatorios(externalId);
  if (rels.length === 0) { return { importados: 0, erros: 0, fotos: 0, videos: 0, totalApi: 0 }; }

  const tasks = rels.map(rel => () => processOneRelatorio(obraId, externalId, rel._id, rel.numero));
  const results = await runBatch(tasks, CONCURRENCY);

  let importados = 0, erros = 0, fotos = 0, videos = 0;
  for (const r of results) {
    if (r.status === 'ok') { importados++; fotos += r.fotos || 0; videos += r.videos || 0; }
    else if (r.status === 'error') { erros++; }
  }

  await pool.query(
    `UPDATE diario_obra_obras SET
     total_fotos = (SELECT COUNT(*) FROM diario_obra_fotos f JOIN diario_obra_relatorios r ON r.id = f.relatorio_id WHERE r.obra_id = $1),
     atualizado_em = NOW()
     WHERE id = $1`,
    [obraId]
  );

  return { importados, erros, fotos, videos, totalApi: rels.length };
}

async function main() {
  if (!token) { console.error('DIARIO_OBRA_API_TOKEN não configurado'); process.exit(1); }

  let obrasQuery;
  if (ONLY_OBRA_ID) {
    obrasQuery = await pool.query('SELECT id, external_id, nome, total_relatorios FROM diario_obra_obras WHERE id = $1 AND company_id = $2', [ONLY_OBRA_ID, COMPANY_ID]);
  } else {
    obrasQuery = await pool.query('SELECT id, external_id, nome, total_relatorios FROM diario_obra_obras WHERE company_id = $1 AND external_id IS NOT NULL ORDER BY total_relatorios ASC', [COMPANY_ID]);
  }

  const obras = obrasQuery.rows;
  console.log(`=== IMPORTAÇÃO DIÁRIO DE OBRA ===`);
  console.log(`Obras: ${obras.length} | Skip media: ${SKIP_MEDIA} | Concurrency: ${CONCURRENCY} | Start: ${START_FROM}`);
  console.log(`================================\n`);

  let totalImportados = 0, totalFotos = 0, totalVideos = 0, totalErros = 0;
  const startTime = Date.now();

  for (let i = START_FROM; i < obras.length; i++) {
    const obra = obras[i];
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(`[${i+1}/${obras.length}] ${obra.nome} (${obra.total_relatorios} rels) ... `);

    const result = await importRelatoriosObra(obra.id, obra.external_id, obra.nome);
    const parts = [`${result.importados}/${result.totalApi} imp`];
    if (result.fotos) parts.push(`${result.fotos} fotos`);
    if (result.videos) parts.push(`${result.videos} vids`);
    if (result.erros) parts.push(`${result.erros} erros`);
    console.log(`${parts.join(', ')} [${elapsed}min]`);

    totalImportados += result.importados;
    totalFotos += result.fotos;
    totalVideos += result.videos;
    totalErros += result.erros;
  }

  const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== IMPORTAÇÃO FINALIZADA ===`);
  console.log(`Tempo: ${totalElapsed} min | Rels: ${totalImportados} | Fotos: ${totalFotos} | Vids: ${totalVideos} | Erros: ${totalErros}`);

  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM diario_obra_relatorios WHERE company_id = $1) as rels,
      (SELECT COUNT(*) FROM diario_obra_fotos f JOIN diario_obra_relatorios r ON r.id = f.relatorio_id WHERE r.company_id = $1) as fotos,
      (SELECT COUNT(*) FROM diario_obra_videos v JOIN diario_obra_relatorios r ON r.id = v.relatorio_id WHERE r.company_id = $1) as videos
  `, [COMPANY_ID]);
  console.log(`DB total: ${counts.rows[0].rels} rels, ${counts.rows[0].fotos} fotos, ${counts.rows[0].videos} vids`);

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e.message); pool.end(); process.exit(1); });
