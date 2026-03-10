import fs from 'fs';
import mysql from 'mysql2/promise';

// Read the pasted_content.txt file
const content = fs.readFileSync('/home/ubuntu/upload/pasted_content.txt', 'utf-8');
const lines = content.split('\n');

// Parse ASO data starting from line 12 (0-indexed: line 11)
const asoData = [];
for (let i = 11; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  
  const num = parseInt(parts[0]);
  if (isNaN(num)) continue;
  
  const nome = (parts[1] || '').trim();
  const tipo = (parts[2] || '').trim();
  const dataEmissao = (parts[3] || '').trim();
  const validadeDias = parseInt(parts[4]) || 365;
  const statusAso = (parts[5] || '').trim();
  const dataVencimento = (parts[6] || '').trim();
  const resultado = (parts[7] || '').trim();
  const medico = (parts[8] || '').trim();
  const crm = (parts[9] || '').trim();
  const jaAtualizou = (parts[10] || '').trim();
  const exames = (parts[11] || '').trim();
  
  if (!nome) continue;
  
  asoData.push({
    num, nome, tipo, dataEmissao, validadeDias, statusAso,
    dataVencimento, resultado, medico, crm, jaAtualizou, exames
  });
}

console.log(`Parsed ${asoData.length} ASO records`);

// Connect to database
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

// Get employees from company 60002 (FC ENGENHARIA)
const [employees] = await conn.execute(
  'SELECT id, nomeCompleto FROM employees WHERE companyId = 60002'
);
console.log(`Found ${employees.length} employees in FC ENGENHARIA`);

// Build name lookup (normalize: uppercase, trim, remove extra spaces)
function normalize(name) {
  return name.toUpperCase().replace(/\s+/g, ' ').trim();
}

const nameMap = {};
for (const emp of employees) {
  nameMap[normalize(emp.nomeCompleto)] = emp.id;
}

// Parse date dd/mm/yyyy to yyyy-mm-dd
function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Map tipo to standard values
function mapTipo(tipo) {
  if (!tipo) return null;
  const t = tipo.toLowerCase().trim();
  if (t.includes('admissional')) return 'Admissional';
  if (t.includes('periódico') || t.includes('periodico')) return 'Periódico';
  if (t.includes('retorno')) return 'Retorno ao trabalho';
  if (t.includes('mudança') || t.includes('mudanca')) return 'Mudança de função';
  if (t.includes('demissional')) return 'Demissional';
  return tipo;
}

let imported = 0;
let notFound = 0;
let skipped = 0;

for (const aso of asoData) {
  // Skip records without tipo (no ASO data)
  if (!aso.tipo) {
    skipped++;
    continue;
  }
  
  // Find employee
  const normalizedName = normalize(aso.nome);
  let employeeId = nameMap[normalizedName];
  
  // Fuzzy match if not found
  if (!employeeId) {
    const nameParts = normalizedName.split(' ');
    for (const [empName, empId] of Object.entries(nameMap)) {
      // Match first and last name
      const empParts = empName.split(' ');
      if (nameParts[0] === empParts[0] && nameParts[nameParts.length - 1] === empParts[empParts.length - 1]) {
        employeeId = empId;
        break;
      }
    }
  }
  
  if (!employeeId) {
    console.log(`NOT FOUND: ${aso.nome}`);
    notFound++;
    continue;
  }
  
  const dataExame = parseDate(aso.dataEmissao);
  const dataVencimento = parseDate(aso.dataVencimento);
  const tipo = mapTipo(aso.tipo);
  
  try {
    await conn.execute(
      `INSERT INTO asos (companyId, employeeId, tipo, dataExame, validadeDias, dataValidade, resultado, medico, crm, jaAtualizou, examesRealizados, observacoes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        60002,
        employeeId,
        tipo,
        dataExame,
        aso.validadeDias || 365,
        dataVencimento,
        aso.resultado || 'Apto',
        aso.medico || null,
        aso.crm || null,
        aso.jaAtualizou === 'Sim' ? 1 : 0,
        aso.exames || null,
        null
      ]
    );
    imported++;
  } catch (err) {
    console.error(`Error inserting ASO for ${aso.nome}: ${err.message}`);
  }
}

console.log(`\n=== RESULTADO ===`);
console.log(`Importados: ${imported}`);
console.log(`Sem ASO (pulados): ${skipped}`);
console.log(`Não encontrados: ${notFound}`);
console.log(`Total processados: ${asoData.length}`);

await conn.end();
