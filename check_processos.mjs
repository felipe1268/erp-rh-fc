import { createPool } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = createPool(process.env.DATABASE_URL);
const [rows] = await pool.query('SELECT companyId, id, numeroProcesso, valorCausa FROM processos_trabalhistas LIMIT 5');
console.log(JSON.stringify(rows, null, 2));

const [companies] = await pool.query('SELECT id, nomeFantasia FROM companies');
console.log('Companies:', JSON.stringify(companies, null, 2));

await pool.end();
