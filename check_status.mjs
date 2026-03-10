import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Current status distribution
const [statuses] = await conn.query('SELECT status, COUNT(*) as cnt FROM employees WHERE deletedAt IS NULL GROUP BY status');
console.log('=== Status Distribution ===');
statuses.forEach(s => console.log(s.status, ':', s.cnt));

// Check who is on vacation (em_gozo)
const [ferias] = await conn.query(`
  SELECT vp.employeeId, e.nomeCompleto, e.status, vp.dataInicio, vp.dataFim, vp.status as vpStatus,
         vp.periodo2Inicio, vp.periodo2Fim, vp.periodo3Inicio, vp.periodo3Fim
  FROM vacation_periods vp
  JOIN employees e ON e.id = vp.employeeId
  WHERE vp.status = 'em_gozo' AND vp.deletedAt IS NULL AND e.deletedAt IS NULL
`);
console.log('\n=== Ferias em Gozo ===');
ferias.forEach(f => console.log(f.employeeId, f.nomeCompleto, 'empStatus:', f.status, 'inicio:', f.dataInicio, 'fim:', f.dataFim, 'p2:', f.periodo2Inicio, '-', f.periodo2Fim));

// Check active termination notices
const [avisos] = await conn.query(`
  SELECT tn.employeeId, e.nomeCompleto, e.status, tn.dataInicio, tn.dataFim, tn.status as tnStatus
  FROM termination_notices tn
  JOIN employees e ON e.id = tn.employeeId
  WHERE tn.status = 'em_andamento' AND tn.deletedAt IS NULL AND e.deletedAt IS NULL
`);
console.log('\n=== Avisos Previos em Andamento ===');
avisos.forEach(a => console.log(a.employeeId, a.nomeCompleto, 'empStatus:', a.status, 'inicio:', a.dataInicio, 'fim:', a.dataFim));

// Check atestados with future return date
const [afastados] = await conn.query(`
  SELECT a.employeeId, e.nomeCompleto, e.status, a.dataEmissao, a.dataRetorno, a.diasAfastamento, a.tipo
  FROM atestados a
  JOIN employees e ON e.id = a.employeeId
  WHERE a.dataRetorno >= CURDATE() AND a.deletedAt IS NULL AND e.deletedAt IS NULL
`);
console.log('\n=== Atestados com Retorno Futuro ===');
afastados.forEach(a => console.log(a.employeeId, a.nomeCompleto, 'empStatus:', a.status, 'emissao:', a.dataEmissao, 'retorno:', a.dataRetorno, 'tipo:', a.tipo));

// Check licenca maternidade ativa
const [licencas] = await conn.query(`
  SELECT id, nomeCompleto, status, licencaDataInicio, licencaDataFim
  FROM employees
  WHERE licencaMaternidade = 1 AND licencaDataFim >= CURDATE() AND deletedAt IS NULL
`);
console.log('\n=== Licencas Ativas ===');
licencas.forEach(l => console.log(l.id, l.nomeCompleto, 'empStatus:', l.status, 'inicio:', l.licencaDataInicio, 'fim:', l.licencaDataFim));

// Check employees currently marked as Ferias/Afastado/Licenca
const [autoStatus] = await conn.query(`
  SELECT id, nomeCompleto, status, companyId
  FROM employees
  WHERE status IN ('Ferias', 'Afastado', 'Licenca') AND deletedAt IS NULL
`);
console.log('\n=== Funcionarios com Status Automatico Atual ===');
autoStatus.forEach(e => console.log(e.id, e.nomeCompleto, 'status:', e.status, 'company:', e.companyId));

await conn.end();
