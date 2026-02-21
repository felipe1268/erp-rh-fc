import { PDFParse } from 'pdf-parse';
import fs from 'fs';

async function extractText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse(uint8);
  await parser.load();
  const result = await parser.getText();
  return result.text;
}

// Test with the real PDFs
const files = [
  '/home/ubuntu/upload/006-EspelhoResumoAdiantamentoJaneiro-ANALITICO-CONTABILIDADE.pdf',
  '/home/ubuntu/upload/007-AdiantamentoJaneiro-SINTETICO-CONTABILIDADE.pdf',
];

for (const f of files) {
  console.log('\n' + '='.repeat(80));
  console.log('FILE:', f.split('/').pop());
  console.log('='.repeat(80));
  try {
    const text = await extractText(f);
    // Show first 3000 chars
    console.log(text.substring(0, 3000));
    console.log('\n... (total length:', text.length, 'chars)');
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}
