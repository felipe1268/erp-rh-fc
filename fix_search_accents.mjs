import fs from 'fs';
import path from 'path';

// Files that have client-side search with toLowerCase
const files = [
  'client/src/pages/Auditoria.tsx',
  'client/src/pages/AvisoPrevio.tsx',
  'client/src/pages/Configuracoes.tsx',
  'client/src/pages/ContasBancarias.tsx',
  'client/src/pages/ControleDocumentos.tsx',
  'client/src/pages/Epis.tsx',
  'client/src/pages/FechamentoPonto.tsx',
  'client/src/pages/Feriados.tsx',
  'client/src/pages/Ferias.tsx',
  'client/src/pages/Funcoes.tsx',
  'client/src/pages/Lixeira.tsx',
  'client/src/pages/ModuloPJ.tsx',
  'client/src/pages/Obras.tsx',
  'client/src/pages/RelogiosPonto.tsx',
  'client/src/pages/Setores.tsx',
  'client/src/pages/Usuarios.tsx',
  'client/src/pages/ValeAlimentacao.tsx',
  'client/src/pages/relatorios/RaioXPage.tsx',
  'client/src/pages/avaliacao/RaioXFuncionario.tsx',
  'client/src/pages/avaliacao/EvaluatorPanel.tsx',
  'client/src/pages/avaliacao/AvalAvaliacoes.tsx',
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
  
  // Check if already has removeAccents or matchSearch import
  if (content.includes('removeAccents') || content.includes('matchSearch')) {
    console.log(`SKIP: ${filePath} already has accent-insensitive search`);
    continue;
  }
  
  // Add import for removeAccents
  // Find the last import line
  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ') || lines[i].startsWith('} from ')) {
      lastImportIdx = i;
    }
    // Stop at first non-import, non-empty line that's not a comment
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
  
  // Insert import after last import
  lines.splice(lastImportIdx + 1, 0, 'import { removeAccents } from "@/lib/searchUtils";');
  content = lines.join('\n');
  
  // Replace patterns like:
  // const s = search.toLowerCase();  →  const s = removeAccents(search);
  // .toLowerCase().includes(s)  →  keep as is since s is already normalized
  // But we need to also normalize the field values
  
  // Pattern 1: const s = someVar.toLowerCase();
  content = content.replace(/const s = (\w+)\.toLowerCase\(\);/g, 'const s = removeAccents($1);');
  
  // Pattern 2: const term = someVar.toLowerCase();
  content = content.replace(/const term = (\w+)\.toLowerCase\(\);/g, 'const term = removeAccents($1);');
  
  // Pattern 3: const q = someVar.toLowerCase();
  content = content.replace(/const q = (\w+)\.toLowerCase\(\);/g, 'const q = removeAccents($1);');
  
  // Pattern 4: .toLowerCase().includes(s) → use removeAccents
  // e.field?.toLowerCase().includes(s) → removeAccents(e.field || '').includes(s)
  content = content.replace(/(\w+(?:\.\w+)*)\?\.toLowerCase\(\)\.includes\((\w+)\)/g, 
    'removeAccents($1 || \'\').includes($2)');
  
  // Pattern 5: field.toLowerCase().includes(term)
  content = content.replace(/(\w+(?:\.\w+)*)\.toLowerCase\(\)\.includes\((\w+)\)/g, 
    'removeAccents($1 || \'\').includes($2)');
  
  // Pattern 6: .includes(searchTerm.toLowerCase()) → .includes(removeAccents(searchTerm))
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
