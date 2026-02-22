import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  const conn = await mysql.createConnection(url);
  
  // Verificar extra_payments (horas extras)
  const [ep] = await conn.query('SELECT COUNT(*) as total FROM extra_payments');
  console.log('extra_payments:', ep[0].total);
  
  // Verificar time_records com horas extras
  const [tr] = await conn.query("SELECT COUNT(*) as total, SUM(CASE WHEN horasExtras IS NOT NULL AND horasExtras != '' AND horasExtras != '0' AND horasExtras != '00:00' THEN 1 ELSE 0 END) as comHE FROM time_records");
  console.log('time_records total:', tr[0].total, '| com HE:', tr[0].comHE);
  
  // Amostra de time_records com HE
  const [amHE] = await conn.query("SELECT employeeId, mesReferencia, data, horasTrabalhadas, horasExtras, horasNoturnas FROM time_records WHERE horasExtras IS NOT NULL AND horasExtras != '' AND horasExtras != '0' AND horasExtras != '00:00' LIMIT 10");
  console.log('Amostra HE:', JSON.stringify(amHE, null, 2));
  
  // Verificar obra_horas_rateio
  const [ohr] = await conn.query("SELECT COUNT(*) as total, SUM(CASE WHEN horasExtras IS NOT NULL AND horasExtras != '' AND horasExtras != '0' THEN 1 ELSE 0 END) as comHE FROM obra_horas_rateio");
  console.log('obra_horas_rateio total:', ohr[0].total, '| com HE:', ohr[0].comHE);
  
  // Amostra obra_horas_rateio com HE
  const [amOHR] = await conn.query("SELECT * FROM obra_horas_rateio WHERE horasExtras IS NOT NULL AND horasExtras != '0' LIMIT 5");
  console.log('Amostra OHR:', JSON.stringify(amOHR, null, 2));
  
  // Verificar folha_itens proventos JSON com HE
  const [fiSample] = await conn.query("SELECT id, nomeColaborador, proventos FROM folha_itens WHERE proventos IS NOT NULL LIMIT 3");
  for (const fi of fiSample) {
    const provs = typeof fi.proventos === 'string' ? JSON.parse(fi.proventos) : fi.proventos;
    const heItems = provs ? provs.filter(p => p.descricao && (p.descricao.toLowerCase().includes('hora') || p.descricao.toLowerCase().includes('extra') || p.descricao.toLowerCase().includes('he '))) : [];
    console.log(`folha_itens [${fi.id}] ${fi.nomeColaborador}: ${provs ? provs.length : 0} proventos, HE items: ${JSON.stringify(heItems)}`);
  }
  
  // Verificar quais meses têm dados de time_records
  const [meses] = await conn.query("SELECT mesReferencia, COUNT(*) as total FROM time_records GROUP BY mesReferencia ORDER BY mesReferencia");
  console.log('\nMeses com time_records:', JSON.stringify(meses));
  
  // Verificar quais meses têm dados de obra_horas_rateio
  const [mesesOHR] = await conn.query("SELECT mesAno, COUNT(*) as total FROM obra_horas_rateio GROUP BY mesAno ORDER BY mesAno");
  console.log('Meses com obra_horas_rateio:', JSON.stringify(mesesOHR));
  
  await conn.end();
}
main().catch(e => console.error(e.message));
