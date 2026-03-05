import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const NUMEROS_PROIBIDOS = new Set([13, 17, 22, 24, 69, 171, 666]);

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Para cada empresa, buscar funcionários com números proibidos
  const [companies] = await conn.execute(`SELECT DISTINCT companyId FROM employees WHERE CAST(REGEXP_REPLACE(codigoInterno, '[^0-9]', '') AS UNSIGNED) IN (13, 17, 22, 24, 69, 171, 666)`);
  
  for (const comp of companies) {
    const companyId = comp.companyId;
    console.log(`\n=== Empresa ID: ${companyId} ===`);
    
    // Buscar TODOS os funcionários desta empresa (incluindo deletados para evitar conflitos de unique)
    const [allEmps] = await conn.execute(`
      SELECT id, codigoInterno, nomeCompleto,
        CAST(REGEXP_REPLACE(codigoInterno, '[^0-9]', '') AS UNSIGNED) as numPart,
        REGEXP_REPLACE(codigoInterno, '[0-9]', '') as prefixo
      FROM employees 
      WHERE companyId = ?
      ORDER BY numPart ASC
    `, [companyId]);
    
    const prefixo = allEmps[0]?.prefixo || 'EMP';
    
    // Encontrar o maior número usado
    const maxNum = Math.max(...allEmps.map(e => e.numPart));
    
    // Funcionários com números proibidos nesta empresa
    const proibidos = allEmps.filter(e => NUMEROS_PROIBIDOS.has(e.numPart));
    
    if (proibidos.length === 0) continue;
    
    // Todos os números em uso (incluindo deletados)
    const usados = new Set(allEmps.map(e => e.numPart));
    
    // Para cada funcionário com número proibido, atribuir um número ACIMA do máximo
    // Isso garante que não haverá conflito
    let nextFree = maxNum + 1;
    
    for (const emp of proibidos) {
      // Pular números proibidos
      while (NUMEROS_PROIBIDOS.has(nextFree)) nextFree++;
      
      const novoCodigo = prefixo + String(nextFree).padStart(3, '0');
      console.log(`  ${emp.codigoInterno} (${emp.nomeCompleto}) -> ${novoCodigo}`);
      
      await conn.execute(`UPDATE employees SET codigoInterno = ? WHERE id = ?`, [novoCodigo, emp.id]);
      
      nextFree++;
    }
  }
  
  // Verificar resultado
  const [remaining] = await conn.execute(`
    SELECT codigoInterno, nomeCompleto FROM employees 
    WHERE CAST(REGEXP_REPLACE(codigoInterno, '[^0-9]', '') AS UNSIGNED) IN (13, 17, 22, 24, 69, 171, 666)
  `);
  
  if (remaining.length === 0) {
    console.log('\n✅ Todos os funcionários com números proibidos foram renumerados com sucesso!');
  } else {
    console.log(`\n⚠️  Ainda restam ${remaining.length} funcionários com números proibidos:`);
    console.table(remaining);
  }
  
  await conn.end();
}

main().catch(console.error);
