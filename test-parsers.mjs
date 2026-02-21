import { execSync, spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function extractTextFromPDF(filePath) {
  const txtPath = filePath.replace('.pdf', '.txt');
  execSync(`pdftotext -layout "${filePath}" "${txtPath}"`, { timeout: 30000 });
  const text = readFileSync(txtPath, 'utf-8');
  try { unlinkSync(txtPath); } catch {}
  return text;
}

function normalizeNome(nome) {
  return nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ");
}

// ============================================================
// PARSER: PDF Analítico (006)
// ============================================================
function parseAnaliticoPDF(text) {
  const lines = text.split("\n");
  const results = [];
  let current = null;
  let pendingNameContinuation = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("Espelho e resumo") || trimmed.startsWith("Empresa:") ||
        trimmed.startsWith("Adiantamento em:") || trimmed.startsWith("NOME DO COLABORADOR") ||
        trimmed.startsWith("PROVENTOS") || trimmed.startsWith("SCI Novo Visual") ||
        trimmed.match(/^Página:/) || trimmed.startsWith("Guaratinguetá") ||
        trimmed.includes("CNPJ:") || trimmed.startsWith("Folha de pagamento")) {
      continue;
    }

    // Employee header: "codigo NOME   SF  IR   Admissão em DD/MM/YYYY Salário base XX,XX Horas mensais: 220,00"
    const headerMatch = trimmed.match(/^(\d{1,4})\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+?)\s+(\d+)\s+(\d+)\s+Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
    if (headerMatch) {
      if (current) results.push(current);
      current = {
        codigo: headerMatch[1].trim(),
        nome: headerMatch[2].trim(),
        sf: parseInt(headerMatch[3]),
        ir: parseInt(headerMatch[4]),
        dataAdmissao: headerMatch[5],
        salarioBase: headerMatch[6],
        horasMensais: headerMatch[7],
        proventos: [],
        descontos: [],
        totalProventos: "0",
        totalDescontos: "0",
        baseInss: "0", valorInss: "0",
        baseFgts: "0", valorFgts: "0",
        baseIrrf: "0", valorIrrf: "0",
        liquido: "0",
      };
      // Check if next line is a name continuation
      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        if (nextTrimmed.match(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]*$/) && nextTrimmed.length >= 2 && nextTrimmed.length <= 40 &&
            !nextTrimmed.match(/^(Folha|Base|Total|PROVENTOS|DESCONTOS|Admiss|SCI|Espelho|Empresa)/) &&
            !nextTrimmed.match(/^\d{5}/)) {
          current.nome = current.nome + " " + nextTrimmed;
          i++;
        }
      }
      pendingNameContinuation = false;
      continue;
    }

    // Partial header (name split across lines)
    const partialHeaderMatch = trimmed.match(/^(\d{1,4})\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+?)\s+(\d+)\s+(\d+)\s*$/);
    if (partialHeaderMatch && partialHeaderMatch[2].length > 3) {
      if (current) results.push(current);
      current = {
        codigo: partialHeaderMatch[1].trim(),
        nome: partialHeaderMatch[2].trim(),
        sf: parseInt(partialHeaderMatch[3]),
        ir: parseInt(partialHeaderMatch[4]),
        dataAdmissao: "",
        salarioBase: "",
        horasMensais: "",
        proventos: [],
        descontos: [],
        totalProventos: "0",
        totalDescontos: "0",
        baseInss: "0", valorInss: "0",
        baseFgts: "0", valorFgts: "0",
        baseIrrf: "0", valorIrrf: "0",
        liquido: "0",
      };
      pendingNameContinuation = true;
      continue;
    }

    // Name continuation
    if (pendingNameContinuation && current) {
      const contMatch = trimmed.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]*?)\s+Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
      if (contMatch) {
        current.nome = current.nome + " " + contMatch[1].trim();
        current.dataAdmissao = contMatch[2];
        current.salarioBase = contMatch[3];
        current.horasMensais = contMatch[4];
        pendingNameContinuation = false;
        continue;
      }
      const admOnly = trimmed.match(/Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
      if (admOnly) {
        current.dataAdmissao = admOnly[1];
        current.salarioBase = admOnly[2];
        current.horasMensais = admOnly[3];
        pendingNameContinuation = false;
        continue;
      }
      const nameOnly = trimmed.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+)$/);
      if (nameOnly && nameOnly[1].length > 2 && !nameOnly[1].match(/^(Folha|Base|Total|PROVENTOS|DESCONTOS)/)) {
        current.nome = current.nome + " " + nameOnly[1].trim();
        continue;
      }
    }

    if (!current) continue;

    // Total de proventos
    const provTotalMatch = trimmed.match(/Total\s+de\s+proventos\s*-?\s*>\s*([\d.,]+)/);
    if (provTotalMatch) {
      current.totalProventos = provTotalMatch[1];
      const descTotalSameLine = trimmed.match(/Total\s+de\s+descontos\s*-?\s*>\s*([\d.,]+)/);
      if (descTotalSameLine) current.totalDescontos = descTotalSameLine[1];
      continue;
    }

    const descTotalMatch = trimmed.match(/Total\s+de\s+descontos\s*-?\s*>\s*([\d.,]+)/);
    if (descTotalMatch) {
      current.totalDescontos = descTotalMatch[1];
      continue;
    }

    // Folha line with bases and Líquido
    const folhaMatch = trimmed.match(/Folha\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+L[ií]quido\s*-?\s*>\s*([\d.,]+)/);
    if (folhaMatch) {
      current.baseInss = folhaMatch[1];
      current.valorInss = folhaMatch[2];
      current.baseFgts = folhaMatch[3];
      current.valorFgts = folhaMatch[4];
      current.baseIrrf = folhaMatch[5];
      current.valorIrrf = folhaMatch[6];
      current.liquido = folhaMatch[7];
      continue;
    }

    // Dual provento+desconto line
    const dualMatch = trimmed.match(/^(\d{5})\s+(.+?)\s{2,}([\d.,]+)\s{2,}(\d{5})\s+(.+?)\s{2,}([\d.,]+)\s*$/);
    if (dualMatch) {
      current.proventos.push({ ref: dualMatch[1], descricao: dualMatch[2].trim(), valor: dualMatch[3] });
      current.descontos.push({ ref: dualMatch[4], descricao: dualMatch[5].trim(), valor: dualMatch[6] });
      continue;
    }

    // Single provento/desconto
    const singleMatch = trimmed.match(/^(\d{5})\s+(.+?)\s{2,}([\d.,]+)\s*$/);
    if (singleMatch) {
      const ref = singleMatch[1];
      const isDesconto = ref.startsWith("91") || ref === "20904";
      if (isDesconto) {
        current.descontos.push({ ref, descricao: singleMatch[2].trim(), valor: singleMatch[3] });
      } else {
        current.proventos.push({ ref, descricao: singleMatch[2].trim(), valor: singleMatch[3] });
      }
      continue;
    }
  }

  if (current) results.push(current);
  return results;
}

