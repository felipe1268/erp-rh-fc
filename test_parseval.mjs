import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  const conn = await mysql.createConnection(url);
  const [rows] = await conn.query('SELECT valorEstimadoTotal FROM termination_notices WHERE deletedAt IS NULL AND valorEstimadoTotal IS NOT NULL');
  
  // Current (broken) parseVal: removes dots, replaces comma with dot
  const parseValBroken = (v) => { const n = parseFloat((v || '0').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  
  // Correct parseVal: values are already in '3733.46' format (dot as decimal)
  const parseValCorrect = (v) => { const n = parseFloat(v || '0'); return isNaN(n) ? 0 : n; };
  
  let totalBroken = 0, totalCorrect = 0;
  rows.forEach(r => {
    const broken = parseValBroken(r.valorEstimadoTotal);
    const correct = parseValCorrect(r.valorEstimadoTotal);
    totalBroken += broken;
    totalCorrect += correct;
    if (Math.abs(broken - correct) > 1) {
      console.log('MISMATCH:', r.valorEstimadoTotal, '-> broken:', broken, 'correct:', correct);
    }
  });
  console.log('\nTotal (broken parseVal):', totalBroken.toFixed(2));
  console.log('Total (correct parseVal):', totalCorrect.toFixed(2));
  console.log('Records:', rows.length);
  await conn.end();
}
main().catch(console.error);
