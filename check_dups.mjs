import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Duplicados por CPF
const [cpfDups] = await conn.execute(`
  SELECT cpf, COUNT(*) as qtd, 
    GROUP_CONCAT(id ORDER BY id) as ids, 
    GROUP_CONCAT(nomeCompleto ORDER BY id SEPARATOR ' | ') as nomes,
    GROUP_CONCAT(status ORDER BY id) as statuses,
    GROUP_CONCAT(companyId ORDER BY id) as companies
  FROM employees 
  WHERE cpf IS NOT NULL AND cpf != '' AND cpf NOT LIKE '000.000%'
  GROUP BY cpf 
  HAVING COUNT(*) > 1 
  ORDER BY qtd DESC
`);
console.log("=== DUPLICADOS POR CPF ===");
console.log(JSON.stringify(cpfDups, null, 2));

// Duplicados por nome+nascimento
const [nameDups] = await conn.execute(`
  SELECT nomeCompleto, dataNascimento, COUNT(*) as qtd,
    GROUP_CONCAT(id ORDER BY id) as ids,
    GROUP_CONCAT(cpf ORDER BY id SEPARATOR ' | ') as cpfs,
    GROUP_CONCAT(status ORDER BY id) as statuses,
    GROUP_CONCAT(companyId ORDER BY id) as companies
  FROM employees 
  WHERE nomeCompleto IS NOT NULL AND nomeCompleto != ''
  GROUP BY nomeCompleto, dataNascimento
  HAVING COUNT(*) > 1
  ORDER BY qtd DESC
`);
console.log("\n=== DUPLICADOS POR NOME+NASCIMENTO ===");
console.log(JSON.stringify(nameDups, null, 2));

// Total
const [total] = await conn.execute('SELECT COUNT(*) as total FROM employees');
console.log("\nTotal de funcionários:", total[0].total);

// CPFs com 000.000
const [zeros] = await conn.execute(`SELECT COUNT(*) as qtd FROM employees WHERE cpf LIKE '000.000%'`);
console.log("CPFs com 000.000:", zeros[0].qtd);

await conn.end();