// ============================================================
// PARSER: PDF Sintético (007)
// ============================================================
function parseSinteticoPDF(text) {
  const lines = text.split("\n");
  const results = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("Relação de líquido") || trimmed.startsWith("Rela") ||
        trimmed.startsWith("Empresa:") || trimmed.startsWith("Código") ||
        trimmed.startsWith("GRUPO PRONUS") || trimmed.includes("CNPJ:") ||
        trimmed.match(/^Página:/) || trimmed.startsWith("Guaratinguetá") ||
        trimmed.includes("Total Geral") || trimmed.includes("Qtde. Func") ||
        trimmed.startsWith("SCI Novo Visual") || trimmed.startsWith("Adiantamento em:")) {
      continue;
    }

    const match = trimmed.match(/^(\d{1,4})\s{2,}(.+?)\s{2,}(\d{2}\/\d{2}\/\d{4})\s{2,}(.+?)\s{2,}([\d.,]+)\s*_*/);
    if (match) {
      results.push({
        codigo: match[1].trim(),
        nome: match[2].trim(),
        dataAdmissao: match[3].trim(),
        funcao: match[4].trim(),
        liquido: match[5].trim(),
      });
    }
  }

  return results;
}

// ============================================================
// MAIN TEST
// ============================================================
console.log("=== TESTE DOS PARSERS COM PDFs REAIS ===\n");

