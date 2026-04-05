const { Pool } = require('../node_modules/pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const token = process.env.DIARIO_OBRA_API_TOKEN;
const COMPANY_ID = 60002;
const OBRA_ID = parseInt(process.argv[2]);
const PAGE = parseInt(process.argv[3] || '1');
const PAGES = parseInt(process.argv[4] || '1');

if (!OBRA_ID) { console.error('Usage: node importar-paginas.cjs <obraId> [startPage] [numPages]'); process.exit(1); }

const delay = ms => new Promise(r => setTimeout(r, ms));
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

async function processRel(obraId, extObraId, relExtId) {
  const ex = await pool.query('SELECT id FROM diario_obra_relatorios WHERE obra_id = $1 AND external_id = $2', [obraId, relExtId]);
  if (ex.rows.length > 0) return 'skip';

  let det;
  for (let retry = 0; retry < 3; retry++) {
    const r = await fetch(`https://api.diariodeobra.app/v2/obras/${extObraId}/relatorios/${relExtId}`, { headers: { token } });
    if (r.status === 429) { await delay(3000); continue; }
    if (!r.ok) return 'error';
    det = await r.json();
    break;
  }
  if (!det) return 'error';

  const sm = { 1: 'rascunho', 2: 'finalizado', 3: 'aprovado', 4: 'pendente' };
  const h = det.horarioDeTrabalho || {};
  try {
    const res = await pool.query(
      `INSERT INTO diario_obra_relatorios (company_id, obra_id, external_id, numero, data, status, responsavel_nome,
       clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite,
       hora_inicio, hora_fim, hora_intervalo_inicio, hora_intervalo_fim, horas_trabalhadas,
       pdf_url, dados_json, importado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()) RETURNING id`,
      [COMPANY_ID, obraId, relExtId, det.numero, parseDate(det.data), sm[det.status?.id]||'rascunho',
       det.criadoPor?.usuario?.nome, nullIfEmpty(det.clima?.manha?.clima), nullIfEmpty(det.clima?.tarde?.clima), nullIfEmpty(det.clima?.noite?.clima),
       nullIfEmpty(det.clima?.manha?.condicao), nullIfEmpty(det.clima?.tarde?.condicao), nullIfEmpty(det.clima?.noite?.condicao),
       safeTime(h.expedienteInicio), safeTime(h.expedienteFim), safeTime(h.intervaloInicio), safeTime(h.intervaloFim),
       nullIfEmpty(h.horasTrabalhadas), det.linkPdf, JSON.stringify(det)]
    );
    const rid = res.rows[0].id;

    const mop = det.maoDeObra?.opcaoSelecionada || 'personalizada';
    for (const mo of (det.maoDeObra?.[mop] || [])) {
      await pool.query('INSERT INTO diario_obra_mao_obra (relatorio_id,nome,funcao,categoria,presente,hora_inicio,hora_fim,horas_trabalhadas,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [rid, mo.nome, mo.funcao, mo.categoria?.descricao, mo.presenca??true, safeTime(mo.horaInicio), safeTime(mo.horaFim), nullIfEmpty(mo.horasTrabalhadas), JSON.stringify(mo)]);
    }
    for (const eq of (det.equipamentos||[])) {
      await pool.query('INSERT INTO diario_obra_equipamentos (relatorio_id,nome,tipo,quantidade,hora_inicio,hora_fim,horas_trabalhadas,operativo,situacao,observacao,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [rid, eq.descricao||eq.nome, eq.tipo, safeNumeric(eq.quantidade)||1, safeTime(eq.horaInicio), safeTime(eq.horaFim), nullIfEmpty(eq.horasTrabalhadas), eq.operativo??true, nullIfEmpty(eq.situacao), nullIfEmpty(eq.observacao), JSON.stringify(eq)]);
    }
    for (const at of (det.atividades||[])) {
      const cp = at.controleDeProducao||{};
      await pool.query('INSERT INTO diario_obra_atividades (relatorio_id,item,descricao,etapa,percentual_avanco,observacao,unidade,quantidade_prevista,quantidade_realizada,quantidade_acumulada,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [rid, nullIfEmpty(at.item), at.descricao, at.etapa?.descricao, safeNumeric(at.porcentagem), nullIfEmpty(at.observacao), nullIfEmpty(cp.unidade), safeNumeric(cp.quantidade), safeNumeric(cp.realizado), safeNumeric(cp.acumulado), JSON.stringify(at)]);
    }
    for (const oc of (det.ocorrencias||[])) {
      await pool.query('INSERT INTO diario_obra_ocorrencias (relatorio_id,descricao,tipo,providencia,dados_json) VALUES ($1,$2,$3,$4,$5)',
        [rid, oc.descricao||'', nullIfEmpty(oc.tipo), nullIfEmpty(oc.providencia), JSON.stringify(oc)]);
    }
    for (const m of (det.controleDeMaterial?.recebido||[])) {
      await pool.query('INSERT INTO diario_obra_materiais (relatorio_id,tipo,descricao,quantidade,unidade,nota_fiscal,fornecedor,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [rid, 'recebido', m.descricao, safeNumeric(m.quantidade), nullIfEmpty(m.unidade), nullIfEmpty(m.notaFiscal), nullIfEmpty(m.fornecedor), JSON.stringify(m)]);
    }
    for (const m of (det.controleDeMaterial?.utilizado||[])) {
      await pool.query('INSERT INTO diario_obra_materiais (relatorio_id,tipo,descricao,quantidade,unidade,nota_fiscal,fornecedor,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [rid, 'utilizado', m.descricao, safeNumeric(m.quantidade), nullIfEmpty(m.unidade), nullIfEmpty(m.notaFiscal), nullIfEmpty(m.fornecedor), JSON.stringify(m)]);
    }
    for (const c of (det.comentarios||[])) {
      let dh = c.dataHora||c.created||null;
      if (dh) { const dm = dh.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/); if (dm) dh = `${dm[3]}-${dm[2]}-${dm[1]} ${dm[4]}`; }
      await pool.query('INSERT INTO diario_obra_comentarios (relatorio_id,texto,autor,data_hora,dados_json) VALUES ($1,$2,$3,$4,$5)',
        [rid, c.texto||c.descricao||'', c.usuario?.nome||c.autor, dh, JSON.stringify(c)]);
    }
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

async function main() {
  const obra = await pool.query('SELECT external_id, nome FROM diario_obra_obras WHERE id = $1 AND company_id = $2', [OBRA_ID, COMPANY_ID]);
  if (!obra.rows[0]) { console.error('Obra not found'); process.exit(1); }
  const extId = obra.rows[0].external_id;

  let imported = 0, skipped = 0, errors = 0;

  let retries = 3;
  let rels = [];
  while (retries > 0) {
    const resp = await fetch(`https://api.diariodeobra.app/v2/obras/${extId}/relatorios?limite=1000`, { headers: { token } });
    if (resp.status === 429) { await delay(5000); retries--; continue; }
    if (!resp.ok) { console.error('API error:', resp.status); break; }
    rels = await resp.json();
    break;
  }
  if (!Array.isArray(rels)) rels = [];

  for (const rel of rels) {
    const result = await processRel(OBRA_ID, extId, rel._id);
    if (result === 'ok') imported++;
    else if (result === 'skip') skipped++;
    else errors++;
    await delay(150);
  }

  console.log(`${obra.rows[0].nome}: pg${PAGE}-${PAGE+PAGES-1} | +${imported} imp, ${skipped} skip, ${errors} err`);
  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); process.exit(1); });
