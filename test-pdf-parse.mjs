import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.default || pdfParseModule;

const buf006 = fs.readFileSync('/home/ubuntu/upload/006-EspelhoResumoAdiantamentoJaneiro-ANALITICO-CONTABILIDADE.pdf');
const buf007 = fs.readFileSync('/home/ubuntu/upload/007-AdiantamentoJaneiro-SINTETICO-CONTABILIDADE.pdf');

async function main() {
  console.log("=== PDF 006 (ANALÍTICO) - Primeiras 120 linhas ===");
  const d006 = await pdfParse(buf006);
  const lines006 = d006.text.split('\n');
  lines006.slice(0, 120).forEach((l, i) => console.log(`${i}: [${l}]`));
  console.log(`\nTotal linhas 006: ${lines006.length}`);

  console.log("\n\n=== PDF 007 (SINTÉTICO) - Primeiras 80 linhas ===");
  const d007 = await pdfParse(buf007);
  const lines007 = d007.text.split('\n');
  lines007.slice(0, 80).forEach((l, i) => console.log(`${i}: [${l}]`));
  console.log(`\nTotal linhas 007: ${lines007.length}`);
}

main().catch(console.error);
