import fs from 'fs';
import path from 'path';

const files = [
  'client/src/pages/CipaCompleta.tsx',
  'client/src/pages/avaliacao/AvalAuditoria.tsx',
  'client/src/pages/avaliacao/AvalAvaliadores.tsx',
  'client/src/pages/avaliacao/AvalPesquisas.tsx',
];

let totalFixed = 0;

for (const filePath of files) {
  const fullPath = path.join('/home/ubuntu/erp-rh-fc', filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP: ${filePath} not found`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;
  
  if (content.includes('removeAccents') || content.includes('matchSearch')) {
    console.log(`SKIP: ${filePath} already has accent-insensitive search`);
    continue;
  }
  
  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ') || lines[i].startsWith('} from ')) {
      lastImportIdx = i;
    }
    if (i > 0 && !lines[i].startsWith('import ') && !lines[i].startsWith('} from ') && 
        !lines[i].trim().startsWith('//') && lines[i].trim() !== '' && !lines[i].startsWith('const ') &&
        lastImportIdx > 0) {
      break;
    }
  }
  
  if (lastImportIdx === -1) {
    console.log(`SKIP: ${filePath} no imports found`);
    continue;
  }
  
  lines.splice(lastImportIdx + 1, 0, 'import { removeAccents } from "@/lib/searchUtils";');
  content = lines.join('\n');
  
  // Replace search patterns
  content = content.replace(/const s = (\w+)\.toLowerCase\(\);/g, 'const s = removeAccents($1);');
  content = content.replace(/const term = (\w+)\.toLowerCase\(\);/g, 'const term = removeAccents($1);');
  content = content.replace(/const q = (\w+)\.toLowerCase\(\);/g, 'const q = removeAccents($1);');
  content = content.replace(/(\w+(?:\.\w+)*)\?\.toLowerCase\(\)\.includes\((\w+)\)/g, 
    'removeAccents($1 || \'\').includes($2)');
  content = content.replace(/(\w+(?:\.\w+)*)\.toLowerCase\(\)\.includes\((\w+)\)/g, 
    'removeAccents($1 || \'\').includes($2)');
  content = content.replace(/\.includes\((\w+)\.toLowerCase\(\)\)/g, '.includes(removeAccents($1))');
  
  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    totalFixed++;
    console.log(`FIXED: ${filePath}`);
  } else {
    console.log(`NO CHANGE: ${filePath}`);
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
