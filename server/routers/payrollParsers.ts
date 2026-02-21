import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  payrollUploads, advances, extraPayments, vrBenefits,
  monthlyPayrollSummary, timeRecords, payroll
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { storagePut } from "../storage";
import { PDFParse } from "pdf-parse";

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse(uint8) as any;
  await parser.load();
  const result = await parser.getText();
  return result.text;
}

// ============================================================
// HELPERS: Parse currency values from Brazilian format
// ============================================================
function parseBRL(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatBRL(val: number): string {
  return val.toFixed(2);
}

// ============================================================
// PARSER 1: Cartão de Ponto DIXI (XLS)
// ============================================================
function parseDixiXLS(buffer: Buffer): {
  records: Array<{
    nome: string;
    data: string;
    hora: string;
    inout: string;
    serialDispositivo: string;
  }>;
  deviceSerial: string;
} {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  
  // Try "Registro Original" sheet first, then first sheet
  const sheetName = workbook.SheetNames.find((n: string) => 
    n.includes("Registro") || n.includes("Original")
  ) || workbook.SheetNames[0];
  
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  const records: any[] = [];
  let deviceSerial = "";
  
  // Skip header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;
    
    const nome = String(row[1] || "").trim();
    if (!nome) continue;
    
    // Parse datetime - could be Excel serial number or string
    let dataStr = "";
    let horaStr = "";
    const rawDate = row[2];
    
    if (typeof rawDate === "number") {
      // Excel serial date
      const dt = XLSX.SSF.parse_date_code(rawDate);
      dataStr = `${String(dt.y).padStart(4, "0")}-${String(dt.m).padStart(2, "0")}-${String(dt.d).padStart(2, "0")}`;
      horaStr = `${String(dt.H).padStart(2, "0")}:${String(dt.M).padStart(2, "0")}`;
    } else {
      const dtStr = String(rawDate);
      // Try to parse "DD/MM/YYYY HH:MM" or similar
      const match = dtStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/);
      if (match) {
        dataStr = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
        horaStr = `${match[4].padStart(2, "0")}:${match[5]}`;
      }
    }
    
    const inout = String(row[4] || "").trim();
    const sn = String(row[7] || row[6] || "").trim();
    if (sn && !deviceSerial) deviceSerial = sn;
    
    if (dataStr && nome) {
      records.push({ nome, data: dataStr, hora: horaStr, inout, serialDispositivo: sn });
    }
  }
  
  return { records, deviceSerial };
}

// Group Dixi records by employee and day, calculate hours
function groupDixiByDay(records: Array<{
  nome: string; data: string; hora: string; inout: string;
}>): Array<{
  nome: string;
  data: string;
  entrada1: string;
  saida1: string;
  entrada2: string;
  saida2: string;
  horasTrabalhadas: string;
}> {
  const grouped: Record<string, Record<string, string[]>> = {};
  
  for (const r of records) {
    const key = r.nome;
    if (!grouped[key]) grouped[key] = {};
    if (!grouped[key][r.data]) grouped[key][r.data] = [];
    grouped[key][r.data].push(r.hora);
  }
  
  const result: any[] = [];
  
  for (const [nome, days] of Object.entries(grouped)) {
    for (const [data, horas] of Object.entries(days)) {
      // Sort hours chronologically
      horas.sort();
      
      const entrada1 = horas[0] || "";
      const saida1 = horas[1] || "";
      const entrada2 = horas[2] || "";
      const saida2 = horas[3] || "";
      
      // Calculate total hours worked
      let totalMinutes = 0;
      if (entrada1 && saida1) {
        totalMinutes += diffMinutes(entrada1, saida1);
      }
      if (entrada2 && saida2) {
        totalMinutes += diffMinutes(entrada2, saida2);
      }
      
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const horasTrabalhadas = `${hours}:${String(mins).padStart(2, "0")}`;
      
      result.push({ nome, data, entrada1, saida1, entrada2, saida2, horasTrabalhadas });
    }
  }
  
  return result;
}

