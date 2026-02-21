import fs from 'fs';

// Read the extracted text
const text006 = fs.readFileSync('/home/ubuntu/erp-rh-fc/pdf006-text.txt', 'utf-8');
const text007 = fs.readFileSync('/home/ubuntu/erp-rh-fc/pdf007-text.txt', 'utf-8');

// ============ TEST ANALITICO PARSER ============
function parseAnaliticoPDF(text) {
  const lines = text.split("\n");
  const results = [];
  let current = null;
  let pendingNameContinuation = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip page headers
    if (trimmed.startsWith("Espelho e resumo") || trimmed.startsWith("Empresa:") ||
        trimmed.startsWith("Adiantamento em:") || trimmed.startsWith("NOME DO COLABORADOR") ||
        trimmed.startsWith("PROVENTOS") || trimmed.startsWith("SCI Novo Visual") ||
        trimmed.startsWith("Página:") || trimmed.startsWith("Guaratinguetá") ||
        trimmed.includes("CNPJ:") || trimmed.startsWith("Espelho e resumo de folha") ||
        trimmed.match(/^Folha de pagamento/) || trimmed.match(/^Relação de líquido/)) {
      continue;
    }

    // NEW FORMAT (pdf-parse v2): "128 ACACIO LESCURA DE CAMARGO Admissão em 27/09/2022 Salário base 12,61 Horas mensais: 220,00\t0 0"
    // SF and IR are at the END after a tab, not in the middle
    const headerMatchNew = trimmed.match(/^(\d{1,4})\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+?)\s+Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)\s+(\d+)\s+(\d+)/);
    if (headerMatchNew) {
      if (current) results.push(current);
      current = {
        codigo: headerMatchNew[1].trim(),
        nome: headerMatchNew[2].trim(),
        sf: parseInt(headerMatchNew[6]),
        ir: parseInt(headerMatchNew[7]),
        dataAdmissao: headerMatchNew[3],
        salarioBase: headerMatchNew[4],
        horasMensais: headerMatchNew[5],
        proventos: [],
        descontos: [],
        totalProventos: "0",
        totalDescontos: "0",
        baseInss: "0", valorInss: "0",
        baseFgts: "0", valorFgts: "0",
        baseIrrf: "0", valorIrrf: "0",
        liquido: "0",
      };
      pendingNameContinuation = false;
      continue;
    }

    // OLD FORMAT: "128 ACACIO LESCURA DE CAMARGO  0  0  Admissão em..."
    const headerMatchOld = trimmed.match(/^(\d{1,4})\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+?)\s+(\d+)\s+(\d+)\s+Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
    if (headerMatchOld) {
      if (current) results.push(current);
      current = {
        codigo: headerMatchOld[1].trim(),
        nome: headerMatchOld[2].trim(),
        sf: parseInt(headerMatchOld[3]),
        ir: parseInt(headerMatchOld[4]),
        dataAdmissao: headerMatchOld[5],
        salarioBase: headerMatchOld[6],
        horasMensais: headerMatchOld[7],
        proventos: [],
        descontos: [],
        totalProventos: "0",
        totalDescontos: "0",
        baseInss: "0", valorInss: "0",
        baseFgts: "0", valorFgts: "0",
        baseIrrf: "0", valorIrrf: "0",
        liquido: "0",
      };
      pendingNameContinuation = false;
      continue;
    }

    // Name split across lines: "631 ALEX ALESSANDRO MONTEIRO DA" then "SILVA"
    // First line: code + partial name (no Admissão)
    const partialHeader = trimmed.match(/^(\d{1,4})\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+?)$/);
    if (partialHeader && partialHeader[2].length > 3 && !trimmed.match(/^(Folha|Base|Total|PROVENTOS|DESCONTOS|IR)/)) {
      if (current) results.push(current);
      current = {
        codigo: partialHeader[1].trim(),
        nome: partialHeader[2].trim(),
        sf: 0, ir: 0,
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

    // Name continuation + Admissão
    if (pendingNameContinuation && current) {
      // "SILVA" then next line "Admissão em..."
      const contWithAdm = trimmed.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]*?)\s+Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
      if (contWithAdm) {
        current.nome = current.nome + " " + contWithAdm[1].trim();
        current.dataAdmissao = contWithAdm[2];
        current.salarioBase = contWithAdm[3];
        current.horasMensais = contWithAdm[4];
        // Check for SF/IR at end
        const sfir = trimmed.match(/Horas\s+mensais:\s*[\d.,]+\s+(\d+)\s+(\d+)/);
        if (sfir) { current.sf = parseInt(sfir[1]); current.ir = parseInt(sfir[2]); }
        pendingNameContinuation = false;
        continue;
      }
      // Just name continuation
      const nameOnly = trimmed.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+)$/);
      if (nameOnly && nameOnly[1].length >= 2 && !nameOnly[1].match(/^(Folha|Base|Total|PROVENTOS|DESCONTOS|IR)/)) {
        current.nome = current.nome + " " + nameOnly[1].trim();
        continue;
      }
      // Admissão on separate line
      const admOnly = trimmed.match(/Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
      if (admOnly) {
        current.dataAdmissao = admOnly[1];
        current.salarioBase = admOnly[2];
        current.horasMensais = admOnly[3];
        const sfir = trimmed.match(/Horas\s+mensais:\s*[\d.,]+\s+(\d+)\s+(\d+)/);
        if (sfir) { current.sf = parseInt(sfir[1]); current.ir = parseInt(sfir[2]); }
        pendingNameContinuation = false;
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

    // Total de descontos standalone
    const descTotalMatch = trimmed.match(/Total\s+de\s+descontos\s*-?\s*>\s*([\d.,]+)/);
    if (descTotalMatch) {
      current.totalDescontos = descTotalMatch[1];
      continue;
    }

    // Líquido -> valor
    const liquidoMatch = trimmed.match(/L[ií]quido\s*-?\s*>\s*([\d.,]+)/);
    if (liquidoMatch) {
      current.liquido = liquidoMatch[1];
      continue;
    }

    // Folha line with bases
    const folhaMatch = trimmed.match(/Folha\s+([\d.,]+(?:[\s\t]+[\d.,]+)*)/);
    if (folhaMatch) {
      const nums = folhaMatch[1].trim().split(/[\s\t]+/);
      if (nums.length >= 6) {
        current.baseInss = nums[0];
        current.valorInss = nums[1];
        current.baseFgts = nums[2];
        current.valorFgts = nums[3];
        current.baseIrrf = nums[nums.length - 2];
        current.valorIrrf = nums[nums.length - 1];
      }
      continue;
    }

    // Base INSS line
    const baseMatch = trimmed.match(/Base\s+INSS/);
    if (baseMatch) continue;

    // IR standalone
    const irMatch = trimmed.match(/^IR\s*-?\s*>?\s*$/);
    if (irMatch) continue;

    // Number standalone (base IRRF value after IR ->)
    if (trimmed.match(/^[\d.,]+$/) && current) continue;

    // Provento/desconto lines
    // pdf-parse v2 format: "valor\tdescricao\tref" or "valor\tdescricao\tref\tvalor\tdescricao\tref"
    // Or: "904,79	Adiantamento salarial com IR	20504 178,13	Ad. sal. Créd. Trabalhador com IR	20904"
    const proventoLine = trimmed.match(/([\d.,]+)\s+(.+?)\s+(\d{5})/g);
    if (proventoLine && proventoLine.length > 0) {
      for (const pl of proventoLine) {
        const pm = pl.match(/([\d.,]+)\s+(.+?)\s+(\d{5})/);
        if (pm) {
          const ref = pm[3];
          const isDesconto = ref.startsWith("91") || ref === "20904";
          if (isDesconto) {
            current.descontos.push({ ref, descricao: pm[2].trim(), valor: pm[1] });
          } else {
            current.proventos.push({ ref, descricao: pm[2].trim(), valor: pm[1] });
          }
        }
      }
      continue;
    }
  }

  if (current) results.push(current);
  return results;
}

