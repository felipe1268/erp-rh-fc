/**
 * Script de importação NFS-e XML — versão otimizada com dedup em memória + batch INSERT.
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { XMLParser } from 'fast-xml-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root  = path.resolve(__dir, '..');
const COMPANY_ID = 60002;

const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.error('NEON_DATABASE_URL não definida'); process.exit(1); }
const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: true,
});

function parseDateBR(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s || '').slice(0, 10);
}
function centsToReais(v) {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n / 100;
}

function parseSiapGeo(xml) {
  if (!xml.includes('<nfse') || !xml.includes('<nf>')) return null;
  try {
    const parsed = xmlParser.parse(xml);
    const root = parsed?.nfse;
    if (!root) return null;
    const nfArr = Array.isArray(root.nf) ? root.nf : root.nf ? [root.nf] : [];
    if (!nfArr.length) return null;
    return nfArr.map(nf => {
      const bruto   = centsToReais(nf.vl_servico);
      const inss    = centsToReais(nf.vl_inss);
      const csll    = centsToReais(nf.vl_csll);
      const pis     = centsToReais(nf.vl_pis);
      const cofins  = centsToReais(nf.vl_cofins);
      const ir      = centsToReais(nf.vl_ir);
      const outras  = centsToReais(nf.vl_outras_retencoes);
      const ded     = centsToReais(nf.vl_deducoes);
      const retencoes = inss + csll + pis + cofins + ir + outras;
      const aliquota = Math.round(parseInt(String(nf.aliquota ?? '0'), 10)) / 100;
      return {
        numero:           String(nf.nr_nf ?? '').trim(),
        serie:            String(nf.serie ?? '').trim(),
        chave:            String(nf.codigoverificacao ?? '').trim(),
        dataEmissao:      parseDateBR(String(nf.dt_emissao ?? '')),
        dataPrestacao:    parseDateBR(String(nf.dt_prestacao ?? '')),
        tomadorCnpj:      String(nf.t_documento ?? '').replace(/\D/g, ''),
        tomadorNome:      String(nf.t_razao_social ?? '').trim(),
        tomadorInscricao: String(nf.t_inscricao ?? '').trim(),
        tomadorEmail:     String(nf.t_email ?? '').trim(),
        tomadorTelefone:  String(nf.t_telefone ?? '').trim(),
        valorBruto:       bruto,
        valorLiquido:     Math.max(0, bruto - retencoes),
        issRetido:        centsToReais(nf.vl_iss),
        retencaoInss:     inss, retencaoIrrf: ir, retencaoCsll: csll,
        retencaoPis:      pis, retencaoCofins: cofins, retencaoOutras: outras,
        deducoesTotal:    ded,
        aliquotaIss:      aliquota,
        cdCnae:           String(nf.cd_cnae ?? '').trim(),
        cdListaServico:   String(nf.cd_lista_servico ?? '').trim(),
        optanteSimples:   String(nf.optante_simples ?? '') === 'S',
        tributada:        String(nf.tributada ?? '') === 'S',
        discriminacao:    String(nf.discriminacao ?? '').trim(),
        status:           String(nf.id_nf_st) === '2' ? 'cancelada' : 'pendente',
      };
    }).filter(n => !!n.numero);
  } catch(e) { console.error('Parse error:', e.message); return null; }
}

const FILES = [
  '2018_a_2025_1782338151388.xml',
  '20266-NFSE_Exportadas-13239401-202606241844_1782338151389.xml',
  '20266-NFSE_Exportadas-13239401-202606241845_1782338151389.xml',
  '2026_1782338151390.xml',
  '20266-NFSE_Exportadas-13239401-202606241737_1782333481063.xml',
  '20266-NFSE_Exportadas-13239401-202606241754_1782335094045.xml',
];

async function main() {
  const client = await pool.connect();
  try {
    // ── 1. Carrega todas as notas existentes em memória ──────────────────────
    const { rows: existentes } = await client.query(
      `SELECT numero_nf, chave_acesso, EXTRACT(YEAR FROM data_emissao)::int as ano
       FROM fiscal_notes WHERE company_id=$1 AND origem LIKE 'nfse%'`,
      [COMPANY_ID]
    );
    // Sets para dedup rápido
    const chavesExist  = new Set();  // chave_acesso não-vazia
    const nfAnoExist   = new Set();  // "numero_nf|ano" quando chave vazia
    for (const r of existentes) {
      if (r.chave_acesso) chavesExist.add(r.chave_acesso);
      if (r.numero_nf && r.ano) nfAnoExist.add(`${r.numero_nf}|${r.ano}`);
    }
    console.log(`Registros existentes: ${existentes.length} (${chavesExist.size} com chave, ${nfAnoExist.size} sem chave)`);

    // ── 2. Coleta todas as notas novas de todos os arquivos ──────────────────
    const toInsert = [];  // dedup também entre arquivos
    const seen = new Set();

    for (const filename of FILES) {
      const filepath = path.join(root, 'attached_assets', filename);
      if (!existsSync(filepath)) { console.log(`[SKIP] ${filename} — não encontrado`); continue; }
      const xml = readFileSync(filepath, 'utf-8');
      const notas = parseSiapGeo(xml);
      if (!notas) { console.log(`[SKIP] ${filename} — formato não reconhecido`); continue; }
      let novo = 0, dup = 0;
      for (const nota of notas) {
        const ano = nota.dataEmissao?.slice(0, 4) || '0';
        const hasChave = nota.chave && nota.chave.length >= 4;
        const dupKey = hasChave ? `chave:${nota.chave}` : `nf:${nota.numero}|${ano}`;
        // Verifica contra banco
        if (hasChave ? chavesExist.has(nota.chave) : nfAnoExist.has(`${nota.numero}|${ano}`)) { dup++; continue; }
        // Dedup entre arquivos (evita processar arquivo duplicado)
        if (seen.has(dupKey)) { dup++; continue; }
        seen.add(dupKey);
        // Marca como vista para dedup futuro
        if (hasChave) chavesExist.add(nota.chave);
        else nfAnoExist.add(`${nota.numero}|${ano}`);
        toInsert.push({ nota, ano });
        novo++;
      }
      console.log(`[${filename}] ${notas.length} parseadas → ${novo} novas, ${dup} ignoradas`);
    }

    console.log(`\nTotal a inserir: ${toInsert.length}`);
    if (!toInsert.length) { console.log('Nada a inserir.'); return; }

    // ── 3. Batch INSERT em lotes de 50 ──────────────────────────────────────
    const BATCH = 50;
    let importadas = 0, erros = 0;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const lote = toInsert.slice(i, i + BATCH);
      // Monta VALUES dinâmico
      const vals = [];
      const params = [];
      let p = 1;
      for (const { nota } of lote) {
        vals.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4}::date,$${p+5}::date,$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11},$${p+12},$${p+13},$${p+14},$${p+15},$${p+16},$${p+17},$${p+18},$${p+19},$${p+20},$${p+21},$${p+22},$${p+23},$${p+24},$${p+25},$${p+26},$${p+27},'nfse_siapgeo_export',NOW(),NOW())`);
        params.push(
          COMPANY_ID, nota.numero, nota.serie || null, nota.chave || null,
          nota.dataEmissao || null, nota.dataPrestacao || null,
          nota.tomadorCnpj || null, nota.tomadorNome || null,
          nota.tomadorInscricao || null, nota.tomadorEmail || null, nota.tomadorTelefone || null,
          nota.discriminacao || null, nota.cdCnae || null, nota.cdListaServico || null,
          nota.optanteSimples, nota.tributada,
          nota.valorBruto, nota.deducoesTotal, nota.aliquotaIss || null,
          nota.issRetido, nota.retencaoInss, nota.retencaoIrrf, nota.retencaoCsll,
          nota.retencaoPis, nota.retencaoCofins, nota.retencaoOutras,
          nota.valorLiquido, nota.status,
        );
        p += 28;
      }
      try {
        await client.query(
          `INSERT INTO fiscal_notes
            (company_id, numero_nf, serie, chave_acesso, data_emissao, data_prestacao,
             tomador_cnpj, tomador_razao_social, tomador_inscricao, tomador_email, tomador_telefone,
             descricao_servico, cd_cnae, cd_lista_servico, optante_simples, tributada,
             valor_bruto, deducoes_total, aliquota_iss,
             iss_retido, retencao_inss, retencao_irrf, retencao_csll,
             retencao_pis, retencao_cofins, retencao_outras,
             valor_liquido, status, origem, created_at, updated_at)
           VALUES ${vals.join(',')}
           ON CONFLICT DO NOTHING`,
          params
        );
        importadas += lote.length;
        process.stdout.write(`\r  Inserindo... ${importadas}/${toInsert.length}`);
      } catch(e) {
        console.error(`\nErro no lote ${i}-${i+BATCH}: ${e.message}`);
        // Fallback: insere um a um para isolar o problema
        for (const { nota } of lote) {
          try {
            await client.query(
              `INSERT INTO fiscal_notes
                (company_id, numero_nf, serie, chave_acesso, data_emissao, data_prestacao,
                 tomador_cnpj, tomador_razao_social, tomador_inscricao, tomador_email, tomador_telefone,
                 descricao_servico, cd_cnae, cd_lista_servico, optante_simples, tributada,
                 valor_bruto, deducoes_total, aliquota_iss,
                 iss_retido, retencao_inss, retencao_irrf, retencao_csll,
                 retencao_pis, retencao_cofins, retencao_outras,
                 valor_liquido, status, origem, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,'nfse_siapgeo_export',NOW(),NOW())
               ON CONFLICT DO NOTHING`,
              [
                COMPANY_ID, nota.numero, nota.serie || null, nota.chave || null,
                nota.dataEmissao || null, nota.dataPrestacao || null,
                nota.tomadorCnpj || null, nota.tomadorNome || null,
                nota.tomadorInscricao || null, nota.tomadorEmail || null, nota.tomadorTelefone || null,
                nota.discriminacao || null, nota.cdCnae || null, nota.cdListaServico || null,
                nota.optanteSimples, nota.tributada,
                nota.valorBruto, nota.deducoesTotal, nota.aliquotaIss || null,
                nota.issRetido, nota.retencaoInss, nota.retencaoIrrf, nota.retencaoCsll,
                nota.retencaoPis, nota.retencaoCofins, nota.retencaoOutras,
                nota.valorLiquido, nota.status,
              ]
            );
            importadas++;
          } catch(e2) { erros++; }
        }
      }
    }
    console.log(`\n\n══ RESULTADO ══  importadas=${importadas}  erros=${erros}`);

    // Resumo por ano
    const { rows: porAno } = await client.query(
      `SELECT EXTRACT(YEAR FROM data_emissao)::int as ano, COUNT(*) as cnt,
              SUM(valor_bruto) as total_bruto
       FROM fiscal_notes WHERE company_id=$1 AND origem LIKE 'nfse%'
       GROUP BY 1 ORDER BY 1`,
      [COMPANY_ID]
    );
    console.log('\nNotas no banco por ano:');
    let grand = 0;
    porAno.forEach(r => {
      grand += parseInt(r.cnt);
      console.log(`  ${r.ano}: ${r.cnt} notas  R$ ${parseFloat(r.total_bruto).toLocaleString('pt-BR',{minimumFractionDigits:2})}`);
    });
    console.log(`  TOTAL: ${grand} notas`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
