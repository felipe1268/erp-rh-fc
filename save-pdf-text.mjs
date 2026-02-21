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

const text006 = await extractText('/home/ubuntu/upload/006-EspelhoResumoAdiantamentoJaneiro-ANALITICO-CONTABILIDADE.pdf');
fs.writeFileSync('/home/ubuntu/erp-rh-fc/pdf006-text.txt', text006);
console.log('006 saved:', text006.length, 'chars');

const text007 = await extractText('/home/ubuntu/upload/007-AdiantamentoJaneiro-SINTETICO-CONTABILIDADE.pdf');
fs.writeFileSync('/home/ubuntu/erp-rh-fc/pdf007-text.txt', text007);
console.log('007 saved:', text007.length, 'chars');