// Parse PDF 006 (Analítico)
console.log("--- PDF 006 (Analítico) ---");
const text006 = extractTextFromPDF('/home/ubuntu/upload/006-EspelhoResumoAdiantamentoJaneiro-ANALITICO-CONTABILIDADE.pdf');
const parsed006 = parseAnaliticoPDF(text006);
console.log(`Total funcionários extraídos: ${parsed006.length}`);
console.log("\nPrimeiros 5:");
parsed006.slice(0, 5).forEach(p => {
  console.log(`  [${p.codigo}] ${p.nome} | Adm: ${p.dataAdmissao} | Sal: ${p.salarioBase} | Líq: ${p.liquido} | Prov: ${p.totalProventos} | Desc: ${p.totalDescontos}`);
});
console.log("\nÚltimos 3:");
parsed006.slice(-3).forEach(p => {
  console.log(`  [${p.codigo}] ${p.nome} | Adm: ${p.dataAdmissao} | Sal: ${p.salarioBase} | Líq: ${p.liquido}`);
});

// Verificar se todos têm dados completos
const semLiquido = parsed006.filter(p => p.liquido === "0");
const semAdmissao = parsed006.filter(p => !p.dataAdmissao);
const semSalario = parsed006.filter(p => !p.salarioBase);
console.log(`\nSem líquido: ${semLiquido.length}`);
console.log(`Sem admissão: ${semAdmissao.length}`);
console.log(`Sem salário: ${semSalario.length}`);
if (semAdmissao.length > 0) {
  console.log("  Sem admissão:", semAdmissao.map(p => `[${p.codigo}] ${p.nome}`).join(", "));
}

// Parse PDF 007 (Sintético)
console.log("\n--- PDF 007 (Sintético) ---");
const text007 = extractTextFromPDF('/home/ubuntu/upload/007-AdiantamentoJaneiro-SINTETICO-CONTABILIDADE.pdf');
const parsed007 = parseSinteticoPDF(text007);
console.log(`Total funcionários extraídos: ${parsed007.length}`);
console.log("\nPrimeiros 5:");
parsed007.slice(0, 5).forEach(p => {
  console.log(`  [${p.codigo}] ${p.nome} | Adm: ${p.dataAdmissao} | Função: ${p.funcao} | Líq: ${p.liquido}`);
});

// Cross-check: comparar 006 vs 007
console.log("\n--- CROSS-CHECK 006 vs 007 ---");
const nomes006 = new Set(parsed006.map(p => normalizeNome(p.nome)));
const nomes007 = new Set(parsed007.map(p => normalizeNome(p.nome)));
const only006 = parsed006.filter(p => !nomes007.has(normalizeNome(p.nome)));
const only007 = parsed007.filter(p => !nomes006.has(normalizeNome(p.nome)));
console.log(`Apenas no 006 (analítico): ${only006.length}`);
only006.forEach(p => console.log(`  [${p.codigo}] ${p.nome}`));
console.log(`Apenas no 007 (sintético): ${only007.length}`);
only007.forEach(p => console.log(`  [${p.codigo}] ${p.nome}`));

// Total líquido
const totalLiq006 = parsed006.reduce((s, p) => s + parseFloat(p.liquido.replace(/\./g, '').replace(',', '.')), 0);
const totalLiq007 = parsed007.reduce((s, p) => s + parseFloat(p.liquido.replace(/\./g, '').replace(',', '.')), 0);
console.log(`\nTotal líquido 006: R$ ${totalLiq006.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`Total líquido 007: R$ ${totalLiq007.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`Diferença: R$ ${Math.abs(totalLiq006 - totalLiq007).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
