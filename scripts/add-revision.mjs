import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Get latest revision
const [rows] = await connection.execute('SELECT version, titulo FROM system_revisions ORDER BY version DESC LIMIT 1');
console.log('Latest revision:', rows[0]);

const nextVersion = rows[0].version + 1;

// Insert new revision
await connection.execute(
  `INSERT INTO system_revisions (version, titulo, descricao, tipo, modulos, criadoPor) VALUES (?, ?, ?, ?, ?, ?)`,
  [
    nextVersion,
    'Drill-down interativo nos gráficos de Aviso Prévio',
    'Gráficos "Avisos por Setor" e "Top 10 Funções com Avisos" no Dashboard de Aviso Prévio agora são clicáveis. Ao clicar em uma barra, abre um dialog detalhado com a lista de todos os funcionários daquela função/setor, mostrando nome, tipo de aviso, dias, redução de jornada, datas e valor estimado da rescisão. Inclui totalização do valor por grupo.',
    'feature',
    JSON.stringify(['Dashboard Aviso Prévio', 'DashChart']),
    'Sistema'
  ]
);

console.log(`Revision ${nextVersion} inserted successfully`);
await connection.end();
