import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== LIMPEZA DE DUPLICADOS ===\n");

// 1. Duplicados por CPF (exceto 000.000)
const [cpfDups] = await conn.execute(`
  SELECT cpf, GROUP_CONCAT(id ORDER BY id) as ids, 
    GROUP_CONCAT(nomeCompleto ORDER BY id SEPARATOR ' | ') as nomes,
    GROUP_CONCAT(companyId ORDER BY id) as companies
  FROM employees 
  WHERE cpf IS NOT NULL AND cpf != '' AND cpf NOT LIKE '000.000%'
  GROUP BY cpf 
  HAVING COUNT(*) > 1
`);

let removedCpf = 0;
for (const dup of cpfDups) {
  const ids = dup.ids.split(',').map(Number);
  // Manter o primeiro (mais antigo), remover os demais
  const keepId = ids[0];
  const removeIds = ids.slice(1);
  console.log(`CPF ${dup.cpf}: mantendo id=${keepId}, removendo ids=[${removeIds.join(',')}] (${dup.nomes})`);
  for (const rid of removeIds) {
    await conn.execute('DELETE FROM employees WHERE id = ?', [rid]);
    removedCpf++;
  }
}
console.log(`\nRemovidos por CPF duplicado: ${removedCpf}`);

// 2. Duplicados por nome+nascimento onde um tem CPF 000.000 e outro tem CPF real
const [nameDups] = await conn.execute(`
  SELECT nomeCompleto, dataNascimento, 
    GROUP_CONCAT(id ORDER BY id) as ids,
    GROUP_CONCAT(cpf ORDER BY id SEPARATOR '||') as cpfs,
    GROUP_CONCAT(companyId ORDER BY id) as companies
  FROM employees 
  WHERE nomeCompleto IS NOT NULL AND nomeCompleto != ''
  GROUP BY nomeCompleto, dataNascimento
  HAVING COUNT(*) > 1
`);

let removedName = 0;
for (const dup of nameDups) {
  const ids = dup.ids.split(',').map(Number);
  const cpfs = dup.cpfs.split('||');
  
  // Se um tem CPF 000.000 e outro tem CPF real, manter o com CPF real
  const realCpfIdx = cpfs.findIndex(c => !c.startsWith('000.000'));
  const fakeCpfIdx = cpfs.findIndex(c => c.startsWith('000.000'));
  
  if (realCpfIdx >= 0 && fakeCpfIdx >= 0) {
    const keepId = ids[realCpfIdx];
    const removeId = ids[fakeCpfIdx];
    console.log(`Nome "${dup.nomeCompleto}": mantendo id=${keepId} (CPF ${cpfs[realCpfIdx]}), removendo id=${removeId} (CPF ${cpfs[fakeCpfIdx]})`);
    await conn.execute('DELETE FROM employees WHERE id = ?', [removeId]);
    removedName++;
  }
}
console.log(`\nRemovidos por nome duplicado (CPF fake vs real): ${removedName}`);

// 3. Verificação final
const [total] = await conn.execute('SELECT COUNT(*) as total FROM employees');
const [zeros] = await conn.execute(`SELECT COUNT(*) as qtd FROM employees WHERE cpf LIKE '000.000%'`);
console.log(`\n=== RESULTADO FINAL ===`);
console.log(`Total de funcionários: ${total[0].total}`);
console.log(`CPFs com 000.000 restantes: ${zeros[0].qtd}`);
console.log(`Total removidos: ${removedCpf + removedName}`);

await conn.end();
