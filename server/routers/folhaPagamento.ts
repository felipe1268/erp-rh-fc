import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  folhaLancamentos, folhaItens, employees, payrollUploads,
  timeRecords, pontoConsolidacao
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";

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
  return nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// ============================================================
// PARSER: PDF Sintético (lista simples de líquidos)
// Padrão: Código | Nome | Data Adm. | Função | Salário Líquido
// ============================================================
function parseSinteticoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  dataAdmissao: string;
  funcao: string;
  liquido: string;
}> {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  const results: any[] = [];

  for (const line of lines) {
    // Match: número + nome + data dd/mm/yyyy + função + valor
    const match = line.match(/^(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*$/);
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
// PARSER: PDF Analítico (espelho detalhado)
// ============================================================
function parseAnaliticoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  sf: number;
  ir: number;
  dataAdmissao: string;
  salarioBase: string;
  horasMensais: string;
  proventos: Array<{ ref: string; descricao: string; referencia: string; valor: string }>;
  descontos: Array<{ ref: string; descricao: string; referencia: string; valor: string }>;
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
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  const results: any[] = [];
  let current: any = null;
  let section = ""; // proventos | descontos

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect employee header: código + NOME (bold/underlined in PDF)
    // Pattern: number followed by uppercase name
    const headerMatch = line.match(/^(\d{1,4})\s+([A-Z][A-Z\s]+[A-Z])$/);
    if (headerMatch && headerMatch[2].length > 5) {
      if (current) results.push(current);
      current = {
        codigo: headerMatch[1].trim(),
        nome: headerMatch[2].trim(),
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
      section = "";
      continue;
    }

    if (!current) continue;

    // SF and IR line
    const sfMatch = line.match(/SF:\s*(\d+)/);
    if (sfMatch) current.sf = parseInt(sfMatch[1]);
    const irMatch = line.match(/IR:\s*(\d+)/);
    if (irMatch) current.ir = parseInt(irMatch[1]);

    // Admissão, Salário, Horas
    const admMatch = line.match(/Admiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (admMatch) current.dataAdmissao = admMatch[1];

    const salMatch = line.match(/Sal[aá]rio:\s*([\d.,]+)/);
    if (salMatch) current.salarioBase = salMatch[1];

    const horasMatch = line.match(/Horas:\s*([\d:]+)/);
    if (horasMatch) current.horasMensais = horasMatch[1];

    // Section detection
    if (line.includes("PROVENTOS")) { section = "proventos"; continue; }
    if (line.includes("DESCONTOS")) { section = "descontos"; continue; }

    // Total de proventos
    if (line.match(/Total\s+de\s+proventos/i)) {
      const val = line.match(/([\d.,]+)\s*$/);
      if (val) current.totalProventos = val[1];
      section = "";
      continue;
    }

    // Total de descontos
    if (line.match(/Total\s+de\s+descontos/i)) {
      const val = line.match(/([\d.,]+)\s*$/);
      if (val) current.totalDescontos = val[1];
      section = "";
      continue;
    }

    // Líquido
    if (line.match(/L[ií]quido/i) && !line.includes("Sal")) {
      const val = line.match(/([\d.,]+)\s*$/);
      if (val) current.liquido = val[1];
    }

    // Base INSS / FGTS / IRRF (rodapé)
    if (line.match(/Base\s+INSS/i)) {
      const vals = line.match(/([\d.,]+)/g);
      if (vals && vals.length >= 2) {
        current.baseInss = vals[0];
        current.valorInss = vals[1];
      }
    }
    if (line.match(/Base\s+FGTS/i)) {
      const vals = line.match(/([\d.,]+)/g);
      if (vals && vals.length >= 2) {
        current.baseFgts = vals[0];
        current.valorFgts = vals[1];
      }
    }
    if (line.match(/Base\s+IRRF/i)) {
      const vals = line.match(/([\d.,]+)/g);
      if (vals && vals.length >= 1) {
        current.baseIrrf = vals[0];
        if (vals.length >= 2) current.valorIrrf = vals[1];
      }
    }

    // Parse provento/desconto lines: ref + descrição + referência + valor
    if (section === "proventos" || section === "descontos") {
      const itemMatch = line.match(/^(\d{3,5})\s+(.+?)\s+([\d.,]+)\s*$/);
      if (itemMatch) {
        const item = {
          ref: itemMatch[1],
          descricao: itemMatch[2].trim(),
          referencia: "",
          valor: itemMatch[3],
        };
        // Try to split descricao and referencia
        const parts = item.descricao.match(/^(.+?)\s{2,}([\d.,/:]+)$/);
        if (parts) {
          item.descricao = parts[1].trim();
          item.referencia = parts[2].trim();
        }
        current[section].push(item);
      }
    }
  }

  if (current) results.push(current);
  return results;
}

// ============================================================
// PARSER: PDF Resumo por Banco (CEF ou Santander)
// ============================================================
function parseBancoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  agencia: string;
  conta: string;
  liquido: string;
}> {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  const results: any[] = [];

  for (const line of lines) {
    // Pattern: código + nome + agência + conta + valor
    const match = line.match(/^(\d+)\s+(.+?)\s+(\d{3,5})\s+([\d.\-]+)\s+([\d.,]+)\s*$/);
    if (match) {
      results.push({
        codigo: match[1].trim(),
        nome: match[2].trim(),
        agencia: match[3].trim(),
        conta: match[4].trim(),
        liquido: match[5].trim(),
      });
    }
  }

  return results;
}

// ============================================================
// MATCH: Vincular itens da folha com cadastro de funcionários
// ============================================================
async function matchItensComCadastro(
  db: any,
  companyId: number,
  itens: any[],
  allEmployees: any[]
): Promise<{ matched: number; unmatched: number; divergentes: number; details: any[] }> {
  let matched = 0, unmatched = 0, divergentes = 0;
  const details: any[] = [];

  for (const item of itens) {
    let emp = null;
    const divergencias: string[] = [];

    // 1. Match por código contábil
    if (item.codigoContabil) {
      emp = allEmployees.find((e: any) => e.codigoContabil === item.codigoContabil);
    }

    // 2. Fallback: match por nome normalizado
    if (!emp) {
      const nomeNorm = normalizeNome(item.nomeColaborador);
      emp = allEmployees.find((e: any) => normalizeNome(e.nomeCompleto) === nomeNorm);
    }

    // 3. Match parcial por nome (primeiros 3 tokens)
    if (!emp) {
      const tokens = normalizeNome(item.nomeColaborador).split(/\s+/).slice(0, 3);
      emp = allEmployees.find((e: any) => {
        const empTokens = normalizeNome(e.nomeCompleto).split(/\s+/).slice(0, 3);
        return tokens.length >= 2 && empTokens.length >= 2 &&
          tokens[0] === empTokens[0] && tokens[1] === empTokens[1];
      });
    }

    if (emp) {
      item.employeeId = emp.id;

      // Verificar status
      if (emp.status !== "Ativo") {
        divergencias.push(`Status: ${emp.status} (não ativo)`);
      }

      // Verificar salário base
      if (item.salarioBase && emp.salarioBase) {
        const salFolha = parseBRL(item.salarioBase);
        const salCadastro = parseBRL(emp.salarioBase);
        if (salFolha > 0 && salCadastro > 0 && Math.abs(salFolha - salCadastro) > 1) {
          divergencias.push(`Salário: Folha R$ ${item.salarioBase} ≠ Cadastro R$ ${emp.salarioBase}`);
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
      empStatus: emp?.status,
    });
  }

  return { matched, unmatched, divergentes, details };
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

      return {
        vale: vale ? {
          id: vale.id,
          status: vale.status,
          totalFuncionarios: vale.totalFuncionarios,
          totalLiquido: vale.totalLiquido,
          totalDivergencias: vale.totalDivergencias,
          importadoEm: vale.importadoEm,
        } : null,
        pagamento: pagamento ? {
          id: pagamento.id,
          status: pagamento.status,
          totalFuncionarios: pagamento.totalFuncionarios,
          totalLiquido: pagamento.totalLiquido,
          totalDivergencias: pagamento.totalDivergencias,
          importadoEm: pagamento.importadoEm,
        } : null,
        pontoConsolidado: pontoConsolidado.length > 0 && pontoConsolidado[0].status === "consolidado",
      };
    }),

  // ============================================================
  // IMPORTAR FOLHA (upload de PDF + parse + match)
  // ============================================================
  importarFolha: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
      tipoLancamento: z.enum(["vale", "pagamento"]),
      tipoArquivo: z.enum(["analitico", "sintetico", "banco_cef", "banco_santander"]),
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
        "vale-banco_cef": "adiantamento_banco_cef",
        "vale-banco_santander": "adiantamento_banco_santander",
        "pagamento-analitico": "espelho_folha_analitico",
        "pagamento-sintetico": "folha_sintetico",
        "pagamento-banco_cef": "pagamento_banco_cef",
        "pagamento-banco_santander": "pagamento_banco_santander",
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
      }).$returningId();

      const uploadId = (uploadRecord as any).id;

      try {
        // Parse PDF
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(buffer);
        const text = pdfData.text;

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
          }).$returningId();
          lancamento = { id: (newLanc as any).id };
        }

        const lancamentoId = lancamento.id;

        // Update upload link
        const uploadField = {
          analitico: "analiticoUploadId",
          sintetico: "sinteticoUploadId",
          banco_cef: "bancoCefUploadId",
          banco_santander: "bancoSantanderUploadId",
        }[input.tipoArquivo];

        await db.update(folhaLancamentos)
          .set({ [uploadField!]: uploadId })
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

          // Match with cadastro
          const matchResult = await matchItensComCadastro(db, input.companyId, itensToInsert, allEmployees);

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
            match: matchResult,
          };

        } else if (input.tipoArquivo === "sintetico") {
          const parsed = parseSinteticoPDF(text);
          recordsProcessed = parsed.length;

          // Update existing itens with funcao from sintético (if itens exist)
          for (const p of parsed) {
            const nomeNorm = normalizeNome(p.nome);
            // Try to update matching item
            await db.update(folhaItens)
              .set({ funcao: p.funcao })
              .where(and(
                eq(folhaItens.folhaLancamentoId, lancamentoId),
                sql`UPPER(${folhaItens.nomeColaborador}) = ${nomeNorm}`,
              ));
          }

          const totalLiquido = parsed.reduce((s, p) => s + parseBRL(p.liquido), 0);
          parseResult = {
            totalFuncionarios: parsed.length,
            totalLiquido: formatBRL(totalLiquido),
          };

        } else if (input.tipoArquivo === "banco_cef" || input.tipoArquivo === "banco_santander") {
          const parsed = parseBancoPDF(text);
          recordsProcessed = parsed.length;

          const bancoNome = input.tipoArquivo === "banco_cef" ? "Caixa Econômica" : "Santander";

          // Update existing itens with bank data
          for (const p of parsed) {
            const nomeNorm = normalizeNome(p.nome);
            await db.update(folhaItens)
              .set({
                banco: bancoNome,
                agencia: p.agencia,
                conta: p.conta,
              })
              .where(and(
                eq(folhaItens.folhaLancamentoId, lancamentoId),
                sql`UPPER(${folhaItens.nomeColaborador}) = ${nomeNorm}`,
              ));
          }

          const totalLiquido = parsed.reduce((s, p) => s + parseBRL(p.liquido), 0);
          parseResult = {
            banco: bancoNome,
            totalFuncionarios: parsed.length,
            totalLiquido: formatBRL(totalLiquido),
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

      const matchResult = await matchItensComCadastro(db, input.companyId, itens, allEmployees);

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

        // Status check
        if (emp && emp.status !== "Ativo") {
          alertas.push(`⚠️ Funcionário com status "${emp.status}"`);
        }

        // Salary check
        if (emp && item.salarioBase && emp.salarioBase) {
          const salFolha = parseBRL(item.salarioBase);
          const salCadastro = parseBRL(emp.salarioBase);
          if (salFolha > 0 && salCadastro > 0 && Math.abs(salFolha - salCadastro) > 1) {
            alertas.push(`💰 Salário divergente: Folha R$ ${item.salarioBase} ≠ Cadastro R$ ${emp.salarioBase}`);
          }
        }

        // Ponto check
        if (ponto) {
          if (ponto.faltas > 0) {
            alertas.push(`📋 ${ponto.faltas} falta(s) registrada(s) no ponto`);
          }
        } else if (item.employeeId) {
          alertas.push(`📋 Sem registros de ponto para este mês`);
        }

        return {
          id: item.id,
          nome: item.nomeColaborador,
          codigo: item.codigoContabil,
          matchStatus: item.matchStatus,
          liquido: item.liquido,
          salarioFolha: item.salarioBase,
          salarioCadastro: emp?.salarioBase,
          statusEmpregado: emp?.status,
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

      // Group by month
      const meses: Record<string, { vale: string | null; pagamento: string | null }> = {};
      for (const l of lancamentos) {
        if (!meses[l.mesReferencia]) meses[l.mesReferencia] = { vale: null, pagamento: null };
        meses[l.mesReferencia][l.tipoLancamento] = l.status;
      }

      return meses;
    }),
});