// ============ TEST SINTETICO PARSER ============
function parseSinteticoPDF(text) {
  const lines = text.split("\n");
  const results = [];
  let pendingName = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed === '_') continue;

    // Skip headers
    if (trimmed.startsWith("Relação de líquido") || trimmed.startsWith("Empresa:") ||
        trimmed.startsWith("Código") || trimmed.startsWith("GRUPO PRONUS") ||
        trimmed.includes("CNPJ:") || trimmed.startsWith("Página:") ||
        trimmed.startsWith("Guaratinguetá") || trimmed.includes("Total Geral") ||
        trimmed.includes("Qtde. Func") || trimmed.startsWith("Nome do colaborador") ||
        trimmed.match(/^SCI Novo Visual/)) {
      continue;
    }

    // pdf-parse v2 format: "NOME COMPLETO\tCODIGO DD/MM/YYYY FUNCAO valor ___"
    // Example: "ACACIO LESCURA DE CAMARGO\t128 27/09/2022 PINTOR 1.147,00 ______________"
    const matchNew = trimmed.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]+?)\t(\d{1,4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*_*/);
    if (matchNew) {
      results.push({
        codigo: matchNew[2].trim(),
        nome: matchNew[1].trim(),
        dataAdmissao: matchNew[3].trim(),
        funcao: matchNew[4].trim(),
        liquido: matchNew[5].trim(),
      });
      continue;
    }

    // OLD format: "  codigo   NOME COMPLETO   DD/MM/YYYY   FUNCAO   valor ___"
    const matchOld = trimmed.match(/^(\d{1,4})\s{2,}(.+?)\s{2,}(\d{2}\/\d{2}\/\d{4})\s{2,}(.+?)\s{2,}([\d.,]+)\s*_*/);
    if (matchOld) {
      results.push({
        codigo: matchOld[1].trim(),
        nome: matchOld[2].trim(),
        dataAdmissao: matchOld[3].trim(),
        funcao: matchOld[4].trim(),
        liquido: matchOld[5].trim(),
      });
      continue;
    }
  }

  return results;
}

