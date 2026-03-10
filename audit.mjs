import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const companyId = 60002;

// 1. Quadro de Pessoal
const [rows1] = await conn.execute(`SELECT COUNT(*) as total, SUM(status='Ativo') as ativos, SUM(status='Ferias') as ferias, SUM(status='Afastado') as afastados, SUM(status='Licenca') as licenca, SUM(status='Desligado') as desligados FROM employees WHERE companyId=?`, [companyId]);
console.log('=== QUADRO DE PESSOAL ===');
console.log(JSON.stringify(rows1[0], null, 2));

// 2. Obras ativas
const [rows2] = await conn.execute(`SELECT COUNT(*) as obras_ativas FROM obras WHERE companyId=? AND status='Ativa'`, [companyId]);
console.log('\n=== OBRAS ATIVAS ===');
console.log(JSON.stringify(rows2[0], null, 2));

// 3. ASOs - usar tabela asos separada
const [rows3a] = await conn.execute(`SELECT COUNT(DISTINCT e.id) as com_aso FROM employees e INNER JOIN asos a ON a.employeeId=e.id AND a.deletedAt IS NULL WHERE e.companyId=? AND e.status='Ativo'`, [companyId]);
const [rows3b] = await conn.execute(`SELECT COUNT(*) as total_ativos FROM employees WHERE companyId=? AND status='Ativo'`, [companyId]);
const [rows3c] = await conn.execute(`SELECT COUNT(DISTINCT e.id) as aso_vencido FROM employees e INNER JOIN asos a ON a.employeeId=e.id AND a.deletedAt IS NULL WHERE e.companyId=? AND e.status='Ativo' AND a.dataValidade < CURDATE()`, [companyId]);
const [rows3d] = await conn.execute(`SELECT COUNT(DISTINCT e.id) as aso_vencendo FROM employees e INNER JOIN asos a ON a.employeeId=e.id AND a.deletedAt IS NULL WHERE e.companyId=? AND e.status='Ativo' AND a.dataValidade >= CURDATE() AND a.dataValidade <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)`, [companyId]);
console.log('\n=== ASOs ===');
console.log('Ativos total:', rows3b[0].total_ativos);
console.log('Com ASO:', rows3a[0].com_aso);
console.log('Sem ASO:', Number(rows3b[0].total_ativos) - Number(rows3a[0].com_aso));
console.log('ASO vencido:', rows3c[0].aso_vencido);
console.log('ASO vencendo 60d:', rows3d[0].aso_vencendo);

// 4. Férias pendentes
const [rows4] = await conn.execute(`SELECT COUNT(*) as ferias_pendentes FROM employees WHERE companyId=? AND status='Ativo' AND dataAdmissao IS NOT NULL AND DATEDIFF(NOW(), dataAdmissao) >= 365`, [companyId]);
console.log('\n=== FÉRIAS PENDENTES ===');
console.log(JSON.stringify(rows4[0], null, 2));

// 5. Demissões recentes
const [rows5] = await conn.execute(`SELECT nome, funcao, dataDesligamento FROM employees WHERE companyId=? AND status='Desligado' ORDER BY dataDesligamento DESC LIMIT 10`, [companyId]);
console.log('\n=== ÚLTIMAS DEMISSÕES ===');
rows5.forEach(r => console.log(`${r.nome} - ${r.funcao} - ${r.dataDesligamento}`));

// 6. Avisos prévios
const [rows7] = await conn.execute(`SELECT COUNT(*) as avisos_ativos FROM termination_notices WHERE companyId=? AND status='em_andamento'`, [companyId]);
console.log('\n=== AVISOS PRÉVIOS ATIVOS ===');
console.log(JSON.stringify(rows7[0], null, 2));

// 7. Alertas
try {
  const [rows8] = await conn.execute(`SELECT COUNT(*) as total FROM alerts WHERE companyId=?`, [companyId]);
  console.log('\n=== ALERTAS ===');
  console.log(JSON.stringify(rows8[0], null, 2));
} catch(e) {
  console.log('\n=== ALERTAS (tabela pode não existir) ===');
  console.log(e.message);
}

// 8. Aniversariantes do mês
const [rows9] = await conn.execute(`SELECT nome, funcao, DATE_FORMAT(dataNascimento, '%d/%m') as aniv FROM employees WHERE companyId=? AND status='Ativo' AND MONTH(dataNascimento)=MONTH(NOW()) ORDER BY DAY(dataNascimento) LIMIT 10`, [companyId]);
console.log('\n=== ANIVERSARIANTES DO MÊS ===');
rows9.forEach(r => console.log(`${r.nome} (${r.funcao}) - ${r.aniv}`));

await conn.end();
