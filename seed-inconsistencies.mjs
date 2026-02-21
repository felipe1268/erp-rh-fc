import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const companyId = 60002;
  const mesRef = '2026-02';
  const obraId = 2;
  const obraId2 = 3;
  const empIds = [90429, 90430, 90431, 90432, 90433];

  // Inserir registros de ponto para 5 funcionários
  for (const empId of empIds) {
    await conn.query(
      `INSERT INTO time_records (companyId, employeeId, obraId, mesReferencia, data, entrada1, saida1, entrada2, saida2, horasTrabalhadas, horasExtras, horasNoturnas, faltas, atrasos, fonte, ajusteManual) VALUES (?, ?, ?, ?, ?, '07:00', '11:00', '12:00', '17:00', '9:00', '1:00', '0:00', '0', '0:00', 'dixi', 0)`,
      [companyId, empId, obraId, mesRef, '2026-02-02']
    );
    await conn.query(
      `INSERT INTO time_records (companyId, employeeId, obraId, mesReferencia, data, entrada1, saida1, entrada2, saida2, horasTrabalhadas, horasExtras, horasNoturnas, faltas, atrasos, fonte, ajusteManual) VALUES (?, ?, ?, ?, ?, '07:00', '11:00', '12:00', '17:00', '9:00', '1:00', '0:00', '0', '0:00', 'dixi', 0)`,
      [companyId, empId, obraId, mesRef, '2026-02-03']
    );
  }

  // 1. Batida Ímpar (3 registros pendentes)
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'batida_impar', '3 batida(s) registrada(s) - número ímpar indica falta de entrada ou saída', 'pendente')`,
    [companyId, 90429, obraId, mesRef, '2026-02-02']
  );
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'batida_impar', '5 batida(s) registrada(s) - número ímpar indica falta de entrada ou saída', 'pendente')`,
    [companyId, 90430, obraId, mesRef, '2026-02-03']
  );
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'batida_impar', '1 batida registrada - número ímpar', 'pendente')`,
    [companyId, 90431, obraId, mesRef, '2026-02-04']
  );

  // 2. Falta Batida (2 registros pendentes)
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'falta_batida', 'Apenas 2 batidas registradas - faltam entrada/saída do intervalo', 'pendente')`,
    [companyId, 90432, obraId, mesRef, '2026-02-02']
  );
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'falta_batida', 'Apenas 2 batidas registradas - faltam entrada/saída do intervalo', 'pendente')`,
    [companyId, 90433, obraId, mesRef, '2026-02-05']
  );

  // 3. Horário Divergente (2 registros pendentes)
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'horario_divergente', 'Horas trabalhadas (4:30) diferem significativamente da jornada esperada (8:00)', 'pendente')`,
    [companyId, 90429, obraId, mesRef, '2026-02-05']
  );
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'horario_divergente', 'Horas trabalhadas (3:00) diferem significativamente da jornada esperada (8:00)', 'pendente')`,
    [companyId, 90431, obraId, mesRef, '2026-02-06']
  );

  // 4. Sem Registro (1 registro pendente)
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status) VALUES (?, ?, ?, ?, ?, 'sem_registro', 'Nenhum registro de ponto encontrado para dia útil', 'pendente')`,
    [companyId, 90432, obraId, mesRef, '2026-02-06']
  );

  // 5. Uma inconsistência já resolvida para testar filtro
  await conn.query(
    `INSERT INTO time_inconsistencies (companyId, employeeId, obraId, mesReferencia, data, tipoInconsistencia, descricao, status, justificativa, resolvidoPor, resolvidoEm) VALUES (?, ?, ?, ?, ?, 'batida_impar', '3 batida(s) - resolvida', 'justificado', 'Funcionário saiu mais cedo com autorização', 'Felipe Alves', '2026-02-10')`,
    [companyId, 90433, obraId, mesRef, '2026-02-04']
  );

  // 6. Conflito de obra (funcionário com 2 obras no mesmo dia)
  await conn.query(
    `INSERT INTO time_records (companyId, employeeId, obraId, mesReferencia, data, entrada1, saida1, entrada2, saida2, horasTrabalhadas, horasExtras, horasNoturnas, faltas, atrasos, fonte, ajusteManual) VALUES (?, ?, ?, ?, ?, '07:00', '11:00', '', '', '4:00', '0:00', '0:00', '0', '0:00', 'dixi', 0)`,
    [companyId, 90429, obraId2, mesRef, '2026-02-10']
  );
  await conn.query(
    `INSERT INTO time_records (companyId, employeeId, obraId, mesReferencia, data, entrada1, saida1, entrada2, saida2, horasTrabalhadas, horasExtras, horasNoturnas, faltas, atrasos, fonte, ajusteManual) VALUES (?, ?, ?, ?, ?, '13:00', '17:00', '', '', '4:00', '0:00', '0:00', '0', '0:00', 'dixi', 0)`,
    [companyId, 90429, obraId, mesRef, '2026-02-10']
  );

  console.log('Dados de teste inseridos com sucesso!');
  console.log('- 10 registros de ponto');
  console.log('- 3 inconsistências tipo batida_impar (pendentes)');
  console.log('- 2 inconsistências tipo falta_batida (pendentes)');
  console.log('- 2 inconsistências tipo horario_divergente (pendentes)');
  console.log('- 1 inconsistência tipo sem_registro (pendente)');
  console.log('- 1 inconsistência resolvida (batida_impar)');
  console.log('- 1 conflito de obra (2 registros mesma data, obras diferentes)');
  await conn.end();
}

main().catch(console.error);
