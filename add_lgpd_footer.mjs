import { readFileSync, writeFileSync } from 'fs';

// All files that use PrintHeader or PrintActions (have print functionality)
const files = [
  'client/src/pages/Auditoria.tsx',
  'client/src/pages/AvisoPrevio.tsx',
  'client/src/pages/BibliotecaConhecimento.tsx',
  'client/src/pages/Colaboradores.tsx',
  'client/src/pages/Configuracoes.tsx',
  'client/src/pages/ContasBancarias.tsx',
  'client/src/pages/ContratoPJView.tsx',
  'client/src/pages/ControleDocumentos.tsx',
  'client/src/pages/Empresas.tsx',
  'client/src/pages/Epis.tsx',
  'client/src/pages/FechamentoPonto.tsx',
  'client/src/pages/FolhaPagamento.tsx',
  'client/src/pages/Funcoes.tsx',
  'client/src/pages/Home.tsx',
  'client/src/pages/ModuloPJ.tsx',
  'client/src/pages/ObraEfetivo.tsx',
  'client/src/pages/Obras.tsx',
  'client/src/pages/ProcessosTrabalhistas.tsx',
  'client/src/pages/RelogiosPonto.tsx',
  'client/src/pages/Revisoes.tsx',
  'client/src/pages/Setores.tsx',
  'client/src/pages/Usuarios.tsx',
  'client/src/pages/ValeAlimentacao.tsx',
  'client/src/pages/avaliacao/RaioXFuncionario.tsx',
  'client/src/pages/dashboards/DashAvisoPrevio.tsx',
  'client/src/pages/dashboards/DashCartaoPonto.tsx',
  'client/src/pages/dashboards/DashEfetivoObra.tsx',
  'client/src/pages/dashboards/DashEpis.tsx',
  'client/src/pages/dashboards/DashFerias.tsx',
  'client/src/pages/dashboards/DashFolhaPagamento.tsx',
  'client/src/pages/dashboards/DashFuncionarios.tsx',
  'client/src/pages/dashboards/DashHorasExtras.tsx',
  'client/src/pages/dashboards/DashJuridico.tsx',
  'client/src/pages/dashboards/DashPerfilTempoCasa.tsx',
];

let modified = 0;
let skipped = 0;
let errors = 0;

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf-8');
    
    // Skip if already has PrintFooterLGPD
    if (content.includes('PrintFooterLGPD')) {
      console.log(`SKIP (already has): ${file}`);
      skipped++;
      continue;
    }
    
    // Add import - find the last import line and add after it
    const importLine = 'import PrintFooterLGPD from "@/components/PrintFooterLGPD";';
    
    // Find a good place to add the import
    // Look for existing PrintHeader or PrintActions import
    if (content.includes('import PrintHeader')) {
      content = content.replace(
        /import PrintHeader from [^\n]+\n/,
        (match) => match + importLine + '\n'
      );
    } else if (content.includes('import PrintActions')) {
      content = content.replace(
        /import PrintActions from [^\n]+\n/,
        (match) => match + importLine + '\n'
      );
    } else {
      // Add after the first import block
      const lines = content.split('\n');
      let lastImportIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ') || lines[i].startsWith('import{')) {
          lastImportIdx = i;
        }
      }
      lines.splice(lastImportIdx + 1, 0, importLine);
      content = lines.join('\n');
    }
    
    // Add <PrintFooterLGPD /> before the last closing tag of the component
    // Strategy: find the last </DashboardLayout> or last closing fragment </> or last </div>
    // and add PrintFooterLGPD before it
    
    // Try to find the closing DashboardLayout tag
    if (content.includes('</DashboardLayout>')) {
      // Add before the LAST </DashboardLayout>
      const lastIdx = content.lastIndexOf('</DashboardLayout>');
      content = content.slice(0, lastIdx) + '      <PrintFooterLGPD />\n    ' + content.slice(lastIdx);
    } else if (content.includes('return (')) {
      // For components without DashboardLayout, add before the last closing tag
      // Find the return statement and its last closing tag
      const returnIdx = content.lastIndexOf('return (');
      if (returnIdx !== -1) {
        // Find the matching closing paren/tag
        const afterReturn = content.slice(returnIdx);
        
        // Try to find closing fragment
        if (afterReturn.includes('</>')) {
          const fragIdx = returnIdx + afterReturn.lastIndexOf('</>');
          content = content.slice(0, fragIdx) + '      <PrintFooterLGPD />\n    ' + content.slice(fragIdx);
        }
      }
    }
    
    writeFileSync(file, content);
    console.log(`OK: ${file}`);
    modified++;
  } catch (err) {
    console.log(`ERROR: ${file} - ${err.message}`);
    errors++;
  }
}

console.log(`\nDone: ${modified} modified, ${skipped} skipped, ${errors} errors`);
