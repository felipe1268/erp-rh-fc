import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Find all tsx files with the broken pattern
const result = execSync(
  `grep -rl 'import {' client/src/pages/ 2>/dev/null || true`,
  { cwd: '/home/ubuntu/erp-rh-fc', encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

let fixed = 0;

for (const relPath of result) {
  const fullPath = path.join('/home/ubuntu/erp-rh-fc', relPath);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;
  
  // Fix pattern: "import {\nimport { removeAccents } from "@/lib/searchUtils";\n  SomeIcon," 
  // Should be: "import { removeAccents } from "@/lib/searchUtils";\nimport {\n  SomeIcon,"
  const brokenPattern = /import \{\nimport \{ removeAccents \} from "@\/lib\/searchUtils";\n/g;
  if (brokenPattern.test(content)) {
    content = content.replace(brokenPattern, 'import { removeAccents } from "@/lib/searchUtils";\nimport {\n');
    fs.writeFileSync(fullPath, content);
    fixed++;
    console.log(`FIXED: ${relPath}`);
  }
}

// Also check for the same pattern in ModuloPJ.tsx and other files where the import was inserted in wrong place
const allTsx = execSync(
  `find client/src/pages -name "*.tsx" -type f`,
  { cwd: '/home/ubuntu/erp-rh-fc', encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

for (const relPath of allTsx) {
  const fullPath = path.join('/home/ubuntu/erp-rh-fc', relPath);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  let changed = false;
  
  // Check for duplicate removeAccents imports
  const removeAccentsLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('removeAccents') && lines[i].includes('import')) {
      removeAccentsLines.push(i);
    }
  }
  
  if (removeAccentsLines.length > 1) {
    // Keep only the first one
    for (let j = 1; j < removeAccentsLines.length; j++) {
      lines.splice(removeAccentsLines[j], 1);
      changed = true;
    }
  }
  
  // Check for "import {" immediately followed by "import" on next line (broken multi-line import)
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === 'import {' && lines[i + 1].trim().startsWith('import {')) {
      // The "import {" is orphaned - it was part of a multi-line import that got broken
      // Move the removeAccents import before this line and fix the multi-line import
      const removeAccentsImport = lines[i + 1].trim();
      lines[i + 1] = ''; // Remove the misplaced import
      // Insert it before the "import {"
      lines.splice(i, 0, removeAccentsImport);
      changed = true;
      break;
    }
  }
  
  if (changed) {
    fs.writeFileSync(fullPath, lines.filter((l, i, arr) => {
      // Remove consecutive empty lines
      if (l.trim() === '' && i > 0 && arr[i - 1].trim() === '') return false;
      return true;
    }).join('\n'));
    fixed++;
    console.log(`FIXED (pass2): ${relPath}`);
  }
}

console.log(`\nTotal files fixed: ${fixed}`);