// RUN TESTS
console.log('\n=== TESTING ANALITICO PARSER (006) ===');
const analitico = parseAnaliticoPDF(text006);
console.log(`Found ${analitico.length} employees`);
for (const emp of analitico.slice(0, 5)) {
  console.log(`  ${emp.codigo} | ${emp.nome} | Líquido: ${emp.liquido} | Proventos: ${emp.totalProventos} | Descontos: ${emp.totalDescontos}`);
}
console.log('  ...');
const lastEmp = analitico[analitico.length - 1];
if (lastEmp) console.log(`  LAST: ${lastEmp.codigo} | ${lastEmp.nome} | Líquido: ${lastEmp.liquido}`);

console.log('\n=== TESTING SINTETICO PARSER (007) ===');
const sintetico = parseSinteticoPDF(text007);
console.log(`Found ${sintetico.length} employees`);
for (const emp of sintetico.slice(0, 5)) {
  console.log(`  ${emp.codigo} | ${emp.nome} | ${emp.funcao} | Líquido: ${emp.liquido}`);
}
console.log('  ...');
const lastSint = sintetico[sintetico.length - 1];
if (lastSint) console.log(`  LAST: ${lastSint.codigo} | ${lastSint.nome} | Líquido: ${lastSint.liquido}`);

// Total líquido
const totalAnalitico = analitico.reduce((sum, e) => sum + parseFloat(e.liquido.replace(/\./g, '').replace(',', '.')), 0);
const totalSintetico = sintetico.reduce((sum, e) => sum + parseFloat(e.liquido.replace(/\./g, '').replace(',', '.')), 0);
console.log(`\nTotal Líquido Analítico: R$ ${totalAnalitico.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`Total Líquido Sintético: R$ ${totalSintetico.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
