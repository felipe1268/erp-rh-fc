const { Pool } = require('../node_modules/pg');
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
const token = process.env.DIARIO_OBRA_API_TOKEN;
const COMPANY_ID = 60002;
const OBRA_ID = parseInt(process.argv[2]);
const BATCH = parseInt(process.argv[3] || '50');
if (!OBRA_ID) { console.error('Usage: node importar-batch.cjs <obraId> [batchSize]'); process.exit(1); }

const delay = ms => new Promise(r => setTimeout(r, ms));
function parseDate(d) { if (!d) return null; const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : d; }
function ne(v) { return (v===''||v===undefined) ? null : v; }
function st(v) { if (!v||v==='') return null; return /^\d{2}:\d{2}(:\d{2})?$/.test(v) ? v : null; }
function sn(v) { if (v===null||v===undefined||v==='') return null; const n=Number(v); return isNaN(n)?null:n; }

async function insertRel(obraId, extObraId, relExtId) {
  const ex = await pool.query('SELECT id FROM diario_obra_relatorios WHERE obra_id=$1 AND external_id=$2', [obraId, relExtId]);
  if (ex.rows.length > 0) return 'skip';
  for (let retry=0; retry<3; retry++) {
    const r = await fetch(`https://api.diariodeobra.app/v2/obras/${extObraId}/relatorios/${relExtId}`, { headers: { token } });
    if (r.status===429) { await delay(3000); continue; }
    if (!r.ok) return 'err';
    const d = await r.json();
    const sm={1:'rascunho',2:'finalizado',3:'aprovado',4:'pendente'};
    const h=d.horarioDeTrabalho||{};
    try {
      const res = await pool.query(`INSERT INTO diario_obra_relatorios (company_id,obra_id,external_id,numero,data,status,responsavel_nome,clima_manha,clima_tarde,clima_noite,condicao_manha,condicao_tarde,condicao_noite,hora_inicio,hora_fim,hora_intervalo_inicio,hora_intervalo_fim,horas_trabalhadas,pdf_url,dados_json,importado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()) RETURNING id`,
        [COMPANY_ID,obraId,relExtId,d.numero,parseDate(d.data),sm[d.status?.id]||'rascunho',d.criadoPor?.usuario?.nome,ne(d.clima?.manha?.clima),ne(d.clima?.tarde?.clima),ne(d.clima?.noite?.clima),ne(d.clima?.manha?.condicao),ne(d.clima?.tarde?.condicao),ne(d.clima?.noite?.condicao),st(h.expedienteInicio),st(h.expedienteFim),st(h.intervaloInicio),st(h.intervaloFim),ne(h.horasTrabalhadas),d.linkPdf,JSON.stringify(d)]);
      const rid=res.rows[0].id;
      const mop=d.maoDeObra?.opcaoSelecionada||'personalizada';
      for (const mo of (d.maoDeObra?.[mop]||[])) {
        await pool.query('INSERT INTO diario_obra_mao_obra (relatorio_id,nome,funcao,categoria,presente,hora_inicio,hora_fim,horas_trabalhadas,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [rid,mo.nome,mo.funcao,mo.categoria?.descricao,mo.presenca??true,st(mo.horaInicio),st(mo.horaFim),ne(mo.horasTrabalhadas),JSON.stringify(mo)]);
      }
      for (const eq of (d.equipamentos||[])) {
        await pool.query('INSERT INTO diario_obra_equipamentos (relatorio_id,nome,tipo,quantidade,hora_inicio,hora_fim,horas_trabalhadas,operativo,situacao,observacao,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [rid,eq.descricao||eq.nome,eq.tipo,sn(eq.quantidade)||1,st(eq.horaInicio),st(eq.horaFim),ne(eq.horasTrabalhadas),eq.operativo??true,ne(eq.situacao),ne(eq.observacao),JSON.stringify(eq)]);
      }
      for (const at of (d.atividades||[])) {
        const cp=at.controleDeProducao||{};
        await pool.query('INSERT INTO diario_obra_atividades (relatorio_id,item,descricao,etapa,percentual_avanco,observacao,unidade,quantidade_prevista,quantidade_realizada,quantidade_acumulada,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [rid,ne(at.item),at.descricao,at.etapa?.descricao,sn(at.porcentagem),ne(at.observacao),ne(cp.unidade),sn(cp.quantidade),sn(cp.realizado),sn(cp.acumulado),JSON.stringify(at)]);
      }
      for (const oc of (d.ocorrencias||[])) {
        await pool.query('INSERT INTO diario_obra_ocorrencias (relatorio_id,descricao,tipo,providencia,dados_json) VALUES ($1,$2,$3,$4,$5)',
          [rid,oc.descricao||'',ne(oc.tipo),ne(oc.providencia),JSON.stringify(oc)]);
      }
      for (const m of (d.controleDeMaterial?.recebido||[])) {
        await pool.query('INSERT INTO diario_obra_materiais (relatorio_id,tipo,descricao,quantidade,unidade,nota_fiscal,fornecedor,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [rid,'recebido',m.descricao,sn(m.quantidade),ne(m.unidade),ne(m.notaFiscal),ne(m.fornecedor),JSON.stringify(m)]);
      }
      for (const m of (d.controleDeMaterial?.utilizado||[])) {
        await pool.query('INSERT INTO diario_obra_materiais (relatorio_id,tipo,descricao,quantidade,unidade,nota_fiscal,fornecedor,dados_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [rid,'utilizado',m.descricao,sn(m.quantidade),ne(m.unidade),ne(m.notaFiscal),ne(m.fornecedor),JSON.stringify(m)]);
      }
      for (const c of (d.comentarios||[])) {
        let dh=c.dataHora||c.created||null;
        if (dh) { const dm=dh.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/); if (dm) dh=`${dm[3]}-${dm[2]}-${dm[1]} ${dm[4]}`; }
        await pool.query('INSERT INTO diario_obra_comentarios (relatorio_id,texto,autor,data_hora,dados_json) VALUES ($1,$2,$3,$4,$5)',
          [rid,c.texto||c.descricao||'',c.usuario?.nome||c.autor,dh,JSON.stringify(c)]);
      }
      return 'ok';
    } catch(e) { return 'err:'+e.message; }
  }
  return 'err';
}

async function main() {
  const obra = await pool.query('SELECT external_id,nome FROM diario_obra_obras WHERE id=$1 AND company_id=$2', [OBRA_ID, COMPANY_ID]);
  if (!obra.rows[0]) { console.error('Not found'); process.exit(1); }
  const extId = obra.rows[0].external_id;

  let resp;
  for (let retry=0; retry<3; retry++) {
    resp = await fetch(`https://api.diariodeobra.app/v2/obras/${extId}/relatorios?limite=1000`, { headers: { token } });
    if (resp.status===429) { await delay(5000); continue; }
    break;
  }
  const allRels = await resp.json();
  if (!Array.isArray(allRels)) { console.error('Bad response'); process.exit(1); }

  const dbExisting = await pool.query('SELECT external_id FROM diario_obra_relatorios WHERE obra_id=$1', [OBRA_ID]);
  const existingSet = new Set(dbExisting.rows.map(r => r.external_id));
  const newRels = allRels.filter(r => !existingSet.has(r._id)).slice(0, BATCH);

  let imp=0, err=0;
  for (const rel of newRels) {
    const result = await insertRel(OBRA_ID, extId, rel._id);
    if (result === 'ok') imp++;
    else if (result !== 'skip') err++;
  }

  const dbCount = await pool.query('SELECT COUNT(*) as c FROM diario_obra_relatorios WHERE obra_id=$1', [OBRA_ID]);
  console.log(`${obra.rows[0].nome}: +${imp} imp, ${err} err | DB: ${dbCount.rows[0].c}/${allRels.length} | faltam: ${allRels.length - Number(dbCount.rows[0].c)}`);
  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); process.exit(1); });
