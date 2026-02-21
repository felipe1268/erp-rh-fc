import { PDFParse } from 'pdf-parse';
import fs from 'fs';

const files = fs.readdirSync('/home/ubuntu/upload/').filter(f => f.endsWith('.pdf'));
if (files.length > 0) {
  const buf = fs.readFileSync('/home/ubuntu/upload/' + files[0]);
  const uint8 = new Uint8Array(buf);
  console.log('Testing with file:', files[0], 'size:', uint8.length);
  
  const p = new PDFParse(uint8, {verbosity: 0});
  
  const loaded = await p.load();
  console.log('Pages:', loaded.numPages);
  
  const textResult = await p.getText();
  console.log('getText type:', typeof textResult);
  
  if (typeof textResult === 'object' && textResult !== null) {
    console.log('Keys:', Object.keys(textResult));
    if (textResult.text) {
      console.log('First 500 chars:', textResult.text.substring(0, 500));
    } else if (textResult.pages) {
      console.log('Pages:', textResult.pages.length);
      console.log('First page text:', JSON.stringify(textResult.pages[0]).substring(0, 500));
    } else {
      console.log('Full result:', JSON.stringify(textResult).substring(0, 500));
    }
  } else {
    console.log('Text result (first 500):', String(textResult).substring(0, 500));
  }
}
