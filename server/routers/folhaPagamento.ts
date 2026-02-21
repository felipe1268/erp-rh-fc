import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  folhaLancamentos, folhaItens, employees, payrollUploads,
  timeRecords, pontoConsolidacao, obras
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { PDFParse } from "pdf-parse";

// ============================================================
// HELPERS
// ============================================================
function parseBRL(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatBRL(val: number): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeNome(nome: string): string {
  return nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ");
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse(uint8) as any;
  await parser.load();
  const result = await parser.getText();
  return result.text;
}

// ============================================================
// PARSER: PDF Analítico (Espelho detalhado - tipo 006)
// Compatível com pdf-parse v2 (formato de texto diferente do pdftotext -layout)
// ============================================================
function parseAnaliticoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  sf: number;
  ir: number;
  dataAdmissao: string;
  salarioBase: string;
  horasMensais: string;
  proventos: Array<{ ref: string; descricao: string; valor: string }>;
  descontos: Array<{ ref: string; descricao: string; valor: string }>;
  totalProventos: string;
  totalDescontos: string;
  baseInss: string;
  valorInss: string;
  baseFgts: string;
  valorFgts: string;
  baseIrrf: string;
  valorIrrf: string;
  liquido: string;
}> {
  const lines = text.split("\n");
  const results: any[] = [];
  let current: any = null;
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

    // NEW FORMAT (pdf-parse v2): "128 ACACIO ... Admissão em 27/09/2022 Salário base 12,61 Horas mensais: 220,00\t0 0"
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

    // OLD FORMAT (pdftotext -layout): "128 ACACIO ... 0 0 Admissão em ..."
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
      const contWithAdm = trimmed.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑ\s]*?)\s+Admiss[ãa]o\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+Sal[aá]rio\s+base\s+([\d.,]+)\s+Horas\s+mensais:\s*([\d.,]+)/);
      if (contWithAdm) {
        current.nome = current.nome + " " + contWithAdm[1].trim();
        current.dataAdmissao = contWithAdm[2];
        current.salarioBase = contWithAdm[3];
        current.horasMensais = contWithAdm[4];
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

    // Líquido -> valor (standalone line — pdf-parse v2 puts it on its own line)
    const liquidoMatch = trimmed.match(/L[ií]quido\s*-?\s*>\s*([\d.,]+)/);
    if (liquidoMatch) {
      current.liquido = liquidoMatch[1];
      continue;
    }

    // Folha line with bases (may or may not have Líquido on same line)
    const folhaMatchWithLiq = trimmed.match(/Folha\s+([\d.,]+(?:[\s\t]+[\d.,]+)*)\s+L[ií]quido\s*-?\s*>\s*([\d.,]+)/);
    if (folhaMatchWithLiq) {
      const nums = folhaMatchWithLiq[1].trim().split(/[\s\t]+/);
      if (nums.length >= 6) {
        current.baseInss = nums[0];
        current.valorInss = nums[1];
        current.baseFgts = nums[2];
        current.valorFgts = nums[3];
        current.baseIrrf = nums[nums.length - 2];
        current.valorIrrf = nums[nums.length - 1];
      }
      current.liquido = folhaMatchWithLiq[2];
      continue;
    }

    // Folha line without Líquido (pdf-parse v2 separates them)
    const folhaMatchNoLiq = trimmed.match(/Folha\s+([\d.,]+(?:[\s\t]+[\d.,]+)*)/);
    if (folhaMatchNoLiq && !trimmed.includes("pagamento")) {
      const nums = folhaMatchNoLiq[1].trim().split(/[\s\t]+/);
      if (nums.length >= 4) {
        current.baseInss = nums[0];
        current.valorInss = nums[1];
        current.baseFgts = nums[2];
        current.valorFgts = nums[3];
        if (nums.length >= 6) {
          current.baseIrrf = nums[nums.length - 2];
          current.valorIrrf = nums[nums.length - 1];
        }
      }
      continue;
    }

    // Base INSS / IR standalone lines — skip
    if (trimmed.match(/^Base\s+INSS/) || trimmed.match(/^IR\s*-?\s*>?\s*$/)) continue;
    // Standalone number (e.g. base IRRF value) — skip
    if (trimmed.match(/^[\d.,]+$/) && current) continue;

    // Provento/desconto lines (pdf-parse v2 format)
    // "904,79\tAdiantamento salarial com IR\t20504 178,13\tAd. sal. Créd. Trabalhador com IR\t20904"
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

// ============================================================
// PARSER: PDF Sintético (lista simples - tipo 007)
// Compatível com pdf-parse v2 e pdftotext -layout
// ============================================================
function parseSinteticoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  dataAdmissao: string;
  funcao: string;
  liquido: string;
}> {
  const lines = text.split("\n");
  const results: any[] = [];

  for (const line of lines) {
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

    // NEW FORMAT (pdf-parse v2): "NOME COMPLETO\tCODIGO DD/MM/YYYY FUNCAO valor ___"
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

    // OLD FORMAT (pdftotext -layout): "  codigo   NOME COMPLETO   DD/MM/YYYY   FUNCAO   valor ___"
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

// ============================================================
// MATCH: Vincular itens da folha com cadastro de funcionários
// + Cadastrar código contábil automaticamente
// + Verificação cruzada completa (salário, função, admissão)
// ============================================================
async function matchItensComCadastro(
  db: any,
  companyId: number,
  itens: any[],
  allEmployees: any[],
  autoUpdateCodigo: boolean = true
): Promise<{ matched: number; unmatched: number; divergentes: number; codigosAtualizados: number; details: any[] }> {
  let matched = 0, unmatched = 0, divergentes = 0, codigosAtualizados = 0;
  const details: any[] = [];

  for (const item of itens) {
    let emp = null;
    const divergencias: string[] = [];

    // 1. Match por código contábil (se funcionário já tem código)
    if (item.codigoContabil) {
      emp = allEmployees.find((e: any) => e.codigoContabil === item.codigoContabil);
    }

    // 2. Match por nome normalizado exato
    if (!emp) {
      const nomeNorm = normalizeNome(item.nomeColaborador);
      emp = allEmployees.find((e: any) => normalizeNome(e.nomeCompleto) === nomeNorm);
    }

    // 3. Match parcial: primeiros 3 tokens do nome
    if (!emp) {
      const tokens = normalizeNome(item.nomeColaborador).split(/\s+/).slice(0, 3);
      if (tokens.length >= 2) {
        emp = allEmployees.find((e: any) => {
          const empTokens = normalizeNome(e.nomeCompleto).split(/\s+/).slice(0, 3);
          return empTokens.length >= 2 &&
            tokens[0] === empTokens[0] && tokens[1] === empTokens[1] &&
            (tokens.length < 3 || empTokens.length < 3 || tokens[2] === empTokens[2]);
        });
      }
    }

    // 4. Match mais flexível: primeiro + último nome
    if (!emp) {
      const tokens = normalizeNome(item.nomeColaborador).split(/\s+/);
      if (tokens.length >= 2) {
        const primeiro = tokens[0];
        const ultimo = tokens[tokens.length - 1];
        emp = allEmployees.find((e: any) => {
          const empTokens = normalizeNome(e.nomeCompleto).split(/\s+/);
          return empTokens.length >= 2 &&
            primeiro === empTokens[0] &&
            ultimo === empTokens[empTokens.length - 1];
        });
      }
    }

    if (emp) {
      item.employeeId = emp.id;

      // AUTO-CADASTRAR código contábil se não tem
      if (autoUpdateCodigo && item.codigoContabil && (!emp.codigoContabil || emp.codigoContabil !== item.codigoContabil)) {
        try {
          await db.update(employees)
            .set({ codigoContabil: item.codigoContabil })
            .where(eq(employees.id, emp.id));
          emp.codigoContabil = item.codigoContabil;
          codigosAtualizados++;
        } catch {}
      }

      // VERIFICAÇÃO: Status
      if (emp.status !== "Ativo") {
        divergencias.push(`Status: ${emp.status} (não ativo)`);
      }

      // VERIFICAÇÃO: Salário base (comparar valor/hora do PDF com salário mensal do cadastro)
      if (item.salarioBase && emp.salarioBase) {
        const salFolha = parseBRL(item.salarioBase);
        const salCadastro = parseBRL(emp.salarioBase);
        // O PDF mostra valor/hora, o cadastro pode ter o mensal
        // Se salário do PDF < 100, é valor/hora; se >= 100, é mensal
        if (salFolha > 0 && salCadastro > 0) {
          if (salFolha < 100) {
            // Valor/hora no PDF - calcular mensal: valor/hora * 220
            const salMensalCalculado = salFolha * 220;
            if (Math.abs(salMensalCalculado - salCadastro) > 50) {
              divergencias.push(`Salário: Folha R$ ${item.salarioBase}/h (≈R$ ${formatBRL(salMensalCalculado)}/mês) ≠ Cadastro R$ ${emp.salarioBase}`);
            }
          } else if (Math.abs(salFolha - salCadastro) > 1) {
            divergencias.push(`Salário: Folha R$ ${item.salarioBase} ≠ Cadastro R$ ${emp.salarioBase}`);
          }
        }
      }

      // VERIFICAÇÃO: Função
      if (item.funcao && emp.funcao) {
        const funcFolha = normalizeNome(item.funcao);
        const funcCadastro = normalizeNome(emp.funcao);
        // Comparação parcial (função pode estar truncada no PDF)
        if (funcFolha.length > 3 && funcCadastro.length > 3) {
          const match = funcFolha.startsWith(funcCadastro.substring(0, 6)) ||
                       funcCadastro.startsWith(funcFolha.substring(0, 6));
          if (!match && funcFolha !== funcCadastro) {
            divergencias.push(`Função: Folha "${item.funcao}" ≠ Cadastro "${emp.funcao}"`);
          }
        }
      }

      // VERIFICAÇÃO: Data de admissão
      if (item.dataAdmissao && emp.dataAdmissao) {
        const dataFolha = item.dataAdmissao; // DD/MM/YYYY ou YYYY-MM-DD
        let dataFolhaISO = dataFolha;
        if (dataFolha.includes("/")) {
          const parts = dataFolha.split("/");
          dataFolhaISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        const dataCadastro = typeof emp.dataAdmissao === "string" ? emp.dataAdmissao.substring(0, 10) : "";
        if (dataFolhaISO && dataCadastro && dataFolhaISO !== dataCadastro) {
          divergencias.push(`Admissão: Folha ${dataFolha} ≠ Cadastro ${dataCadastro}`);
        }
      }

      if (divergencias.length > 0) {
        item.matchStatus = "divergente";
        item.divergencias = JSON.stringify(divergencias);
        divergentes++;
      } else {
        item.matchStatus = "matched";
      }
      matched++;
    } else {
      item.matchStatus = "unmatched";
      item.divergencias = JSON.stringify(["Funcionário não encontrado no cadastro"]);
      unmatched++;
    }

    details.push({
      nome: item.nomeColaborador,
      codigo: item.codigoContabil,
      matchStatus: item.matchStatus,
      employeeId: item.employeeId,
      divergencias: divergencias,
      empNome: emp?.nomeCompleto,
      empFuncao: emp?.funcao,
      empStatus: emp?.status,
      empSalario: emp?.salarioBase,
    });
  }

  return { matched, unmatched, divergentes, codigosAtualizados, details };
}

// ============================================================
// ROUTER
// ============================================================
export const folhaPagamentoRouter = router({

  // ============================================================
  // LISTAR LANÇAMENTOS DO MÊS
  // ============================================================
  listarLancamentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const lancamentos = await db.select().from(folhaLancamentos)
        .where(and(
          eq(folhaLancamentos.companyId, input.companyId),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
        ))
        .orderBy(desc(folhaLancamentos.createdAt));

      return lancamentos;
    }),

  // ============================================================
  // LISTAR ITENS DE UM LANÇAMENTO
  // ============================================================
  listarItens: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const itens = await db.select().from(folhaItens)
        .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));

      // Enrich with employee data
      const empIds = itens.filter(i => i.employeeId).map(i => i.employeeId!);
      let emps: any[] = [];
      if (empIds.length > 0) {
        emps = await db.select().from(employees)
          .where(inArray(employees.id, empIds));
      }
      const empMap = new Map(emps.map(e => [e.id, e]));

      return itens.map(item => ({
        ...item,
        employee: item.employeeId ? empMap.get(item.employeeId) : null,
      }));
    }),

  // ============================================================
  // STATUS DO MÊS (resumo para o painel)
  // ============================================================
  statusMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const lancamentos = await db.select().from(folhaLancamentos)
        .where(and(
          eq(folhaLancamentos.companyId, input.companyId),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
        ));

      const vale = lancamentos.find(l => l.tipoLancamento === "vale");
      const pagamento = lancamentos.find(l => l.tipoLancamento === "pagamento");

      // Check ponto consolidation
      const pontoConsolidado = await db.select().from(pontoConsolidacao)
        .where(and(
          eq(pontoConsolidacao.companyId, input.companyId),
          eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
        ));

      // Get uploads for this month
      const uploads = await db.select().from(payrollUploads)
        .where(and(
          eq(payrollUploads.companyId, input.companyId),
          eq(payrollUploads.month, input.mesReferencia),
        ));

      return {
        vale: vale ? {
          id: vale.id,
          status: vale.status,
          totalFuncionarios: vale.totalFuncionarios,
          totalLiquido: vale.totalLiquido,
          totalProventos: vale.totalProventos,
          totalDescontos: vale.totalDescontos,
          totalDivergencias: vale.totalDivergencias,
          divergenciasResolvidas: vale.divergenciasResolvidas,
          importadoEm: vale.importadoEm,
          analiticoUploadId: vale.analiticoUploadId,
          sinteticoUploadId: vale.sinteticoUploadId,
        } : null,
        pagamento: pagamento ? {
          id: pagamento.id,
          status: pagamento.status,
          totalFuncionarios: pagamento.totalFuncionarios,
          totalLiquido: pagamento.totalLiquido,
          totalProventos: pagamento.totalProventos,
          totalDescontos: pagamento.totalDescontos,
          totalDivergencias: pagamento.totalDivergencias,
          divergenciasResolvidas: pagamento.divergenciasResolvidas,
          importadoEm: pagamento.importadoEm,
          analiticoUploadId: pagamento.analiticoUploadId,
          sinteticoUploadId: pagamento.sinteticoUploadId,
        } : null,
        pontoConsolidado: pontoConsolidado.length > 0 && pontoConsolidado[0].status === "consolidado",
        uploads: uploads.map(u => ({
          id: u.id,
          category: u.category,
          fileName: u.fileName,
          uploadStatus: u.uploadStatus,
          recordsProcessed: u.recordsProcessed,
          createdAt: u.createdAt,
        })),
      };
    }),

  // ============================================================
  // IMPORTAR FOLHA AUTO (múltiplos PDFs com detecção automática)
  // Usuário só escolhe Vale ou Pagamento, o sistema detecta o tipo
  // ============================================================
  importarFolhaAuto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
      tipoLancamento: z.enum(["vale", "pagamento"]),
      arquivos: z.array(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string(),
      })).min(1).max(5),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Get all employees for matching
      const allEmployees = await db.select().from(employees)
        .where(eq(employees.companyId, input.companyId));

      // Find or create lancamento for this month/type
      let lancamento = await db.select().from(folhaLancamentos)
        .where(and(
          eq(folhaLancamentos.companyId, input.companyId),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
          eq(folhaLancamentos.tipoLancamento, input.tipoLancamento),
        ))
        .then((r: any[]) => r[0]);

      if (!lancamento) {
        const [newLanc] = await db.insert(folhaLancamentos).values({
          companyId: input.companyId,
          mesReferencia: input.mesReferencia,
          tipoLancamento: input.tipoLancamento,
          status: "importado",
          importadoPor: ctx.user?.name || "Sistema",
          importadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
        });
        lancamento = { id: Number((newLanc as any).insertId) };
      }
      const lancamentoId = lancamento.id;

      // Process each file
      let analiticoData: any[] = [];
      let sinteticoData: any[] = [];
      const uploadIds: number[] = [];
      const processedFiles: Array<{ fileName: string; tipo: string; registros: number }> = [];

      for (const arquivo of input.arquivos) {
        const buffer = Buffer.from(arquivo.fileBase64, "base64");

        // Upload to S3
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `folha/${input.companyId}/${input.mesReferencia}/${input.tipoLancamento}-${randomSuffix}-${arquivo.fileName}`;
        const { url } = await storagePut(fileKey, buffer, arquivo.mimeType);

        // Extract text
        const text = await extractTextFromPDF(buffer);

        // AUTO-DETECT: Analítico tem "Admissão em" e "Salário base", Sintético tem "Relação de líquido"
        const isAnalitico = text.includes("Admiss\u00e3o em") || text.includes("Admissao em") || text.includes("Sal\u00e1rio base") || text.includes("Salario base") || text.includes("Espelho e resumo");
        const isSintetico = text.includes("Rela\u00e7\u00e3o de l\u00edquido") || text.includes("Relacao de liquido") || text.includes("Rela\u00e7\u00e3o de Liquido");

        const tipoDetectado = isAnalitico ? "analitico" : isSintetico ? "sintetico" : "desconhecido";

        // If we can't detect, try parsing both and see which yields results
        let finalTipo = tipoDetectado;
        if (tipoDetectado === "desconhecido") {
          const tryAnalitico = parseAnaliticoPDF(text);
          const trySintetico = parseSinteticoPDF(text);
          if (tryAnalitico.length > trySintetico.length) finalTipo = "analitico";
          else if (trySintetico.length > 0) finalTipo = "sintetico";
          else finalTipo = "analitico"; // default
        }

        const categoryMap: Record<string, any> = {
          "vale-analitico": "espelho_adiantamento_analitico",
          "vale-sintetico": "adiantamento_sintetico",
          "pagamento-analitico": "espelho_folha_analitico",
          "pagamento-sintetico": "folha_sintetico",
        };

        const [uploadRecord] = await db.insert(payrollUploads).values({
          companyId: input.companyId,
          category: categoryMap[`${input.tipoLancamento}-${finalTipo}`] || "espelho_adiantamento_analitico",
          month: input.mesReferencia,
          fileName: arquivo.fileName,
          fileUrl: url,
          fileKey: fileKey,
          fileSize: buffer.length,
          mimeType: arquivo.mimeType,
          uploadStatus: "processado",
        });
        const upId = Number((uploadRecord as any).insertId);
        uploadIds.push(upId);

        if (finalTipo === "analitico") {
          const parsed = parseAnaliticoPDF(text);
          analiticoData = parsed;
          processedFiles.push({ fileName: arquivo.fileName, tipo: "Anal\u00edtico (Espelho)", registros: parsed.length });
          // Link upload
          await db.update(folhaLancamentos)
            .set({ analiticoUploadId: upId })
            .where(eq(folhaLancamentos.id, lancamentoId));
        } else {
          const parsed = parseSinteticoPDF(text);
          sinteticoData = parsed;
          processedFiles.push({ fileName: arquivo.fileName, tipo: "Sint\u00e9tico (Lista)", registros: parsed.length });
          // Link upload
          await db.update(folhaLancamentos)
            .set({ sinteticoUploadId: upId })
            .where(eq(folhaLancamentos.id, lancamentoId));
        }

        // Update upload record
        await db.update(payrollUploads)
          .set({ uploadStatus: "processado", recordsProcessed: finalTipo === "analitico" ? analiticoData.length : sinteticoData.length })
          .where(eq(payrollUploads.id, upId));
      }

      // Process analítico data (main data source)
      let matchResult: any = { matched: 0, unmatched: 0, divergentes: 0, codigosAtualizados: 0 };
      let totalFuncionarios = 0;

      if (analiticoData.length > 0) {
        // Delete existing itens for this lancamento (re-import)
        await db.delete(folhaItens)
          .where(eq(folhaItens.folhaLancamentoId, lancamentoId));

        // Create itens from analítico
        const itensToInsert = analiticoData.map(p => {
          // Try to find funcao from sintético data
          const sinteticoMatch = sinteticoData.find(s => s.codigo === p.codigo || normalizeNome(s.nome) === normalizeNome(p.nome));
          return {
            folhaLancamentoId: lancamentoId,
            companyId: input.companyId,
            codigoContabil: p.codigo,
            nomeColaborador: p.nome,
            dataAdmissao: p.dataAdmissao ? p.dataAdmissao.split("/").reverse().join("-") : null,
            salarioBase: p.salarioBase,
            horasMensais: p.horasMensais,
            funcao: sinteticoMatch?.funcao || "",
            sf: p.sf,
            ir: p.ir,
            proventos: JSON.stringify(p.proventos),
            descontos: JSON.stringify(p.descontos),
            totalProventos: p.totalProventos,
            totalDescontos: p.totalDescontos,
            baseInss: p.baseInss,
            valorInss: p.valorInss,
            baseFgts: p.baseFgts,
            valorFgts: p.valorFgts,
            baseIrrf: p.baseIrrf,
            valorIrrf: p.valorIrrf,
            liquido: p.liquido,
            matchStatus: "unmatched" as const,
          };
        });

        matchResult = await matchItensComCadastro(db, input.companyId, itensToInsert, allEmployees, true);

        for (const item of itensToInsert) {
          await db.insert(folhaItens).values(item as any);
        }

        const totalLiquido = analiticoData.reduce((s, p) => s + parseBRL(p.liquido), 0);
        const totalProventos = analiticoData.reduce((s, p) => s + parseBRL(p.totalProventos), 0);
        const totalDescontos = analiticoData.reduce((s, p) => s + parseBRL(p.totalDescontos), 0);
        totalFuncionarios = analiticoData.length;

        await db.update(folhaLancamentos).set({
          totalFuncionarios,
          totalProventos: formatBRL(totalProventos),
          totalDescontos: formatBRL(totalDescontos),
          totalLiquido: formatBRL(totalLiquido),
          totalDivergencias: matchResult.unmatched + matchResult.divergentes,
        }).where(eq(folhaLancamentos.id, lancamentoId));

      } else if (sinteticoData.length > 0) {
        // Only sintético uploaded - create basic itens
        await db.delete(folhaItens)
          .where(eq(folhaItens.folhaLancamentoId, lancamentoId));

        const itensToInsert = sinteticoData.map(p => ({
          folhaLancamentoId: lancamentoId,
          companyId: input.companyId,
          codigoContabil: p.codigo,
          nomeColaborador: p.nome,
          dataAdmissao: p.dataAdmissao ? p.dataAdmissao.split("/").reverse().join("-") : null,
          funcao: p.funcao,
          liquido: p.liquido,
          matchStatus: "unmatched" as const,
        }));

        matchResult = await matchItensComCadastro(db, input.companyId, itensToInsert, allEmployees, true);

        for (const item of itensToInsert) {
          await db.insert(folhaItens).values(item as any);
        }

        const totalLiquido = sinteticoData.reduce((s, p) => s + parseBRL(p.liquido), 0);
        totalFuncionarios = sinteticoData.length;

        await db.update(folhaLancamentos).set({
          totalFuncionarios,
          totalLiquido: formatBRL(totalLiquido),
          totalDivergencias: matchResult.unmatched + matchResult.divergentes,
        }).where(eq(folhaLancamentos.id, lancamentoId));
      }

      // Also update códigos from sintético if we have both
      if (sinteticoData.length > 0 && analiticoData.length > 0) {
        for (const p of sinteticoData) {
          if (!p.codigo) continue;
          const nomeNorm = normalizeNome(p.nome);
          const emp = allEmployees.find((e: any) => normalizeNome(e.nomeCompleto) === nomeNorm);
          if (emp && (!emp.codigoContabil || emp.codigoContabil !== p.codigo)) {
            await db.update(employees)
              .set({ codigoContabil: p.codigo })
              .where(eq(employees.id, emp.id));
          }
          // Update funcao in itens
          await db.update(folhaItens)
            .set({ funcao: p.funcao })
            .where(and(
              eq(folhaItens.folhaLancamentoId, lancamentoId),
              eq(folhaItens.codigoContabil, p.codigo),
            ));
        }
      }

      return {
        success: true,
        lancamentoId,
        totalFuncionarios,
        arquivosProcessados: processedFiles,
        match: {
          matched: matchResult.matched,
          unmatched: matchResult.unmatched,
          divergentes: matchResult.divergentes,
          codigosAtualizados: matchResult.codigosAtualizados,
        },
        unmatchedNames: matchResult.details
          ?.filter((d: any) => d.matchStatus === "unmatched")
          .map((d: any) => ({ nome: d.nome, codigo: d.codigo })) || [],
      };
    }),

  // ============================================================
  // IMPORTAR FOLHA (upload de PDF + parse + match) - LEGACY
  // Simplificado: apenas analítico e sintético
  // ============================================================
  importarFolha: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
      tipoLancamento: z.enum(["vale", "pagamento"]),
      tipoArquivo: z.enum(["analitico", "sintetico"]),
      fileName: z.string(),
      fileBase64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const buffer = Buffer.from(input.fileBase64, "base64");

      // Upload to S3
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `folha/${input.companyId}/${input.mesReferencia}/${input.tipoLancamento}-${input.tipoArquivo}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Save upload record
      const categoryMap: Record<string, any> = {
        "vale-analitico": "espelho_adiantamento_analitico",
        "vale-sintetico": "adiantamento_sintetico",
        "pagamento-analitico": "espelho_folha_analitico",
        "pagamento-sintetico": "folha_sintetico",
      };

      const [uploadRecord] = await db.insert(payrollUploads).values({
        companyId: input.companyId,
        category: categoryMap[`${input.tipoLancamento}-${input.tipoArquivo}`],
        month: input.mesReferencia,
        fileName: input.fileName,
        fileUrl: url,
        fileKey: fileKey,
        fileSize: buffer.length,
        mimeType: input.mimeType,
        uploadStatus: "processando",
      });

      const uploadId = Number((uploadRecord as any).insertId);

      try {
        // Extract text using pdftotext (much better than pdf-parse)
        const text = await extractTextFromPDF(buffer);

        // Find or create lancamento for this month/type
        let lancamento = await db.select().from(folhaLancamentos)
          .where(and(
            eq(folhaLancamentos.companyId, input.companyId),
            eq(folhaLancamentos.mesReferencia, input.mesReferencia),
            eq(folhaLancamentos.tipoLancamento, input.tipoLancamento),
          ))
          .then((r: any[]) => r[0]);

        if (!lancamento) {
          const [newLanc] = await db.insert(folhaLancamentos).values({
            companyId: input.companyId,
            mesReferencia: input.mesReferencia,
            tipoLancamento: input.tipoLancamento,
            status: "importado",
            importadoPor: ctx.user?.name || "Sistema",
            importadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
          });
          lancamento = { id: Number((newLanc as any).insertId) };
        }

        const lancamentoId = lancamento.id;

        // Update upload link
        const uploadField = input.tipoArquivo === "analitico" ? "analiticoUploadId" : "sinteticoUploadId";
        await db.update(folhaLancamentos)
          .set({ [uploadField]: uploadId })
          .where(eq(folhaLancamentos.id, lancamentoId));

        // Get all employees for matching
        const allEmployees = await db.select().from(employees)
          .where(eq(employees.companyId, input.companyId));

        let recordsProcessed = 0;
        let parseResult: any = {};

        if (input.tipoArquivo === "analitico") {
          const parsed = parseAnaliticoPDF(text);
          recordsProcessed = parsed.length;

          // Delete existing itens for this lancamento (re-import)
          await db.delete(folhaItens)
            .where(eq(folhaItens.folhaLancamentoId, lancamentoId));

          // Create itens
          const itensToInsert = parsed.map(p => ({
            folhaLancamentoId: lancamentoId,
            companyId: input.companyId,
            codigoContabil: p.codigo,
            nomeColaborador: p.nome,
            dataAdmissao: p.dataAdmissao ? p.dataAdmissao.split("/").reverse().join("-") : null,
            salarioBase: p.salarioBase,
            horasMensais: p.horasMensais,
            funcao: "",
            sf: p.sf,
            ir: p.ir,
            proventos: JSON.stringify(p.proventos),
            descontos: JSON.stringify(p.descontos),
            totalProventos: p.totalProventos,
            totalDescontos: p.totalDescontos,
            baseInss: p.baseInss,
            valorInss: p.valorInss,
            baseFgts: p.baseFgts,
            valorFgts: p.valorFgts,
            baseIrrf: p.baseIrrf,
            valorIrrf: p.valorIrrf,
            liquido: p.liquido,
            matchStatus: "unmatched" as const,
          }));

          // Match with cadastro + auto-update código contábil
          const matchResult = await matchItensComCadastro(db, input.companyId, itensToInsert, allEmployees, true);

          // Insert itens
          if (itensToInsert.length > 0) {
            for (const item of itensToInsert) {
              await db.insert(folhaItens).values(item as any);
            }
          }

          // Update lancamento totals
          const totalLiquido = parsed.reduce((s, p) => s + parseBRL(p.liquido), 0);
          const totalProventos = parsed.reduce((s, p) => s + parseBRL(p.totalProventos), 0);
          const totalDescontos = parsed.reduce((s, p) => s + parseBRL(p.totalDescontos), 0);

          await db.update(folhaLancamentos).set({
            totalFuncionarios: parsed.length,
            totalProventos: formatBRL(totalProventos),
            totalDescontos: formatBRL(totalDescontos),
            totalLiquido: formatBRL(totalLiquido),
            totalDivergencias: matchResult.unmatched + matchResult.divergentes,
          }).where(eq(folhaLancamentos.id, lancamentoId));

          parseResult = {
            totalFuncionarios: parsed.length,
            totalLiquido: formatBRL(totalLiquido),
            totalProventos: formatBRL(totalProventos),
            totalDescontos: formatBRL(totalDescontos),
            match: {
              matched: matchResult.matched,
              unmatched: matchResult.unmatched,
              divergentes: matchResult.divergentes,
              codigosAtualizados: matchResult.codigosAtualizados,
            },
            unmatchedNames: matchResult.details
              .filter(d => d.matchStatus === "unmatched")
              .map(d => ({ nome: d.nome, codigo: d.codigo })),
            divergentNames: matchResult.details
              .filter(d => d.matchStatus === "divergente")
              .map(d => ({ nome: d.nome, codigo: d.codigo, divergencias: d.divergencias })),
          };

        } else if (input.tipoArquivo === "sintetico") {
          const parsed = parseSinteticoPDF(text);
          recordsProcessed = parsed.length;

          // Update existing itens with funcao from sintético
          for (const p of parsed) {
            const nomeNorm = normalizeNome(p.nome);
            await db.update(folhaItens)
              .set({ funcao: p.funcao })
              .where(and(
                eq(folhaItens.folhaLancamentoId, lancamentoId),
                sql`UPPER(REPLACE(${folhaItens.nomeColaborador}, '  ', ' ')) = ${nomeNorm}`,
              ));
          }

          // Also try to match and update código contábil from sintético
          for (const p of parsed) {
            if (!p.codigo) continue;
            const nomeNorm = normalizeNome(p.nome);
            // Find employee by name and update código
            const emp = allEmployees.find((e: any) => normalizeNome(e.nomeCompleto) === nomeNorm);
            if (emp && (!emp.codigoContabil || emp.codigoContabil !== p.codigo)) {
              await db.update(employees)
                .set({ codigoContabil: p.codigo })
                .where(eq(employees.id, emp.id));
            }
          }

          const totalLiquido = parsed.reduce((s, p) => s + parseBRL(p.liquido), 0);
          parseResult = {
            totalFuncionarios: parsed.length,
            totalLiquido: formatBRL(totalLiquido),
            funcionarios: parsed.slice(0, 5).map(p => ({ nome: p.nome, funcao: p.funcao, liquido: p.liquido })),
          };
        }

        // Update upload status
        await db.update(payrollUploads)
          .set({ uploadStatus: "processado", recordsProcessed })
          .where(eq(payrollUploads.id, uploadId));

        return {
          success: true,
          lancamentoId,
          uploadId,
          recordsProcessed,
          result: parseResult,
        };
      } catch (error: any) {
        await db.update(payrollUploads)
          .set({ uploadStatus: "erro", errorMessage: error.message })
          .where(eq(payrollUploads.id, uploadId));
        throw error;
      }
    }),

  // ============================================================
  // RE-MATCH: Reprocessar vinculação com cadastro
  // ============================================================
  reprocessarMatch: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      const itens = await db.select().from(folhaItens)
        .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));

      const allEmployees = await db.select().from(employees)
        .where(eq(employees.companyId, input.companyId));

      const matchResult = await matchItensComCadastro(db, input.companyId, itens as any, allEmployees, true);

      // Update each item
      for (const item of itens) {
        await db.update(folhaItens)
          .set({
            employeeId: (item as any).employeeId || null,
            matchStatus: (item as any).matchStatus,
            divergencias: (item as any).divergencias || null,
          })
          .where(eq(folhaItens.id, item.id));
      }

      // Update lancamento divergence count
      await db.update(folhaLancamentos)
        .set({
          totalDivergencias: matchResult.unmatched + matchResult.divergentes,
        })
        .where(eq(folhaLancamentos.id, input.folhaLancamentoId));

      return matchResult;
    }),

  // ============================================================
  // VERIFICAÇÃO CRUZADA COM PONTO
  // ============================================================
  verificacaoCruzada: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // Get folha itens
      const itens = await db.select().from(folhaItens)
        .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));

      // Get time records for the month
      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.mesReferencia, input.mesReferencia),
        ));

      // Group ponto by employee
      const pontoByEmp = new Map<number, { totalHoras: number; diasTrabalhados: number; faltas: number }>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        const existing = pontoByEmp.get(rec.employeeId) || { totalHoras: 0, diasTrabalhados: 0, faltas: 0 };
        const horas = rec.horasTrabalhadas ? parseFloat(rec.horasTrabalhadas.replace(":", ".")) : 0;
        existing.totalHoras += horas;
        if (horas > 0) existing.diasTrabalhados++;
        if (rec.faltas && parseFloat(rec.faltas) > 0) existing.faltas++;
        pontoByEmp.set(rec.employeeId, existing);
      }

      // Get all employees
      const empIds = itens.filter(i => i.employeeId).map(i => i.employeeId!);
      let emps: any[] = [];
      if (empIds.length > 0) {
        emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      }
      const empMap = new Map(emps.map(e => [e.id, e]));

      // Build verification results
      const verificacoes = itens.map(item => {
        const emp = item.employeeId ? empMap.get(item.employeeId) : null;
        const ponto = item.employeeId ? pontoByEmp.get(item.employeeId) : null;
        const alertas: string[] = [];

        if (!item.employeeId) {
          alertas.push("Funcionário não vinculado ao cadastro");
        }

        if (emp && emp.status !== "Ativo") {
          alertas.push(`Funcionário com status "${emp.status}"`);
        }

        if (emp && item.salarioBase && emp.salarioBase) {
          const salFolha = parseBRL(item.salarioBase);
          const salCadastro = parseBRL(emp.salarioBase);
          if (salFolha > 0 && salCadastro > 0) {
            if (salFolha < 100) {
              const salMensal = salFolha * 220;
              if (Math.abs(salMensal - salCadastro) > 50) {
                alertas.push(`Salário divergente: Folha R$ ${item.salarioBase}/h ≠ Cadastro R$ ${emp.salarioBase}`);
              }
            } else if (Math.abs(salFolha - salCadastro) > 1) {
              alertas.push(`Salário divergente: Folha R$ ${item.salarioBase} ≠ Cadastro R$ ${emp.salarioBase}`);
            }
          }
        }

        if (emp && item.funcao && emp.funcao) {
          const funcFolha = normalizeNome(item.funcao);
          const funcCadastro = normalizeNome(emp.funcao);
          if (funcFolha.length > 3 && funcCadastro.length > 3 &&
              !funcFolha.startsWith(funcCadastro.substring(0, 6)) &&
              !funcCadastro.startsWith(funcFolha.substring(0, 6))) {
            alertas.push(`Função divergente: Folha "${item.funcao}" ≠ Cadastro "${emp.funcao}"`);
          }
        }

        if (ponto) {
          if (ponto.faltas > 0) {
            alertas.push(`${ponto.faltas} falta(s) registrada(s) no ponto`);
          }
        } else if (item.employeeId) {
          alertas.push("Sem registros de ponto para este mês");
        }

        return {
          id: item.id,
          nome: item.nomeColaborador,
          codigo: item.codigoContabil,
          funcaoFolha: item.funcao,
          funcaoCadastro: emp?.funcao,
          matchStatus: item.matchStatus,
          liquido: item.liquido,
          salarioFolha: item.salarioBase,
          salarioCadastro: emp?.salarioBase,
          statusEmpregado: emp?.status,
          dataAdmissaoFolha: item.dataAdmissao,
          dataAdmissaoCadastro: emp?.dataAdmissao,
          ponto: ponto ? {
            totalHoras: ponto.totalHoras.toFixed(1),
            diasTrabalhados: ponto.diasTrabalhados,
            faltas: ponto.faltas,
          } : null,
          alertas,
        };
      });

      return {
        totalItens: itens.length,
        totalAlertas: verificacoes.filter(v => v.alertas.length > 0).length,
        totalMatched: verificacoes.filter(v => v.matchStatus === "matched").length,
        totalUnmatched: verificacoes.filter(v => v.matchStatus === "unmatched").length,
        totalDivergente: verificacoes.filter(v => v.matchStatus === "divergente").length,
        verificacoes,
      };
    }),

  // ============================================================
  // CONSOLIDAR LANÇAMENTO
  // ============================================================
  consolidarLancamento: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(folhaLancamentos)
        .set({
          status: "consolidado",
          consolidadoPor: ctx.user?.name || "Sistema",
          consolidadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
        })
        .where(eq(folhaLancamentos.id, input.folhaLancamentoId));
      return { success: true };
    }),

  // ============================================================
  // DESCONSOLIDAR LANÇAMENTO
  // ============================================================
  desconsolidarLancamento: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(folhaLancamentos)
        .set({
          status: "importado",
          consolidadoPor: null,
          consolidadoEm: null,
        })
        .where(eq(folhaLancamentos.id, input.folhaLancamentoId));
      return { success: true };
    }),

  // ============================================================
  // EXCLUIR LANÇAMENTO (e seus itens)
  // ============================================================
  excluirLancamento: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(folhaItens)
        .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));
      await db.delete(folhaLancamentos)
        .where(eq(folhaLancamentos.id, input.folhaLancamentoId));
      return { success: true };
    }),

  // ============================================================
  // ATUALIZAR CÓDIGO CONTÁBIL DO FUNCIONÁRIO
  // ============================================================
  atualizarCodigoContabil: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      codigoContabil: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(employees)
        .set({ codigoContabil: input.codigoContabil })
        .where(eq(employees.id, input.employeeId));
      return { success: true };
    }),

  // ============================================================
  // CUSTOS POR OBRA (baseado no ponto)
  // ============================================================
  custosPorObra: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // Get folha itens with employee data
      const itens = await db.select().from(folhaItens)
        .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));

      const empIds = itens.filter(i => i.employeeId).map(i => i.employeeId!);
      if (empIds.length === 0) return { obrasResumo: [], semObra: [], totalGeral: "0,00" };

      // Get employees
      const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      const empMap = new Map(emps.map(e => [e.id, e]));

      // Get time records for the month
      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.mesReferencia, input.mesReferencia),
          inArray(timeRecords.employeeId, empIds),
        ));

      // Get all obras
      const allObras = await db.select().from(obras)
        .where(eq(obras.companyId, input.companyId));
      const obraMap = new Map(allObras.map(o => [o.id, o]));

      // Group ponto by employee and obra
      const empObraHoras = new Map<number, Map<number | null, { horasTrab: number; horasExtras: number; dias: number }>>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        if (!empObraHoras.has(rec.employeeId)) empObraHoras.set(rec.employeeId, new Map());
        const obraKey = rec.obraId || null;
        const obraGroup = empObraHoras.get(rec.employeeId)!;
        const existing = obraGroup.get(obraKey) || { horasTrab: 0, horasExtras: 0, dias: 0 };
        const horas = rec.horasTrabalhadas ? parseFloat(rec.horasTrabalhadas.replace(":", ".")) : 0;
        const he = rec.horasExtras ? parseFloat(rec.horasExtras.replace(":", ".")) : 0;
        existing.horasTrab += horas;
        existing.horasExtras += he;
        if (horas > 0) existing.dias++;
        obraGroup.set(obraKey, existing);
      }

      // Calculate cost per obra
      const obraCustos = new Map<number | null, {
        obraId: number | null;
        obraNome: string;
        funcionarios: Array<{ id: number; nome: string; funcao: string; horas: number; horasExtras: number; dias: number; custoEstimado: string; liquido: string }>;
        totalCusto: number;
        totalHoras: number;
        totalHE: number;
      }>();

      for (const item of itens) {
        if (!item.employeeId) continue;
        const emp = empMap.get(item.employeeId);
        const empObras = empObraHoras.get(item.employeeId);
        const liquidoVal = parseBRL(item.liquido || "0");

        if (!empObras || empObras.size === 0) {
          // Sem ponto - alocar em "Sem Obra"
          const key = null;
          if (!obraCustos.has(key)) obraCustos.set(key, { obraId: null, obraNome: "Sem Obra Vinculada", funcionarios: [], totalCusto: 0, totalHoras: 0, totalHE: 0 });
          const grupo = obraCustos.get(key)!;
          grupo.funcionarios.push({
            id: item.employeeId,
            nome: item.nomeColaborador,
            funcao: emp?.funcao || item.funcao || "",
            horas: 0, horasExtras: 0, dias: 0,
            custoEstimado: formatBRL(liquidoVal),
            liquido: item.liquido || "0,00",
          });
          grupo.totalCusto += liquidoVal;
          continue;
        }

        // Calculate total hours for proportional allocation
        let totalHorasEmp = 0;
        for (const [, data] of Array.from(empObras)) totalHorasEmp += data.horasTrab;

        for (const [obraId, data] of Array.from(empObras)) {
          const proporcao = totalHorasEmp > 0 ? data.horasTrab / totalHorasEmp : 1;
          const custoAlocado = liquidoVal * proporcao;

          if (!obraCustos.has(obraId)) {
            const ob = obraId ? obraMap.get(obraId) : null;
            obraCustos.set(obraId, {
              obraId,
              obraNome: ob ? ob.nome : "Sem Obra Vinculada",
              funcionarios: [],
              totalCusto: 0,
              totalHoras: 0,
              totalHE: 0,
            });
          }
          const grupo = obraCustos.get(obraId)!;
          grupo.funcionarios.push({
            id: item.employeeId,
            nome: item.nomeColaborador,
            funcao: emp?.funcao || item.funcao || "",
            horas: Math.round(data.horasTrab * 10) / 10,
            horasExtras: Math.round(data.horasExtras * 10) / 10,
            dias: data.dias,
            custoEstimado: formatBRL(custoAlocado),
            liquido: item.liquido || "0,00",
          });
          grupo.totalCusto += custoAlocado;
          grupo.totalHoras += data.horasTrab;
          grupo.totalHE += data.horasExtras;
        }
      }

      const obrasResumo = Array.from(obraCustos.values())
        .filter(o => o.obraId !== null)
        .sort((a, b) => b.totalCusto - a.totalCusto)
        .map(o => ({
          ...o,
          totalCusto: formatBRL(o.totalCusto),
          totalHoras: Math.round(o.totalHoras * 10) / 10,
          totalHE: Math.round(o.totalHE * 10) / 10,
        }));

      const semObra = obraCustos.get(null);
      const totalGeral = formatBRL(Array.from(obraCustos.values()).reduce((s, o) => s + o.totalCusto, 0));

      return {
        obrasResumo,
        semObra: semObra ? {
          ...semObra,
          totalCusto: formatBRL(semObra.totalCusto),
          totalHoras: Math.round(semObra.totalHoras * 10) / 10,
          totalHE: Math.round(semObra.totalHE * 10) / 10,
        } : null,
        totalGeral,
      };
    }),

  // ============================================================
  // HORAS EXTRAS POR FUNCIONÁRIO E OBRA
  // ============================================================
  horasExtrasPorFuncionario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.mesReferencia, input.mesReferencia),
        ));

      const empIds = Array.from(new Set(pontoRecords.filter(r => r.employeeId).map(r => r.employeeId)));
      if (empIds.length === 0) return { funcionarios: [], rankingObras: [] };

      const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      const empMap = new Map(emps.map(e => [e.id, e]));

      const allObras = await db.select().from(obras).where(eq(obras.companyId, input.companyId));
      const obraMap = new Map(allObras.map(o => [o.id, o]));

      // Group by employee
      const empHE = new Map<number, { totalHE: number; totalNoturnas: number; detalhePorObra: Map<number | null, number> }>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        if (!empHE.has(rec.employeeId)) empHE.set(rec.employeeId, { totalHE: 0, totalNoturnas: 0, detalhePorObra: new Map() });
        const data = empHE.get(rec.employeeId)!;
        const he = rec.horasExtras ? parseFloat(rec.horasExtras.replace(":", ".")) : 0;
        const hn = rec.horasNoturnas ? parseFloat(rec.horasNoturnas.replace(":", ".")) : 0;
        data.totalHE += he;
        data.totalNoturnas += hn;
        const obraKey = rec.obraId || null;
        data.detalhePorObra.set(obraKey, (data.detalhePorObra.get(obraKey) || 0) + he);
      }

      // Build funcionarios list
      const funcionarios = Array.from(empHE.entries())
        .filter(([, data]) => data.totalHE > 0)
        .map(([empId, data]) => {
          const emp = empMap.get(empId);
          const porObra = Array.from(data.detalhePorObra.entries())
            .filter(([, he]) => he > 0)
            .map(([obraId, he]) => ({
              obraId,
              obraNome: obraId ? (obraMap.get(obraId)?.nome || "Obra " + obraId) : "Sem Obra",
              horasExtras: Math.round(he * 10) / 10,
            }))
            .sort((a, b) => b.horasExtras - a.horasExtras);

          return {
            employeeId: empId,
            nome: emp?.nomeCompleto || "Desconhecido",
            funcao: emp?.funcao || "",
            codigoInterno: emp?.codigoInterno || "",
            totalHE: Math.round(data.totalHE * 10) / 10,
            totalNoturnas: Math.round(data.totalNoturnas * 10) / 10,
            acordoHE: emp?.acordoHoraExtra === 1,
            porObra,
          };
        })
        .sort((a, b) => b.totalHE - a.totalHE);

      // Ranking de obras por HE
      const obraHETotal = new Map<number | null, number>();
      for (const rec of pontoRecords) {
        const he = rec.horasExtras ? parseFloat(rec.horasExtras.replace(":", ".")) : 0;
        if (he > 0) {
          const key = rec.obraId || null;
          obraHETotal.set(key, (obraHETotal.get(key) || 0) + he);
        }
      }

      const rankingObras = Array.from(obraHETotal.entries())
        .map(([obraId, totalHE]) => ({
          obraId,
          obraNome: obraId ? (obraMap.get(obraId)?.nome || "Obra " + obraId) : "Sem Obra",
          totalHE: Math.round(totalHE * 10) / 10,
        }))
        .sort((a, b) => b.totalHE - a.totalHE);

      return { funcionarios, rankingObras };
    }),

  // ============================================================
  // LISTAR MESES COM LANÇAMENTOS (para o calendário)
  // ============================================================
  listarMesesComLancamentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const lancamentos = await db.select({
        mesReferencia: folhaLancamentos.mesReferencia,
        tipoLancamento: folhaLancamentos.tipoLancamento,
        status: folhaLancamentos.status,
      }).from(folhaLancamentos)
        .where(and(
          eq(folhaLancamentos.companyId, input.companyId),
          sql`${folhaLancamentos.mesReferencia} LIKE ${`${input.ano}-%`}`,
        ));

      const meses: Record<string, { vale: string | null; pagamento: string | null }> = {};
      for (const l of lancamentos) {
        if (!meses[l.mesReferencia]) meses[l.mesReferencia] = { vale: null, pagamento: null };
        meses[l.mesReferencia][l.tipoLancamento] = l.status;
      }

      return meses;
    }),
});
