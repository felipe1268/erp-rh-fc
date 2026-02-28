import fs from 'fs';

const files = [
  'client/src/pages/Ferias.tsx',
  'client/src/pages/SolicitacaoHE.tsx',
  'client/src/pages/PainelJuridico.tsx',
  'client/src/pages/CipaCompleta.tsx',
  'client/src/pages/PainelSST.tsx',
  'client/src/pages/PainelRH.tsx',
  'client/src/pages/AvaliacaoDesempenho.tsx',
  'client/src/pages/Lixeira.tsx',
  'client/src/pages/dashboards/DashboardIndex.tsx',
  'client/src/pages/dashboards/VisaoPanoramica.tsx',
  'client/src/pages/relatorios/RaioXPage.tsx',
];

const basePath = '/home/ubuntu/erp-rh-fc/';

for (const relPath of files) {
  const fullPath = basePath + relPath;
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Already has PrintFooterLGPD?
  if (content.includes('PrintFooterLGPD')) {
    console.log(`SKIP (already has): ${relPath}`);
    continue;
  }
  
  // Add import
  const importLine = 'import PrintFooterLGPD from "@/components/PrintFooterLGPD";';
  
  if (content.includes('import DashboardLayout from')) {
    content = content.replace(
      /import DashboardLayout from [^\n]+\n/,
      (match) => match + importLine + '\n'
    );
  } else {
    // Add after the first import
    const lines = content.split('\n');
    let lastImportIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) lastImportIdx = i;
    }
    lines.splice(lastImportIdx + 1, 0, importLine);
    content = lines.join('\n');
  }
  
  // Add <PrintFooterLGPD /> before </DashboardLayout>
  const lastIdx = content.lastIndexOf('</DashboardLayout>');
  if (lastIdx === -1) {
    console.log(`SKIP (no DashboardLayout closing): ${relPath}`);
    continue;
  }
  
  content = content.slice(0, lastIdx) + '<PrintFooterLGPD />\n    ' + content.slice(lastIdx);
  
  fs.writeFileSync(fullPath, content);
  console.log(`FIXED: ${relPath}`);
}
