import fs from 'fs';
import path from 'path';

// Test the importarFolhaAuto endpoint directly
const BASE_URL = 'http://localhost:3000';

// Read the PDFs
const pdf006 = fs.readFileSync('/home/ubuntu/upload/006-EspelhoResumoAdiantamentoJaneiro-ANALITICO-CONTABILIDADE.pdf');
const pdf007 = fs.readFileSync('/home/ubuntu/upload/007-AdiantamentoJaneiro-SINTETICO-CONTABILIDADE.pdf');

// Convert to base64
const pdf006Base64 = pdf006.toString('base64');
const pdf007Base64 = pdf007.toString('base64');

// Get company ID for FC Engenharia
const mysql = await import('mysql2/promise');
const conn = await mysql.createConnection(process.env.DATABASE_URL || 'mysql://root:@localhost:3306/test');
const [rows] = await conn.execute("SELECT id FROM companies WHERE name LIKE '%FC ENGENHARIA%' LIMIT 1");
const companyId = rows[0]?.id;
console.log('Company ID:', companyId);

if (!companyId) {
  console.error('FC Engenharia not found');
  process.exit(1);
}

// First, get a valid session cookie by checking if we can call the API
// We'll call the tRPC endpoint directly
const payload = {
  json: {
    companyId: companyId,
    mesAno: '2026-01',
    tipoLancamento: 'vale',
    arquivos: [
      { nome: '006-EspelhoResumoAdiantamentoJaneiro-ANALITICO-CONTABILIDADE.pdf', base64: pdf006Base64 },
      { nome: '007-AdiantamentoJaneiro-SINTETICO-CONTABILIDADE.pdf', base64: pdf007Base64 }
    ]
  }
};

console.log('Sending request to importarFolhaAuto...');
console.log('Payload size:', JSON.stringify(payload).length, 'bytes');
console.log('PDF 006 base64 length:', pdf006Base64.length);
console.log('PDF 007 base64 length:', pdf007Base64.length);

try {
  const resp = await fetch(`${BASE_URL}/api/trpc/folhaPagamento.importarFolhaAuto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // We need auth - get from browser cookie
      'Cookie': 'session=test'
    },
    body: JSON.stringify(payload)
  });
  
  const text = await resp.text();
  console.log('Status:', resp.status);
  console.log('Response:', text.substring(0, 2000));
} catch (err) {
  console.error('Error:', err.message);
}

await conn.end();
