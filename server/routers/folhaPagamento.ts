import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  folhaLancamentos, folhaItens, employees, payrollUploads,
  timeRecords, pontoConsolidacao, obras, manualObraAssignments, companyBankAccounts, systemCriteria,
  pontoDescontos, pontoDescontosResumo, heSolicitacoes, heSolicitacaoFuncionarios
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const lancamentos = await db.select().from(folhaLancamentos)
        .where(and(
          companyFilter(folhaLancamentos.companyId, input),
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

      // Buscar contas bancárias da empresa para enriquecer com info de banco
      const companyIds = Array.from(new Set(itens.map(i => i.companyId)));
      let bankAccounts: any[] = [];
      if (companyIds.length > 0) {
        bankAccounts = await db.select().from(companyBankAccounts)
          .where(inArray(companyBankAccounts.companyId, companyIds));
      }
      const bankMap = new Map(bankAccounts.map(b => [b.id, b]));

      return itens.map(item => {
        const emp = item.employeeId ? empMap.get(item.employeeId) : null;
        const contaBancoId = emp?.contaBancariaEmpresaId;
        const contaBanco = contaBancoId ? bankMap.get(contaBancoId) : null;
        return {
          ...item,
          employee: emp || null,
          contaBancaria: contaBanco ? {
            id: contaBanco.id,
            banco: contaBanco.banco,
            codigoBanco: contaBanco.codigoBanco,
            agencia: contaBanco.agencia,
            conta: contaBanco.conta,
            apelido: contaBanco.apelido,
          } : null,
        };
      });
    }),

  // ============================================================
  // STATUS DO MÊS (resumo para o painel)
  // ============================================================
  statusMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const lancamentos = await db.select().from(folhaLancamentos)
        .where(and(
          companyFilter(folhaLancamentos.companyId, input),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
        ));

      const vale = lancamentos.find(l => l.tipoLancamento === "vale");
      const pagamento = lancamentos.find(l => l.tipoLancamento === "pagamento");
      const decimoTerceiro1 = lancamentos.find(l => l.tipoLancamento === "decimo_terceiro_1");
      const decimoTerceiro2 = lancamentos.find(l => l.tipoLancamento === "decimo_terceiro_2");

      // Check ponto consolidation
      const pontoConsolidado = await db.select().from(pontoConsolidacao)
        .where(and(
          companyFilter(pontoConsolidacao.companyId, input),
          eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
        ));

      // Get uploads for this month
      const uploads = await db.select().from(payrollUploads)
        .where(and(
          companyFilter(payrollUploads.companyId, input),
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
        decimoTerceiro1: decimoTerceiro1 ? {
          id: decimoTerceiro1.id,
          status: decimoTerceiro1.status,
          totalFuncionarios: decimoTerceiro1.totalFuncionarios,
          totalLiquido: decimoTerceiro1.totalLiquido,
          totalProventos: decimoTerceiro1.totalProventos,
          totalDescontos: decimoTerceiro1.totalDescontos,
          totalDivergencias: decimoTerceiro1.totalDivergencias,
          divergenciasResolvidas: decimoTerceiro1.divergenciasResolvidas,
          importadoEm: decimoTerceiro1.importadoEm,
          analiticoUploadId: decimoTerceiro1.analiticoUploadId,
          sinteticoUploadId: decimoTerceiro1.sinteticoUploadId,
        } : null,
        decimoTerceiro2: decimoTerceiro2 ? {
          id: decimoTerceiro2.id,
          status: decimoTerceiro2.status,
          totalFuncionarios: decimoTerceiro2.totalFuncionarios,
          totalLiquido: decimoTerceiro2.totalLiquido,
          totalProventos: decimoTerceiro2.totalProventos,
          totalDescontos: decimoTerceiro2.totalDescontos,
          totalDivergencias: decimoTerceiro2.totalDivergencias,
          divergenciasResolvidas: decimoTerceiro2.divergenciasResolvidas,
          importadoEm: decimoTerceiro2.importadoEm,
          analiticoUploadId: decimoTerceiro2.analiticoUploadId,
          sinteticoUploadId: decimoTerceiro2.sinteticoUploadId,
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
  // Auto-detecta o mês de referência a partir do conteúdo do PDF
  // ============================================================
  importarFolhaAuto: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
      tipoLancamento: z.enum(["vale", "pagamento", "decimo_terceiro_1", "decimo_terceiro_2"]),
      arquivos: z.array(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string(),
      })).min(1).max(5),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // ===== FUNÇÃO: Detectar mês de referência do PDF =====
      const mesesNome: Record<string, string> = {
        "janeiro": "01", "fevereiro": "02", "marco": "03", "março": "03",
        "abril": "04", "maio": "05", "junho": "06",
        "julho": "07", "agosto": "08", "setembro": "09",
        "outubro": "10", "novembro": "11", "dezembro": "12",
      };

      function detectMesReferencia(text: string, fileName: string): string | null {
        const headerText = text.substring(0, 1500);

        // 1. PRIORIDADE MÁXIMA: "referente ao mês de JANEIRO/2026" (espelho folha mensal)
        //    Também captura: "mês de JANEIRO/2026", "mes de JANEIRO 2026"
        for (const [mesNome, mesNum] of Object.entries(mesesNome)) {
          const regex = new RegExp(`(?:referente\\s+ao\\s+)?m[eê]s\\s+de\\s+${mesNome}[\\s/]*(20\\d{2})`, "i");
          const match = headerText.match(regex);
          if (match) return `${match[1]}-${mesNum}`;
        }

        // 2. "Adiantamento em: DD/MM/YYYY" ou "DD/MM/YYYY Adiantamento em:" (vale)
        const adiantMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(?:Adiantamento|Pagamento|Folha)\s*em/i)
          || text.match(/(?:Adiantamento|Pagamento|Folha)\s*em:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
        if (adiantMatch) {
          const groups = adiantMatch;
          if (groups[3] && groups[3].length === 4) {
            return `${groups[3]}-${groups[2]}`;
          }
        }

        // 3. "Competência: MM/YYYY" ou "Referência: MM/YYYY"
        const compMatch = headerText.match(/(?:Competência|Competencia|Referência|Referencia)[:\s]*(\d{2})\/(\d{4})/i);
        if (compMatch) return `${compMatch[2]}-${compMatch[1]}`;

        // 4. Nome do mês no nome do arquivo (ex: "FolhaJaneiro2026.pdf")
        const fileNameLower = fileName.toLowerCase();
        for (const [mesNome, mesNum] of Object.entries(mesesNome)) {
          if (fileNameLower.includes(mesNome)) {
            const yearMatch = fileName.match(/(20\d{2})/);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
            return `${year}-${mesNum}`;
          }
        }

        // 5. Nome do mês no conteúdo do cabeçalho (primeiras 1500 chars)
        //    Só aceita se estiver próximo de um ano (NOME_MES/ANO ou NOME_MES ANO)
        const headerLower = headerText.toLowerCase();
        for (const [mesNome, mesNum] of Object.entries(mesesNome)) {
          const regex = new RegExp(`${mesNome}[\\s/]*(20\\d{2})`, "i");
          const match = headerLower.match(regex);
          if (match) return `${match[1]}-${mesNum}`;
        }

        // 6. ÚLTIMO RECURSO: data DD/MM/YYYY no cabeçalho que NÃO seja "Admissão em"
        //    Ignora datas que estejam logo após "Admissão em" ou "admissao em"
        const lines = headerText.split("\n");
        for (const line of lines.slice(0, 5)) { // Só primeiras 5 linhas
          if (/admiss[aã]o/i.test(line)) continue; // Pular linhas com "Admissão"
          const dateMatch = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (dateMatch && parseInt(dateMatch[3]) >= 2024) {
            return `${dateMatch[3]}-${dateMatch[2]}`;
          }
        }

        return null; // Não conseguiu detectar
      }

      // Get all employees for matching
      const allEmployees = await db.select().from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

      // ===== DETECTAR MÊS REAL DOS PDFs =====
      // Primeiro, extrair texto de todos os PDFs para detectar o mês
      const textosPDFs: Array<{ text: string; fileName: string; buffer: Buffer }> = [];
      for (const arquivo of input.arquivos) {
        const buffer = Buffer.from(arquivo.fileBase64, "base64");
        const text = await extractTextFromPDF(buffer);
        textosPDFs.push({ text, fileName: arquivo.fileName, buffer });
      }

      // Detectar mês de cada PDF
      let mesDetectado: string | null = null;
      for (const pdf of textosPDFs) {
        const mes = detectMesReferencia(pdf.text, pdf.fileName);
        if (mes) { mesDetectado = mes; break; }
      }

      // Usar o mês detectado ou o mês informado pelo usuário
      const mesReal = mesDetectado || input.mesReferencia;
      const mesRedirecionado = mesReal !== input.mesReferencia;
      const alertaMes = mesRedirecionado
        ? `PDF detectado como referência ${mesReal.split("-").reverse().join("/")}. Alocado automaticamente no mês correto (você estava em ${input.mesReferencia.split("-").reverse().join("/")}).`
        : null;

      // Find or create lancamento for the CORRECT month
      let lancamento = await db.select().from(folhaLancamentos)
        .where(and(
          companyFilter(folhaLancamentos.companyId, input),
          eq(folhaLancamentos.mesReferencia, mesReal),
          eq(folhaLancamentos.tipoLancamento, input.tipoLancamento),
        ))
        .then((r: any[]) => r[0]);

      if (!lancamento) {
        const [newLanc] = await db.insert(folhaLancamentos).values({
          companyId: input.companyId,
          mesReferencia: mesReal,
          tipoLancamento: input.tipoLancamento,
          status: "importado",
          importadoPor: ctx.user?.name || "Sistema",
          importadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
        }).returning();
        lancamento = { id: Number(newLanc.id) };
      }
      const lancamentoId = lancamento.id;

      // Process each file
      let analiticoData: any[] = [];
      let sinteticoData: any[] = [];
      const uploadIds: number[] = [];
      const processedFiles: Array<{ fileName: string; tipo: string; registros: number }> = [];

      for (let i = 0; i < input.arquivos.length; i++) {
        const arquivo = input.arquivos[i];
        const { text, buffer } = textosPDFs[i];

        // Upload to S3
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `folha/${input.companyId}/${mesReal}/${input.tipoLancamento}-${randomSuffix}-${arquivo.fileName}`;
        const { url } = await storagePut(fileKey, buffer, arquivo.mimeType);

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
          month: mesReal,
          fileName: arquivo.fileName,
          fileUrl: url,
          fileKey: fileKey,
          fileSize: buffer.length,
          mimeType: arquivo.mimeType,
          uploadStatus: "processado",
        }).returning();
        const upId = Number(uploadRecord.id);
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
        mesDetectado: mesReal,
        mesRedirecionado,
        alertaMes,
      };
    }),

  // ============================================================
  // IMPORTAR FOLHA (upload de PDF + parse + match) - LEGACY
  // Simplificado: apenas analítico e sintético
  // ============================================================
  importarFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
      tipoLancamento: z.enum(["vale", "pagamento", "decimo_terceiro_1", "decimo_terceiro_2"]),
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
      }).returning();

      const uploadId = Number(uploadRecord.id);

      try {
        // Extract text using pdftotext (much better than pdf-parse)
        const text = await extractTextFromPDF(buffer);

        // Find or create lancamento for this month/type
        let lancamento = await db.select().from(folhaLancamentos)
          .where(and(
            companyFilter(folhaLancamentos.companyId, input),
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
          }).returning();
          lancamento = { id: Number(newLanc.id) };
        }

        const lancamentoId = lancamento.id;

        // Update upload link
        const uploadField = input.tipoArquivo === "analitico" ? "analiticoUploadId" : "sinteticoUploadId";
        await db.update(folhaLancamentos)
          .set({ [uploadField]: uploadId })
          .where(eq(folhaLancamentos.id, lancamentoId));

        // Get all employees for matching
        const allEmployees = await db.select().from(employees)
          .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

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
        .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

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
          companyFilter(timeRecords.companyId, input),
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
      ignorarConferencia: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Buscar lançamento
      const lancamento = await db.select().from(folhaLancamentos)
        .where(eq(folhaLancamentos.id, input.folhaLancamentoId));
      if (lancamento.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lançamento não encontrado' });
      }
      const lanc = lancamento[0];

      // ===== VERIFICAÇÃO DE INCONSISTÊNCIAS (critério do sistema) =====
      if (lanc.companyId) {
        const criterioBloquear = await db.select().from(systemCriteria)
          .where(and(
            eq(systemCriteria.companyId, lanc.companyId),
            eq(systemCriteria.chave, 'folha_bloquear_consolidacao_inconsistencias')
          )).limit(1);
        
        const bloquearAtivo = criterioBloquear.length > 0 ? criterioBloquear[0].valor === '1' : true; // padrão: bloquear
        
        if (bloquearAtivo) {
          // Contar itens com divergências (matchStatus = 'divergente' ou 'unmatched')
          const itensLancTodos = await db.select().from(folhaItens)
            .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));
          const divergentes = itensLancTodos.filter(i => i.matchStatus === 'divergente');
          const naoEncontrados = itensLancTodos.filter(i => i.matchStatus === 'unmatched');
          const totalInconsistencias = divergentes.length + naoEncontrados.length;
          
          if (totalInconsistencias > 0) {
            const detalhes: string[] = [];
            if (divergentes.length > 0) detalhes.push(`${divergentes.length} funcionário(s) com divergências de dados`);
            if (naoEncontrados.length > 0) detalhes.push(`${naoEncontrados.length} funcionário(s) não encontrados no cadastro`);
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Consolidação bloqueada: existem ${totalInconsistencias} inconsistência(s) pendentes.\n\n${detalhes.join('\n')}\n\nResolva todas as inconsistências antes de consolidar, ou desative esta verificação em Configurações > Critérios do Sistema > Folha de Pagamento.`,
            });
          }
        }
      }

      // ===== VERIFICAÇÃO DE CONFERÊNCIA COM CONTABILIDADE =====
      const tipoLanc = lanc.tipoLancamento;
      if (lanc.companyId && (tipoLanc === 'pagamento' || tipoLanc === 'vale') && !input.ignorarConferencia) {
        const criterioConf = await db.select().from(systemCriteria)
          .where(and(
            eq(systemCriteria.companyId, lanc.companyId),
            eq(systemCriteria.chave, 'folha_conferencia_contabilidade')
          )).limit(1);
        const modoConf = criterioConf.length > 0 ? criterioConf[0].valor : 'recomendada';
        if (modoConf !== 'opcional') {
          // Verificar se existe upload de PDF da contabilidade para este mês e tipo
          // Mapear tipo de lançamento para categorias de upload da contabilidade
          const categoriasConf = tipoLanc === 'vale'
            ? ['espelho_adiantamento_analitico', 'adiantamento_sintetico']
            : ['espelho_folha_analitico', 'folha_sintetico'];
          const uploadsConf = await db.select().from(payrollUploads)
            .where(and(
              eq(payrollUploads.companyId, lanc.companyId),
              eq(payrollUploads.month, lanc.mesReferencia!),
              sql`${payrollUploads.category} IN (${sql.join(categoriasConf.map(c => sql`${c}`), sql`, `)})`
            ));
          if (uploadsConf.length === 0) {
            if (modoConf === 'obrigatoria') {
              throw new TRPCError({ code: 'BAD_REQUEST', message: `Conferência com contabilidade é OBRIGATÓRIA para consolidar o ${tipoLanc === 'vale' ? 'Vale' : 'Pagamento'}. Faça o upload do PDF da contabilidade e confira os valores antes de consolidar. Altere em Configurações > Critérios do Sistema > Folha de Pagamento.` });
            }
            // Recomendada: retornar alerta
            return { success: false, alertaConferencia: true, message: `Conferência com contabilidade recomendada. Nenhum PDF da contabilidade foi enviado para o ${tipoLanc === 'vale' ? 'Vale' : 'Pagamento'} de ${lanc.mesReferencia}. Deseja consolidar mesmo assim?` };
          }
        }
      }

      // ===== VERIFICAÇÃO DE OBRA VINCULADA =====
      if (lanc.companyId) {
        const itensLanc = await db.select().from(folhaItens)
          .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));
        const empIdsLanc = itensLanc.filter(i => i.employeeId).map(i => i.employeeId!);
        
        if (empIdsLanc.length > 0 && lanc.mesReferencia) {
          // Buscar registros de ponto
          const pontoRecs = await db.select().from(timeRecords)
            .where(and(
              eq(timeRecords.companyId, lanc.companyId),
              eq(timeRecords.mesReferencia, lanc.mesReferencia),
              inArray(timeRecords.employeeId, empIdsLanc),
            ));
          const empComPonto = new Set(pontoRecs.map(r => r.employeeId));
          
          // Buscar vinculações manuais
          const vinculacoes = await db.select().from(manualObraAssignments)
            .where(and(
              eq(manualObraAssignments.companyId, lanc.companyId),
              eq(manualObraAssignments.mesReferencia, lanc.mesReferencia),
            ));
          const empComVinculacao = new Set(vinculacoes.map(v => v.employeeId));
          
          const semObra = empIdsLanc.filter(id => !empComPonto.has(id) && !empComVinculacao.has(id));
          if (semObra.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Não é possível consolidar: ${semObra.length} funcionário(s) sem obra vinculada. Vincule todos os funcionários a uma obra antes de consolidar.`,
            });
          }
        }
      }

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
      if (empIds.length === 0) return { obrasResumo: [], semObra: null, totalGeral: "0,00" };

      // Get employees
      const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      const empMap = new Map(emps.map(e => [e.id, e]));

      // Get time records for the month
      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.mesReferencia, input.mesReferencia),
          inArray(timeRecords.employeeId, empIds),
        ));

      // Get all obras
      const allObras = await db.select().from(obras)
        .where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));
      const obraMap = new Map(allObras.map(o => [o.id, o]));

      // Get vinculações manuais para este mês
      const vinculacoesManuais = await db.select().from(manualObraAssignments)
        .where(and(
          companyFilter(manualObraAssignments.companyId, input),
          eq(manualObraAssignments.mesReferencia, input.mesReferencia)
        ));
      const vinculacaoManualMap = new Map(vinculacoesManuais.map(v => [v.employeeId, v]));

      // Helper: converte "HH:MM" para horas decimais (ex: "8:30" -> 8.5)
      const hhmmToDecimal = (hhmm: string | null): number => {
        if (!hhmm || hhmm === "0:00" || hhmm === "0") return 0;
        const parts = hhmm.split(":");
        const h = parseInt(parts[0] || "0");
        const m = parseInt(parts[1] || "0");
        return h + m / 60;
      };

      // Group ponto by employee and obra
      const empObraHoras = new Map<number, Map<number | null, { horasTrab: number; horasExtras: number; dias: number }>>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        if (!empObraHoras.has(rec.employeeId)) empObraHoras.set(rec.employeeId, new Map());
        const obraKey = rec.obraId || null;
        const obraGroup = empObraHoras.get(rec.employeeId)!;
        const existing = obraGroup.get(obraKey) || { horasTrab: 0, horasExtras: 0, dias: 0 };
        const horas = hhmmToDecimal(rec.horasTrabalhadas);
        const he = hhmmToDecimal(rec.horasExtras);
        existing.horasTrab += horas;
        existing.horasExtras += he;
        if (horas > 0) existing.dias++;
        obraGroup.set(obraKey, existing);
      }

      // Calculate cost per obra
      const obraCustos = new Map<number | null, {
        obraId: number | null;
        obraNome: string;
        funcionarios: Array<{ id: number; nome: string; funcao: string; horas: number; horasExtras: number; dias: number; custoEstimado: string; liquido: string; percentual?: number; vinculacaoManual?: boolean; justificativa?: string | null }>;
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
          // Sem ponto - verificar se tem vinculação manual
          const vinculacaoManual = vinculacaoManualMap.get(item.employeeId);
          if (vinculacaoManual) {
            // Vinculação manual - alocar na obra destino
            const obraId = vinculacaoManual.obraId;
            if (!obraCustos.has(obraId)) {
              const ob = obraMap.get(obraId);
              obraCustos.set(obraId, {
                obraId,
                obraNome: ob ? ob.nome : `Obra #${obraId}`,
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
              horas: 0, horasExtras: 0, dias: 0,
              custoEstimado: formatBRL(liquidoVal),
              liquido: item.liquido || "0,00",
              percentual: 100,
              vinculacaoManual: true,
              justificativa: vinculacaoManual.justificativa,
            });
            grupo.totalCusto += liquidoVal;
          } else {
            // Sem ponto e sem vinculação manual - alocar em "Sem Obra"
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
          }
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
            percentual: Math.round(proporcao * 1000) / 10, // % de alocação com 1 casa decimal
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
      const totalGeralNum = Array.from(obraCustos.values()).reduce((s, o) => s + o.totalCusto, 0);
      const totalGeral = formatBRL(totalGeralNum);

      // Totais globais de horas
      const allObraValues = Array.from(obraCustos.values());
      const totalHorasNormaisGeral = allObraValues.reduce((s, o) => s + o.totalHoras, 0);
      const totalHEGeral = allObraValues.reduce((s, o) => s + o.totalHE, 0);
      const totalHorasGeral = totalHorasNormaisGeral + totalHEGeral;
      const pctHorasNormais = totalHorasGeral > 0 ? Math.round((totalHorasNormaisGeral / totalHorasGeral) * 1000) / 10 : 0;
      const pctHorasExtras = totalHorasGeral > 0 ? Math.round((totalHEGeral / totalHorasGeral) * 1000) / 10 : 0;
      const totalFuncionarios = new Set(allObraValues.flatMap(o => o.funcionarios.map(f => f.id))).size;

      // ---- Comparativos: mês anterior e mesmo mês do ano anterior ----
      const [anoRef, mesRef] = input.mesReferencia.split("-").map(Number);
      const mesAnterior = mesRef === 1 ? `${anoRef - 1}-12` : `${anoRef}-${String(mesRef - 1).padStart(2, "0")}`;
      const anoAnteriorMesmoMes = `${anoRef - 1}-${String(mesRef).padStart(2, "0")}`;

      const calcComparativo = async (mesComp: string) => {
        const pontoComp = await db.select().from(timeRecords)
          .where(and(
            companyFilter(timeRecords.companyId, input),
            eq(timeRecords.mesReferencia, mesComp),
          ));
        let horasN = 0, horasE = 0, custoTotal = 0;
        const empIdsComp = Array.from(new Set(pontoComp.filter(r => r.employeeId).map(r => r.employeeId!)));
        for (const rec of pontoComp) {
          horasN += hhmmToDecimal(rec.horasTrabalhadas);
          horasE += hhmmToDecimal(rec.horasExtras);
        }
        // Buscar folha do mês comparativo para custo
        const folhaComp = await db.select().from(folhaLancamentos)
          .where(and(
            companyFilter(folhaLancamentos.companyId, input),
            eq(folhaLancamentos.mesReferencia, mesComp),
          ));
        if (folhaComp.length > 0) {
          const folhaCompItens = await db.select().from(folhaItens)
            .where(eq(folhaItens.folhaLancamentoId, folhaComp[0].id));
          custoTotal = folhaCompItens.reduce((s, fi) => s + parseBRL(fi.liquido || "0"), 0);
        }
        return { horasNormais: Math.round(horasN * 10) / 10, horasExtras: Math.round(horasE * 10) / 10, custoTotal, qtdFuncionarios: empIdsComp.length };
      };

      const [compMesAnterior, compAnoAnterior] = await Promise.all([
        calcComparativo(mesAnterior),
        calcComparativo(anoAnteriorMesmoMes),
      ]);

      const calcVariacao = (atual: number, anterior: number) => {
        if (anterior === 0) return atual > 0 ? 100 : 0;
        return Math.round(((atual - anterior) / anterior) * 1000) / 10;
      };

      return {
        obrasResumo,
        semObra: semObra ? {
          ...semObra,
          totalCusto: formatBRL(semObra.totalCusto),
          totalHoras: Math.round(semObra.totalHoras * 10) / 10,
          totalHE: Math.round(semObra.totalHE * 10) / 10,
        } : null,
        totalGeral,
        resumoGlobal: {
          totalHorasNormais: Math.round(totalHorasNormaisGeral * 10) / 10,
          totalHorasExtras: Math.round(totalHEGeral * 10) / 10,
          totalHoras: Math.round(totalHorasGeral * 10) / 10,
          pctHorasNormais,
          pctHorasExtras,
          totalFuncionarios,
          totalCustoNum: totalGeralNum,
        },
        comparativos: {
          mesAnterior: {
            label: mesAnterior,
            ...compMesAnterior,
            variacaoCusto: calcVariacao(totalGeralNum, compMesAnterior.custoTotal),
            variacaoHE: calcVariacao(totalHEGeral, compMesAnterior.horasExtras),
            variacaoHorasNormais: calcVariacao(totalHorasNormaisGeral, compMesAnterior.horasNormais),
          },
          anoAnterior: {
            label: anoAnteriorMesmoMes,
            ...compAnoAnterior,
            variacaoCusto: calcVariacao(totalGeralNum, compAnoAnterior.custoTotal),
            variacaoHE: calcVariacao(totalHEGeral, compAnoAnterior.horasExtras),
            variacaoHorasNormais: calcVariacao(totalHorasNormaisGeral, compAnoAnterior.horasNormais),
          },
        },
      };
    }),

  // ============================================================
  // HORAS EXTRAS POR FUNCIONÁRIO E OBRA
  // ============================================================
  horasExtrasPorFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.mesReferencia, input.mesReferencia),
        ));

      const empIds = Array.from(new Set(pontoRecords.filter(r => r.employeeId).map(r => r.employeeId)));
      if (empIds.length === 0) return { funcionarios: [], rankingObras: [] };

      const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      const empMap = new Map(emps.map(e => [e.id, e]));

      const allObras = await db.select().from(obras).where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));
      const obraMap = new Map(allObras.map(o => [o.id, o]));

      // Buscar critérios de HE da empresa
      const criteriosHE = await db.select().from(systemCriteria)
        .where(and(
          companyFilter(systemCriteria.companyId, input),
          eq(systemCriteria.categoria, 'horas_extras')
        ));
      const criterioMap = new Map(criteriosHE.map(c => [c.chave, c.valor]));
      const pctDiasUteis = parseFloat(criterioMap.get('he_dias_uteis') || '50');
      const pctDomFeriados = parseFloat(criterioMap.get('he_domingos_feriados') || '100');

      // Buscar salário/hora da folha (mais preciso que cadastro)
      const folhaItems = await db.select({
        employeeId: folhaItens.employeeId,
        salarioBase: folhaItens.salarioBase,
        horasMensais: folhaItens.horasMensais,
      }).from(folhaItens)
        .innerJoin(folhaLancamentos, eq(folhaItens.folhaLancamentoId, folhaLancamentos.id))
        .where(and(
          companyFilter(folhaItens.companyId, input),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
          eq(folhaLancamentos.tipoLancamento, 'pagamento'),
        ));
      const folhaSalarioMap = new Map<number, number>(); // empId -> valorHora
      for (const fi of folhaItems) {
        if (fi.employeeId && fi.salarioBase) {
          const salBase = parseBRL(fi.salarioBase);
          const horasMes = fi.horasMensais ? parseBRL(fi.horasMensais) : 220;
          if (salBase > 0 && horasMes > 0) {
            folhaSalarioMap.set(fi.employeeId, salBase / horasMes);
          }
        }
      }

      // Helper: determinar se uma data é domingo ou feriado (HE 100%)
      // Sábado = HE 50% (dia útil extra), Domingo/Feriado = HE 100%
      function isDomFeriado(dateStr: string): boolean {
        const d = new Date(dateStr + 'T12:00:00Z');
        return d.getUTCDay() === 0; // Apenas domingo = 100%
      }
      
      // Helper: verificar se é sábado (HE 50% se não tem jornada)
      function isSabado(dateStr: string): boolean {
        const d = new Date(dateStr + 'T12:00:00Z');
        return d.getUTCDay() === 6;
      }
      
      // Helper: verificar se o funcionário tem jornada definida para o dia
      function temJornadaNoDia(empId: number, dateStr: string): boolean {
        const emp = empMap.get(empId);
        if (!emp?.jornadaTrabalho) return true; // sem jornada definida = assume que trabalha
        try {
          const jornada = typeof emp.jornadaTrabalho === 'string' ? JSON.parse(emp.jornadaTrabalho) : emp.jornadaTrabalho;
          const d = new Date(dateStr + 'T12:00:00Z');
          const dayMap: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
          const dayKey = dayMap[d.getUTCDay()];
          return !!(jornada[dayKey]?.entrada && jornada[dayKey]?.saida);
        } catch { return true; }
      }

      // Converter HH:MM para horas decimais
      function hhmmToHours(val: string | null): number {
        if (!val) return 0;
        const parts = val.split(':');
        if (parts.length === 2) {
          return parseInt(parts[0]) + parseInt(parts[1]) / 60;
        }
        return parseFloat(val.replace(':', '.')) || 0;
      }

      // Group by employee com separação HE50/HE100
      const empHE = new Map<number, {
        he50: number; he100: number; totalHE: number; totalNoturnas: number;
        detalhePorObra: Map<number | null, number>;
        obraPrincipalId: number | null;
      }>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        if (!empHE.has(rec.employeeId)) {
          empHE.set(rec.employeeId, {
            he50: 0, he100: 0, totalHE: 0, totalNoturnas: 0,
            detalhePorObra: new Map(), obraPrincipalId: null
          });
        }
        const data = empHE.get(rec.employeeId)!;
        const he = hhmmToHours(rec.horasExtras);
        const hn = hhmmToHours(rec.horasNoturnas);
        if (he > 0) {
          if (isDomFeriado(rec.data)) {
            // Domingo/Feriado = HE 100%
            data.he100 += he;
          } else if (isSabado(rec.data) && !temJornadaNoDia(rec.employeeId, rec.data)) {
            // Sábado SEM jornada definida = HE 50% (folga trabalhada)
            data.he50 += he;
          } else {
            // Dia útil ou sábado COM jornada = HE 50%
            data.he50 += he;
          }
        }
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

          // Obra principal = a com mais HE
          const obraPrincipal = porObra.length > 0 ? porObra[0] : null;

          // Calcular valor estimado
          // Buscar valor/hora: primeiro da folha, depois do cadastro
          let valorHora = folhaSalarioMap.get(empId) || 0;
          if (valorHora === 0 && emp?.valorHora) {
            valorHora = parseBRL(emp.valorHora);
          }
          if (valorHora === 0 && emp?.salarioBase) {
            const salBase = parseBRL(emp.salarioBase);
            const horasMes = emp.horasMensais ? parseBRL(emp.horasMensais) : 220;
            if (horasMes > 0) valorHora = salBase / horasMes;
          }

          const he50Rounded = Math.round(data.he50 * 10) / 10;
          const he100Rounded = Math.round(data.he100 * 10) / 10;

          // Valor estimado = (HE50 * valorHora * (1 + pct50/100)) + (HE100 * valorHora * (1 + pct100/100))
          const valorEstimado = valorHora > 0
            ? (data.he50 * valorHora * (1 + pctDiasUteis / 100)) + (data.he100 * valorHora * (1 + pctDomFeriados / 100))
            : 0;

          return {
            employeeId: empId,
            nome: emp?.nomeCompleto || "Desconhecido",
            funcao: emp?.funcao || "",
            codigoInterno: emp?.codigoInterno || "",
            totalHE: Math.round(data.totalHE * 10) / 10,
            he50: he50Rounded,
            he100: he100Rounded,
            totalNoturnas: Math.round(data.totalNoturnas * 10) / 10,
            acordoHE: emp?.acordoHoraExtra === 1,
            valorHora: Math.round(valorHora * 100) / 100,
            valorEstimado: Math.round(valorEstimado * 100) / 100,
            obraId: obraPrincipal?.obraId || null,
            obraNome: obraPrincipal?.obraNome || null,
            porObra,
          };
        })
        .sort((a, b) => b.totalHE - a.totalHE);

      // Ranking de obras por HE
      const obraHETotal = new Map<number | null, number>();
      for (const rec of pontoRecords) {
        const he = hhmmToHours(rec.horasExtras);
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const lancamentos = await db.select({
        mesReferencia: folhaLancamentos.mesReferencia,
        tipoLancamento: folhaLancamentos.tipoLancamento,
        status: folhaLancamentos.status,
      }).from(folhaLancamentos)
        .where(and(
          companyFilter(folhaLancamentos.companyId, input),
          sql`${folhaLancamentos.mesReferencia} LIKE ${`${input.ano}-%`}`,
        ));

      const meses: Record<string, { vale: string | null; pagamento: string | null; decimo_terceiro_1: string | null; decimo_terceiro_2: string | null }> = {};
      for (const l of lancamentos) {
        if (!meses[l.mesReferencia]) meses[l.mesReferencia] = { vale: null, pagamento: null, decimo_terceiro_1: null, decimo_terceiro_2: null };
        meses[l.mesReferencia][l.tipoLancamento] = l.status;
      }

      return meses;
    }),

  // ============================================================
  // VINCULAÇÃO MANUAL DE OBRA
  // ============================================================
  listarVinculacoesManuais: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const vinculacoes = await db!.select()
        .from(manualObraAssignments)
        .where(and(
          companyFilter(manualObraAssignments.companyId, input),
          eq(manualObraAssignments.mesReferencia, input.mesReferencia)
        ));
      return vinculacoes;
    }),

  vincularObrasManualmente: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      obraId: z.number(),
      justificativa: z.string().min(5, "Justificativa deve ter pelo menos 5 caracteres"),
      employeeIds: z.array(z.number()).min(1),
      atribuidoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Remover vinculações anteriores desses funcionários neste mês
      for (const empId of input.employeeIds) {
        await db!.delete(manualObraAssignments).where(and(
          companyFilter(manualObraAssignments.companyId, input),
          eq(manualObraAssignments.employeeId, empId),
          eq(manualObraAssignments.mesReferencia, input.mesReferencia)
        ));
      }
      // Inserir novas vinculações
      const rows = input.employeeIds.map(empId => ({
        companyId: input.companyId,
        employeeId: empId,
        obraId: input.obraId,
        mesReferencia: input.mesReferencia,
        justificativa: input.justificativa,
        percentual: 100,
        atribuidoPor: input.atribuidoPor || null,
      }));
      if (rows.length > 0) {
        await db!.insert(manualObraAssignments).values(rows);
      }
      return { vinculados: rows.length };
    }),

  removerVinculacaoManual: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(manualObraAssignments).where(eq(manualObraAssignments.id, input.id));
      return { ok: true };
    }),

  // ============================================================
  // EXPORTAR CUSTOS POR OBRA EM EXCEL
  // ============================================================
  exportarCustosObra: protectedProcedure
    .input(z.object({
      folhaLancamentoId: z.number(),
      companyId: z.number(),
      mesReferencia: z.string(),
      tipo: z.string(), // "vale" ou "pagamento"
    }))
    .mutation(async ({ input }) => {
      const ExcelJS = (await import("exceljs")).default;
      const db = (await getDb())!;

      // Reutilizar lógica de custosPorObra
      const itens = await db.select().from(folhaItens)
        .where(eq(folhaItens.folhaLancamentoId, input.folhaLancamentoId));
      const empIds = itens.filter(i => i.employeeId).map(i => i.employeeId!);
      if (empIds.length === 0) return { base64: "", filename: "vazio.xlsx" };

      const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      const empMap = new Map(emps.map(e => [e.id, e]));

      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.mesReferencia, input.mesReferencia),
          inArray(timeRecords.employeeId, empIds),
        ));

      const allObras = await db.select().from(obras).where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));
      const obraMap = new Map(allObras.map(o => [o.id, o]));

      const vinculacoesManuais = await db.select().from(manualObraAssignments)
        .where(and(
          companyFilter(manualObraAssignments.companyId, input),
          eq(manualObraAssignments.mesReferencia, input.mesReferencia)
        ));
      const vinculacaoManualMap = new Map(vinculacoesManuais.map(v => [v.employeeId, v]));

      const hhmmToDecimal = (hhmm: string | null): number => {
        if (!hhmm || hhmm === "0:00" || hhmm === "0") return 0;
        const parts = hhmm.split(":");
        return parseInt(parts[0] || "0") + parseInt(parts[1] || "0") / 60;
      };

      // Agrupar ponto por empregado e obra
      const empObraHoras = new Map<number, Map<number | null, { horasTrab: number; horasExtras: number }>>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        if (!empObraHoras.has(rec.employeeId)) empObraHoras.set(rec.employeeId, new Map());
        const obraKey = rec.obraId || null;
        const obraGroup = empObraHoras.get(rec.employeeId)!;
        const existing = obraGroup.get(obraKey) || { horasTrab: 0, horasExtras: 0 };
        existing.horasTrab += hhmmToDecimal(rec.horasTrabalhadas);
        existing.horasExtras += hhmmToDecimal(rec.horasExtras);
        obraGroup.set(obraKey, existing);
      }

      // Montar dados por obra
      const obraRows = new Map<string, Array<{ nome: string; funcao: string; horas: number; he: number; pct: number; custo: number; vinculacaoManual: boolean }>>(); 
      for (const item of itens) {
        if (!item.employeeId) continue;
        const emp = empMap.get(item.employeeId);
        const empObras = empObraHoras.get(item.employeeId);
        const liquidoVal = parseBRL(item.liquido || "0");

        if (!empObras || empObras.size === 0) {
          const vinc = vinculacaoManualMap.get(item.employeeId);
          const obraNome = vinc ? (obraMap.get(vinc.obraId)?.nome || "Obra Manual") : "Sem Obra Vinculada";
          if (!obraRows.has(obraNome)) obraRows.set(obraNome, []);
          obraRows.get(obraNome)!.push({ nome: item.nomeColaborador, funcao: emp?.funcao || "", horas: 0, he: 0, pct: 100, custo: liquidoVal, vinculacaoManual: !!vinc });
        } else {
          let totalH = 0;
          for (const [, d] of Array.from(empObras)) totalH += d.horasTrab;
          for (const [obraId, data] of Array.from(empObras)) {
            const prop = totalH > 0 ? data.horasTrab / totalH : 1;
            const ob = obraId ? obraMap.get(obraId) : null;
            const obraNome = ob ? ob.nome : "Sem Obra Vinculada";
            if (!obraRows.has(obraNome)) obraRows.set(obraNome, []);
            obraRows.get(obraNome)!.push({ nome: item.nomeColaborador, funcao: emp?.funcao || "", horas: Math.round(data.horasTrab * 10) / 10, he: Math.round(data.horasExtras * 10) / 10, pct: Math.round(prop * 1000) / 10, custo: liquidoVal * prop, vinculacaoManual: false });
          }
        }
      }

      // Gerar Excel
      const workbook = new ExcelJS.Workbook();
      const mesLabel = input.mesReferencia.replace(/^(\d{4})-(\d{2})$/, (_, y: string, m: string) => {
        const meses = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        return `${meses[parseInt(m)]} ${y}`;
      });

      for (const [obraNome, rows] of Array.from(obraRows.entries())) {
        const sheetName = obraNome.substring(0, 31).replace(/[\[\]\*\?\/\\:]/g, "-");
        const ws = workbook.addWorksheet(sheetName);
        ws.columns = [
          { header: 'Funcionário', key: 'nome', width: 40 },
          { header: 'Função', key: 'funcao', width: 25 },
          { header: 'Horas Trab.', key: 'horas', width: 15 },
          { header: 'Horas Extras', key: 'he', width: 15 },
          { header: '% Aloc.', key: 'pct', width: 12 },
          { header: 'Custo Alocado', key: 'custo', width: 18 },
          { header: 'Vinc. Manual', key: 'vinculacaoManual', width: 15 },
        ];
        // Estilizar header
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

        let totalCusto = 0;
        for (const row of rows.sort((a, b) => a.nome.localeCompare(b.nome))) {
          ws.addRow({ nome: row.nome, funcao: row.funcao, horas: row.horas, he: row.he, pct: row.pct, custo: row.custo, vinculacaoManual: row.vinculacaoManual ? 'Sim' : '' });
          totalCusto += row.custo;
        }
        // Linha de total
        const totalRow = ws.addRow({ nome: 'TOTAL', funcao: '', horas: '', he: '', pct: '', custo: totalCusto, vinculacaoManual: '' });
        totalRow.font = { bold: true };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };

        // Formatar coluna custo como moeda
        ws.getColumn('custo').numFmt = '#,##0.00';
      }

      // Aba resumo
      const resumoWs = workbook.addWorksheet('Resumo');
      resumoWs.columns = [
        { header: 'Obra', key: 'obra', width: 40 },
        { header: 'Funcionários', key: 'qtd', width: 15 },
        { header: 'Total Custo', key: 'custo', width: 20 },
        { header: '% do Total', key: 'pct', width: 15 },
      ];
      resumoWs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      resumoWs.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      let grandTotal = 0;
      for (const [, rows] of Array.from(obraRows.entries())) grandTotal += rows.reduce((s, r) => s + r.custo, 0);
      for (const [obraNome, rows] of Array.from(obraRows.entries()).sort((a, b) => b[1].reduce((s, r) => s + r.custo, 0) - a[1].reduce((s, r) => s + r.custo, 0))) {
        const custoObra = rows.reduce((s, r) => s + r.custo, 0);
        resumoWs.addRow({ obra: obraNome, qtd: rows.length, custo: custoObra, pct: grandTotal > 0 ? Math.round(custoObra / grandTotal * 1000) / 10 : 0 });
      }
      const totalResumo = resumoWs.addRow({ obra: 'TOTAL GERAL', qtd: itens.filter(i => i.employeeId).length, custo: grandTotal, pct: 100 });
      totalResumo.font = { bold: true };
      resumoWs.getColumn('custo').numFmt = '#,##0.00';

      const buffer = await workbook.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');
      const filename = `custos_obra_${input.tipo}_${input.mesReferencia}.xlsx`;
      return { base64, filename };
    }),

  // ============================================================
  // CONTAS BANCÁRIAS DA EMPRESA
  // ============================================================
  listarContasBancarias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(companyBankAccounts)
        .where(companyFilter(companyBankAccounts.companyId, input));
    }),

  criarContaBancaria: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), banco: z.string().min(1),
      codigoBanco: z.string().optional(),
      agencia: z.string().min(1),
      conta: z.string().min(1),
      tipoConta: z.enum(['corrente', 'poupanca']).default('corrente'),
      apelido: z.string().optional(),
      cnpjTitular: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(companyBankAccounts).values(input).returning();
      return { id: result[0].id };
    }),

  atualizarContaBancaria: protectedProcedure
    .input(z.object({
      id: z.number(),
      banco: z.string().min(1).optional(),
      codigoBanco: z.string().optional(),
      agencia: z.string().min(1).optional(),
      conta: z.string().min(1).optional(),
      tipoConta: z.enum(['corrente', 'poupanca']).optional(),
      apelido: z.string().optional(),
      cnpjTitular: z.string().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const db = (await getDb())!;
      await db.update(companyBankAccounts).set(data).where(eq(companyBankAccounts.id, id));
      return { success: true };
    }),

  excluirContaBancaria: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Soft delete
      await db.update(companyBankAccounts).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      } as any).where(eq(companyBankAccounts.id, input.id));
      return { success: true };
    }),

  // Vincular funcionário a conta bancária da empresa
  vincularContaBancariaFuncionario: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      contaBancariaEmpresaId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(employees)
        .set({ contaBancariaEmpresaId: input.contaBancariaEmpresaId })
        .where(eq(employees.id, input.employeeId));
      return { success: true };
    }),

  // ============================================================
  // COMPARATIVO DESCONTOS: Sistema vs Contabilidade
  // ============================================================
  comparativoDescontos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // 1. Descontos calculados pelo sistema (motor CLT)
      const descontosSistema = await db.select().from(pontoDescontos)
        .where(and(
          companyFilter(pontoDescontos.companyId, input),
          eq(pontoDescontos.mesReferencia, input.mesReferencia),
        ));

      const resumosSistema = await db.select().from(pontoDescontosResumo)
        .where(and(
          companyFilter(pontoDescontosResumo.companyId, input),
          eq(pontoDescontosResumo.mesReferencia, input.mesReferencia),
        ));

      // 2. Descontos da contabilidade (folha importada)
      const folhaLanc = await db.select().from(folhaLancamentos)
        .where(and(
          companyFilter(folhaLancamentos.companyId, input),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
          eq(folhaLancamentos.tipoLancamento, 'pagamento'),
        ));

      let itensContabilidade: any[] = [];
      if (folhaLanc.length > 0) {
        itensContabilidade = await db.select().from(folhaItens)
          .where(eq(folhaItens.folhaLancamentoId, folhaLanc[0].id));
      }

      // 3. Buscar funcionários
      const empIds = Array.from(new Set([
        ...descontosSistema.filter(d => d.employeeId).map(d => d.employeeId!),
        ...itensContabilidade.filter(i => i.employeeId).map(i => i.employeeId!),
      ]));

      let emps: any[] = [];
      if (empIds.length > 0) {
        emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      }
      const empMap = new Map(emps.map((e: any) => [e.id, e]));

      // 4. Montar comparativo por funcionário
      const comparativo = empIds.map(empId => {
        const emp = empMap.get(empId);
        const resumo = resumosSistema.find(r => r.employeeId === empId);
        const item = itensContabilidade.find(i => i.employeeId === empId);

        // Descontos do sistema
        const sistemaTotal = parseFloat(resumo?.valorTotalDescontos || '0');
        const sistemaAtrasos = parseFloat(resumo?.valorTotalAtrasos || '0');
        const sistemaFaltas = parseFloat(resumo?.valorTotalFaltas || '0');
        const sistemaDsr = parseFloat(resumo?.valorTotalDsr || '0');

        // Descontos da contabilidade (extrair do JSON de descontos)
        let contabTotal = 0;
        let contabDescontos: any[] = [];
        if (item?.descontos) {
          const desc = Array.isArray(item.descontos) ? item.descontos : [];
          contabDescontos = desc;
          contabTotal = desc.reduce((sum: number, d: any) => sum + parseBRL(d.valor || '0'), 0);
        }

        const diferenca = sistemaTotal - contabTotal;
        const status = Math.abs(diferenca) < 0.01 ? 'ok' : diferenca > 0 ? 'sistema_maior' : 'contab_maior';

        return {
          employeeId: empId,
          nome: emp?.nomeCompleto || 'Desconhecido',
          cargo: emp?.cargo || emp?.funcao || '',
          // Sistema
          sistemaTotal,
          sistemaAtrasos,
          sistemaFaltas,
          sistemaDsr,
          sistemaDetalhes: resumo || null,
          // Contabilidade
          contabTotal,
          contabDescontos,
          // Comparação
          diferenca,
          status,
        };
      }).sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));

      const totalSistema = comparativo.reduce((s, c) => s + c.sistemaTotal, 0);
      const totalContab = comparativo.reduce((s, c) => s + c.contabTotal, 0);

      return {
        comparativo,
        resumo: {
          totalFuncionarios: comparativo.length,
          totalSistema,
          totalContabilidade: totalContab,
          diferencaTotal: totalSistema - totalContab,
          comDivergencia: comparativo.filter(c => c.status !== 'ok').length,
          semDivergencia: comparativo.filter(c => c.status === 'ok').length,
        },
      };
    }),

  // ============================================================
  // CRUZAMENTO HE: Sistema (ponto) vs Contabilidade (folha)
  // ============================================================
  cruzamentoHE: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // 1. HE calculadas pelo sistema (ponto)
      const pontoRecords = await db.select().from(timeRecords)
        .where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.mesReferencia, input.mesReferencia),
        ));

      // Agrupar HE por funcionário
      const heSistemaMap = new Map<number, { he50: number; he100: number; heNoturna: number; totalMinutos: number }>();
      for (const rec of pontoRecords) {
        if (!rec.employeeId) continue;
        const existing = heSistemaMap.get(rec.employeeId) || { he50: 0, he100: 0, heNoturna: 0, totalMinutos: 0 };
        const heTotal = parseInt(String(rec.horasExtras || '0')) || 0;
        const heNot = parseInt(String(rec.horasNoturnas || '0')) || 0;
        existing.he50 += heTotal; // Total HE (sem separação 50/100 no ponto)
        existing.heNoturna += heNot;
        existing.totalMinutos += heTotal;
        heSistemaMap.set(rec.employeeId, existing);
      }

      // 2. HE da contabilidade (folha importada)
      const folhaLanc = await db.select().from(folhaLancamentos)
        .where(and(
          companyFilter(folhaLancamentos.companyId, input),
          eq(folhaLancamentos.mesReferencia, input.mesReferencia),
          eq(folhaLancamentos.tipoLancamento, 'pagamento'),
        ));

      const heContabMap = new Map<number, { he50Valor: number; he100Valor: number; totalValor: number; itens: any[] }>();
      if (folhaLanc.length > 0) {
        const itens = await db.select().from(folhaItens)
          .where(eq(folhaItens.folhaLancamentoId, folhaLanc[0].id));

        for (const item of itens) {
          if (!item.employeeId) continue;
          const proventos = Array.isArray(item.proventos) ? item.proventos : [];
          // Filtrar proventos de HE (descrição contém "hora extra", "HE", etc.)
          const heItens = proventos.filter((p: any) => {
            const desc = (p.descricao || '').toUpperCase();
            return desc.includes('HORA EXTRA') || desc.includes('H.E.') || desc.includes('HE ') || desc.includes('EXTRAS');
          });
          const he50Valor = heItens.filter((p: any) => (p.descricao || '').includes('50')).reduce((s: number, p: any) => s + parseBRL(p.valor || '0'), 0);
          const he100Valor = heItens.filter((p: any) => (p.descricao || '').includes('100')).reduce((s: number, p: any) => s + parseBRL(p.valor || '0'), 0);
          const totalValor = heItens.reduce((s: number, p: any) => s + parseBRL(p.valor || '0'), 0);
          heContabMap.set(item.employeeId, { he50Valor, he100Valor, totalValor, itens: heItens });
        }
      }

      // 3. Solicitações de HE aprovadas
      const heAprovadas = await db.select().from(heSolicitacoes)
        .where(and(
          companyFilter(heSolicitacoes.companyId, input),
          eq(heSolicitacoes.status, 'aprovada'),
        ));

      // Filtrar por mês
      const [ano, mes] = input.mesReferencia.split('-').map(Number);
      const heAprovMes = heAprovadas.filter(h => {
        if (!h.dataSolicitacao) return false;
        const [hAno, hMes] = h.dataSolicitacao.split('-').map(Number);
        return hAno === ano && hMes === mes;
      });

      // Buscar funcionários das solicitações
      let heFuncs: any[] = [];
      if (heAprovMes.length > 0) {
        const heIds = heAprovMes.map(h => h.id);
        heFuncs = await db.select().from(heSolicitacaoFuncionarios)
          .where(inArray(heSolicitacaoFuncionarios.solicitacaoId, heIds));
      }

      // Agrupar solicitações aprovadas por funcionário
      const heAprovMap = new Map<number, number>(); // empId -> total minutos aprovados
      for (const func of heFuncs) {
        const sol = heAprovMes.find(h => h.id === func.solicitacaoId);
        if (!sol) continue;
        // Calcular minutos da solicitação
        const [hI, mI] = (sol.horaInicio || '18:00').split(':').map(Number);
        const [hF, mF] = (sol.horaFim || '20:00').split(':').map(Number);
        const mins = (hF * 60 + mF) - (hI * 60 + mI);
        const existing = heAprovMap.get(func.employeeId) || 0;
        heAprovMap.set(func.employeeId, existing + Math.max(0, mins));
      }

      // 4. Buscar funcionários
      const allEmpIds = Array.from(new Set([...Array.from(heSistemaMap.keys()), ...Array.from(heContabMap.keys()), ...Array.from(heAprovMap.keys())]));
      let emps: any[] = [];
      if (allEmpIds.length > 0) {
        emps = await db.select().from(employees).where(inArray(employees.id, allEmpIds));
      }
      const empMap = new Map(emps.map((e: any) => [e.id, e]));

      // 5. Montar cruzamento
      const cruzamento = allEmpIds.map(empId => {
        const emp = empMap.get(empId);
        const sistema = heSistemaMap.get(empId) || { he50: 0, he100: 0, heNoturna: 0, totalMinutos: 0 };
        const contab = heContabMap.get(empId) || { he50Valor: 0, he100Valor: 0, totalValor: 0, itens: [] };
        const aprovadoMinutos = heAprovMap.get(empId) || 0;

        const sistemaHoras = (sistema.totalMinutos / 60).toFixed(1);
        const aprovadoHoras = (aprovadoMinutos / 60).toFixed(1);
        const heNaoAutorizada = sistema.totalMinutos - aprovadoMinutos;

        return {
          employeeId: empId,
          nome: emp?.nomeCompleto || 'Desconhecido',
          cargo: emp?.cargo || emp?.funcao || '',
          // Sistema (ponto)
          sistemaHe50Min: sistema.he50,
          sistemaHe100Min: sistema.he100,
          sistemaHoras,
          // Solicitações aprovadas
          aprovadoMinutos,
          aprovadoHoras,
          // Contabilidade (folha)
          contabHe50Valor: contab.he50Valor,
          contabHe100Valor: contab.he100Valor,
          contabTotalValor: contab.totalValor,
          contabItens: contab.itens,
          // Divergencias
          heNaoAutorizadaMin: Math.max(0, heNaoAutorizada),
          temDivergencia: contab.totalValor > 0 || sistema.totalMinutos > 0,
        };
      }).filter(c => c.temDivergencia).sort((a, b) => b.heNaoAutorizadaMin - a.heNaoAutorizadaMin);

      return {
        cruzamento,
        resumo: {
          totalFuncionarios: cruzamento.length,
          totalHeSistema: cruzamento.reduce((s, c) => s + parseFloat(c.sistemaHoras), 0).toFixed(1),
          totalHeAprovada: cruzamento.reduce((s, c) => s + parseFloat(c.aprovadoHoras), 0).toFixed(1),
          totalHeContabValor: cruzamento.reduce((s, c) => s + c.contabTotalValor, 0),
          comHeNaoAutorizada: cruzamento.filter(c => c.heNaoAutorizadaMin > 0).length,
        },
      };
    }),
});