function diffMinutes(start: string, end: string): number {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

// ============================================================
// PARSER 2: PDF Sintético (Adiantamento ou Folha)
// ============================================================
function parseSinteticoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  dataAdmissao: string;
  funcao: string;
  salarioLiquido: number;
}> {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  const results: any[] = [];
  
  // Pattern: Código  Nome  Data Admissão  Função  Salário
  for (const line of lines) {
    // Match lines that start with a number (código)
    const match = line.match(/^(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*$/);
    if (match) {
      results.push({
        codigo: match[1],
        nome: match[2].trim(),
        dataAdmissao: match[3],
        funcao: match[4].trim(),
        salarioLiquido: parseBRL(match[5]),
      });
    }
  }
  
  return results;
}

// ============================================================
// PARSER 3: PDF Pagamento por Banco (CEF ou Santander)
// ============================================================
function parsePagamentoBancoPDF(text: string): {
  banco: string;
  referencia: string;
  dataPagamento: string;
  obras: Array<{
    nomeObra: string;
    funcionarios: Array<{
      nome: string;
      folha: number;
      banco: number;
      horasExtras: number;
      difSalario: number;
      vales: number;
      pagoCaixa: number;
      total: number;
    }>;
    totalObra: number;
  }>;
  totalGeral: number;
} {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  
  let banco = "";
  let referencia = "";
  let dataPagamento = "";
  const obras: any[] = [];
  let currentObra: any = null;
  
  // Detect bank from first line
  if (lines[0]?.includes("CAIXA")) banco = "Caixa_Economica";
  else if (lines[0]?.includes("SANTANDER")) banco = "Santander";
  
  // Find reference and date
  for (const line of lines) {
    const refMatch = line.match(/REFERENTE:\s*(.*?)\s{2,}/);
    if (refMatch) referencia = refMatch[1].trim();
    const dateMatch = line.match(/Pagamento\s+(\d{2}\.\d{2}\.\d{4})/);
    if (dateMatch) dataPagamento = dateMatch[1].replace(/\./g, "/");
  }
  
  // Parse employee lines
  for (const line of lines) {
    // Check for OBRA header
    if (line.includes("OBRA:")) {
      const obraMatch = line.match(/OBRA:\s*(.+)/);
      if (obraMatch) {
        currentObra = { nomeObra: obraMatch[1].trim(), funcionarios: [], totalObra: 0 };
        obras.push(currentObra);
      }
      continue;
    }
    
    // Skip headers and totals
    if (line.startsWith("NOME") || line.startsWith("FOLHA") || line.includes("TOTAL GERAL") || 
        line.includes("TOTAL FOLHA") || line.includes("PAGO CAIXA") || !line.match(/[A-Za-z]/)) continue;
    
    // Try to parse employee line - name followed by R$ values
    const values = line.match(/R\$\s*[\d.,\-]+/g);
    if (values && values.length >= 2) {
      const nameEnd = line.indexOf("R$");
      const nome = line.substring(0, nameEnd).trim();
      if (!nome || nome === "TOTAL") continue;
      
      const nums = values.map(v => parseBRL(v));
      
      if (!currentObra) {
        currentObra = { nomeObra: "Principal", funcionarios: [], totalObra: 0 };
        obras.push(currentObra);
      }
      
      // Columns vary: Folha, Banco, [H.Extras], [Dif.Salário], [Vales], [Pago Caixa], Total
      const func: any = {
        nome,
        folha: nums[0] || 0,
        banco: nums[1] || 0,
        horasExtras: 0,
        difSalario: 0,
        vales: 0,
        pagoCaixa: 0,
        total: nums[nums.length - 1] || 0,
      };
      
      // If more than 3 values, try to map extras
      if (nums.length > 3) {
        func.difSalario = nums[2] || 0;
        func.pagoCaixa = nums[nums.length - 2] || 0;
      }
      
      currentObra.funcionarios.push(func);
    }
  }
  
  // Calculate totals
  let totalGeral = 0;
  for (const obra of obras) {
    obra.totalObra = obra.funcionarios.reduce((s: number, f: any) => s + f.total, 0);
    totalGeral += obra.totalObra;
  }
  
  return { banco, referencia, dataPagamento, obras, totalGeral };
}

// ============================================================
// PARSER 4: PDF Espelho Analítico (Adiantamento ou Folha)
// ============================================================
function parseEspelhoAnaliticoPDF(text: string): Array<{
  codigo: string;
  nome: string;
  dataAdmissao: string;
  salarioBaseHora: string;
  horasMensais: string;
  totalProventos: number;
  totalDescontos: number;
  baseINSS: number;
  valorINSS: number;
  baseFGTS: number;
  valorFGTS: number;
  baseIRRF: number;
  valorIRRF: number;
  liquido: number;
}> {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  const results: any[] = [];
  let current: any = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect employee header: "Código: XXXX  Nome: YYYY"
    const codeMatch = line.match(/C[oó]digo:\s*(\d+)/);
    if (codeMatch) {
      if (current) results.push(current);
      current = {
        codigo: codeMatch[1],
        nome: "",
        dataAdmissao: "",
        salarioBaseHora: "",
        horasMensais: "220:00",
        totalProventos: 0,
        totalDescontos: 0,
        baseINSS: 0, valorINSS: 0,
        baseFGTS: 0, valorFGTS: 0,
        baseIRRF: 0, valorIRRF: 0,
        liquido: 0,
      };
      
      const nameMatch = line.match(/Nome:\s*(.+?)(?:\s{2,}|$)/);
      if (nameMatch) current.nome = nameMatch[1].trim();
    }
    
    if (!current) continue;
    
    // Admissão
    const admMatch = line.match(/Admiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (admMatch) current.dataAdmissao = admMatch[1];
    
    // Salário base (hora)
    const salMatch = line.match(/Sal[aá]rio:\s*([\d.,]+)/);
    if (salMatch) current.salarioBaseHora = salMatch[1];
    
    // Totals
    if (line.includes("Total Proventos")) {
      const val = line.match(/([\d.,]+)\s*$/);
      if (val) current.totalProventos = parseBRL(val[1]);
    }
    if (line.includes("Total Descontos")) {
      const val = line.match(/([\d.,]+)\s*$/);
      if (val) current.totalDescontos = parseBRL(val[1]);
    }
    if (line.match(/L[ií]quido/i)) {
      const val = line.match(/([\d.,]+)\s*$/);
      if (val) current.liquido = parseBRL(val[1]);
    }
    
    // INSS, FGTS, IRRF bases
    if (line.includes("Base INSS") || line.includes("INSS")) {
      const vals = line.match(/[\d.,]+/g);
      if (vals && vals.length >= 1) current.baseINSS = parseBRL(vals[vals.length - 1]);
    }
    if (line.includes("FGTS")) {
      const vals = line.match(/[\d.,]+/g);
      if (vals && vals.length >= 1) current.valorFGTS = parseBRL(vals[vals.length - 1]);
    }
  }
  
  if (current) results.push(current);
  return results;
}

// ============================================================
// ROUTER: Payroll Parsers
// ============================================================
export const payrollParsersRouter = router({
  // Upload and process file
  uploadAndParse: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      category: z.enum([
        "cartao_ponto",
        "espelho_adiantamento_analitico",
        "adiantamento_sintetico",
        "espelho_folha_analitico",
        "folha_sintetico",
      ]),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      fileName: z.string(),
      fileBase64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const buffer = Buffer.from(input.fileBase64, "base64");
      
      // Upload to S3
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `payroll/${input.companyId}/${input.month}/${input.category}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      
      // Save upload record
      const [uploadRecord] = await db.insert(payrollUploads).values({
        companyId: input.companyId,
        category: input.category,
        month: input.month,
        fileName: input.fileName,
        fileUrl: url,
        fileKey: fileKey,
        fileSize: buffer.length,
        mimeType: input.mimeType,
        uploadStatus: "processando",
        uploadedBy: null,
      }).$returningId();
      
      const uploadId = (uploadRecord as any).id;
      
      try {
        let result: any = {};
        let recordsProcessed = 0;
        
        if (input.category === "cartao_ponto") {
          // Parse Dixi XLS
          const { records, deviceSerial } = parseDixiXLS(buffer);
          const grouped = groupDixiByDay(records);
          
          // Insert time records
          for (const rec of grouped) {
            await db.insert(timeRecords).values({
              companyId: input.companyId,
              employeeId: 0, // Will be matched by name later
              data: rec.data,
              entrada1: rec.entrada1,
              saida1: rec.saida1,
              entrada2: rec.entrada2,
              saida2: rec.saida2,
              horasTrabalhadas: rec.horasTrabalhadas,
              fonte: "dixi",
            });
          }
          
          recordsProcessed = grouped.length;
          result = { 
            totalRegistros: records.length, 
            diasProcessados: grouped.length,
            funcionarios: Array.from(new Set(grouped.map(r => r.nome))).length,
            deviceSerial,
            preview: grouped.slice(0, 10),
          };
        } else if (input.category.includes("sintetico")) {
          // Parse Sintético PDF
          const pdfText = await extractTextFromPDF(buffer);
          const parsed = parseSinteticoPDF(pdfText);
          
          recordsProcessed = parsed.length;
          result = {
            totalFuncionarios: parsed.length,
            totalLiquido: formatBRL(parsed.reduce((s, p) => s + p.salarioLiquido, 0)),
            preview: parsed.slice(0, 10),
          };
        } else if (input.category.includes("banco")) {
          // Parse Pagamento por Banco PDF
          const pdfText = await extractTextFromPDF(buffer);
          const parsed = parsePagamentoBancoPDF(pdfText);
          
          recordsProcessed = parsed.obras.reduce((s, o) => s + o.funcionarios.length, 0);
          result = {
            banco: parsed.banco,
            referencia: parsed.referencia,
            dataPagamento: parsed.dataPagamento,
            totalObras: parsed.obras.length,
            totalFuncionarios: recordsProcessed,
            totalGeral: formatBRL(parsed.totalGeral),
            obras: parsed.obras.map(o => ({
              nome: o.nomeObra,
              funcionarios: o.funcionarios.length,
              total: formatBRL(o.totalObra),
            })),
            preview: parsed.obras.flatMap(o => o.funcionarios).slice(0, 10),
          };
        } else if (input.category.includes("analitico")) {
          // Parse Espelho Analítico PDF
          const pdfText = await extractTextFromPDF(buffer);
          const parsed = parseEspelhoAnaliticoPDF(pdfText);
          
          recordsProcessed = parsed.length;
          result = {
            totalFuncionarios: parsed.length,
            totalLiquido: formatBRL(parsed.reduce((s, p) => s + p.liquido, 0)),
            totalProventos: formatBRL(parsed.reduce((s, p) => s + p.totalProventos, 0)),
            totalDescontos: formatBRL(parsed.reduce((s, p) => s + p.totalDescontos, 0)),
            preview: parsed.slice(0, 10),
          };
        }
        
        // Update upload status
        await db.update(payrollUploads)
          .set({ uploadStatus: "processado", recordsProcessed })
          .where(eq(payrollUploads.id, uploadId));
        
        return { success: true, uploadId, recordsProcessed, result };
      } catch (error: any) {
        await db.update(payrollUploads)
          .set({ uploadStatus: "erro", errorMessage: error.message })
          .where(eq(payrollUploads.id, uploadId));
        
        throw error;
      }
    }),

  // List uploads by company and month
  listUploads: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      month: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let conditions = [eq(payrollUploads.companyId, input.companyId)];
      if (input.month) {
        conditions.push(eq(payrollUploads.month, input.month));
      }
      return db.select().from(payrollUploads)
        .where(and(...conditions))
        .orderBy(sql`${payrollUploads.createdAt} DESC`);
    }),

  // Delete upload
  deleteUpload: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(payrollUploads).where(eq(payrollUploads.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // VALE / ADIANTAMENTO: Aprovação
  // ============================================================
  listAdvances: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let conditions = [eq(advances.companyId, input.companyId)];
      if (input.mesReferencia) {
        conditions.push(eq(advances.mesReferencia, input.mesReferencia));
      }
      return db.select().from(advances).where(and(...conditions));
    }),

  approveAdvance: protectedProcedure
    .input(z.object({
      id: z.number(),
      aprovado: z.enum(["Aprovado", "Reprovado"]),
      motivoReprovacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(advances)
        .set({ 
          aprovado: input.aprovado, 
          motivoReprovacao: input.motivoReprovacao || null 
        })
        .where(eq(advances.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // PAGAMENTOS EXTRAS (diferença salário, horas extras por fora)
  // ============================================================
  createExtraPayment: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      mesReferencia: z.string(),
      tipo: z.enum(["Diferenca_Salario", "Horas_Extras", "Reembolso", "Bonus", "Outro"]),
      descricao: z.string().optional(),
      valorHoraBase: z.string().optional(),
      percentualAcrescimo: z.string().optional(),
      quantidadeHoras: z.string().optional(),
      valorTotal: z.string(),
      bancoDestino: z.string().optional(),
      dataPagamento: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(extraPayments).values(input as any).$returningId();
      return { success: true, id: (result as any).id };
    }),

  listExtraPayments: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let conditions = [eq(extraPayments.companyId, input.companyId)];
      if (input.mesReferencia) {
        conditions.push(eq(extraPayments.mesReferencia, input.mesReferencia));
      }
      return db.select().from(extraPayments).where(and(...conditions));
    }),

  // ============================================================
  // VR / IFOOD BENEFÍCIOS
  // ============================================================
  createVrBenefit: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      mesReferencia: z.string(),
      valorDiario: z.string().optional(),
      diasUteis: z.number().optional(),
      valorTotal: z.string(),
      operadora: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(vrBenefits).values(input as any).$returningId();
      return { success: true, id: (result as any).id };
    }),

  listVrBenefits: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let conditions = [eq(vrBenefits.companyId, input.companyId)];
      if (input.mesReferencia) {
        conditions.push(eq(vrBenefits.mesReferencia, input.mesReferencia));
      }
      return db.select().from(vrBenefits).where(and(...conditions));
    }),

  // ============================================================
  // RESUMO MENSAL (custo total do funcionário)
  // ============================================================
  getMonthlySummary: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(monthlyPayrollSummary)
        .where(and(
          eq(monthlyPayrollSummary.companyId, input.companyId),
          eq(monthlyPayrollSummary.mesReferencia, input.mesReferencia),
        ));
    }),

  // ============================================================
  // CÁLCULO DE HORAS EXTRAS
  // ============================================================
  calcularHorasExtras: protectedProcedure
    .input(z.object({
      valorHora: z.number(),
      percentualAcrescimo: z.number(), // ex: 50, 100
      quantidadeHoras: z.number(),
    }))
    .mutation(async ({ input }) => {
      const valorHoraExtra = input.valorHora * (1 + input.percentualAcrescimo / 100);
      const valorTotal = valorHoraExtra * input.quantidadeHoras;
      return {
        valorHoraBase: formatBRL(input.valorHora),
        valorHoraExtra: formatBRL(valorHoraExtra),
        percentualAcrescimo: `${input.percentualAcrescimo}%`,
        quantidadeHoras: input.quantidadeHoras,
        valorTotal: formatBRL(valorTotal),
      };
    }),

  // ============================================================
  // CÁLCULO SALÁRIO HORISTA (com verificação de dias do mês)
  // ============================================================
  calcularSalarioHorista: protectedProcedure
    .input(z.object({
      valorHora: z.number(),
      ano: z.number(),
      mes: z.number(), // 1-12
      horasDiarias: z.number().default(8),
    }))
    .mutation(async ({ input }) => {
      // Calculate working days in the month
      const daysInMonth = new Date(input.ano, input.mes, 0).getDate();
      let diasUteis = 0;
      
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(input.ano, input.mes - 1, d).getDay();
        if (day !== 0 && day !== 6) diasUteis++; // Exclude weekends
      }
      
      const horasMensais = diasUteis * input.horasDiarias;
      const salarioBruto = input.valorHora * horasMensais;
      
      // Check if leap year
      const isBissexto = (input.ano % 4 === 0 && input.ano % 100 !== 0) || (input.ano % 400 === 0);
      
      return {
        diasNoMes: daysInMonth,
        diasUteis,
        horasMensais,
        valorHora: formatBRL(input.valorHora),
        salarioBruto: formatBRL(salarioBruto),
        anoBissexto: isBissexto,
      };
    }),
});
