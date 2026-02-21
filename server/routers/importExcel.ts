import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as XLSX from "xlsx";
import { getDb } from "../db";
import { employees } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Mapeamento de colunas da planilha para campos do banco
const COLUMN_MAP = [
  { header: "Matrícula", field: "matricula", required: false, example: "001" },
  { header: "Nome Completo*", field: "nomeCompleto", required: true, example: "João da Silva" },
  { header: "CPF*", field: "cpf", required: true, example: "123.456.789-00" },
  { header: "RG", field: "rg", required: false, example: "12.345.678-9" },
  { header: "Órgão Emissor", field: "orgaoEmissor", required: false, example: "SSP/SP" },
  { header: "Data Nascimento", field: "dataNascimento", required: false, example: "01/01/1990" },
  { header: "Sexo (M/F/Outro)", field: "sexo", required: false, example: "M" },
  { header: "Estado Civil", field: "estadoCivil", required: false, example: "Solteiro" },
  { header: "Nacionalidade", field: "nacionalidade", required: false, example: "Brasileiro" },
  { header: "Naturalidade", field: "naturalidade", required: false, example: "São Paulo/SP" },
  { header: "Nome da Mãe", field: "nomeMae", required: false, example: "Maria da Silva" },
  { header: "Nome do Pai", field: "nomePai", required: false, example: "José da Silva" },
  { header: "CTPS", field: "ctps", required: false, example: "12345" },
  { header: "Série CTPS", field: "serieCtps", required: false, example: "001" },
  { header: "PIS", field: "pis", required: false, example: "123.45678.90-1" },
  { header: "Título Eleitor", field: "tituloEleitor", required: false, example: "1234 5678 9012" },
  { header: "Cert. Reservista", field: "certificadoReservista", required: false, example: "123456789012" },
  { header: "CNH", field: "cnh", required: false, example: "12345678901" },
  { header: "Categoria CNH", field: "categoriaCnh", required: false, example: "AB" },
  { header: "Validade CNH", field: "validadeCnh", required: false, example: "31/12/2027" },
  { header: "Logradouro", field: "logradouro", required: false, example: "Rua das Flores" },
  { header: "Número", field: "numero", required: false, example: "123" },
  { header: "Complemento", field: "complemento", required: false, example: "Apto 4" },
  { header: "Bairro", field: "bairro", required: false, example: "Centro" },
  { header: "Cidade", field: "cidade", required: false, example: "São Paulo" },
  { header: "Estado (UF)", field: "estado", required: false, example: "SP" },
  { header: "CEP", field: "cep", required: false, example: "01234-567" },
  { header: "Telefone", field: "telefone", required: false, example: "(11) 3456-7890" },
  { header: "Celular", field: "celular", required: false, example: "(11) 91234-5678" },
  { header: "E-mail", field: "email", required: false, example: "joao@email.com" },
  { header: "Contato Emergência", field: "contatoEmergencia", required: false, example: "Maria - Esposa" },
  { header: "Tel. Emergência", field: "telefoneEmergencia", required: false, example: "(11) 91234-5678" },
  { header: "Função*", field: "funcao", required: true, example: "Pedreiro" },
  { header: "Setor*", field: "setor", required: true, example: "Obras" },
  { header: "Data Admissão*", field: "dataAdmissao", required: true, example: "01/02/2024" },
  { header: "Salário Base", field: "salarioBase", required: false, example: "2500.00" },
  { header: "Horas Mensais", field: "horasMensais", required: false, example: "220" },
  { header: "Tipo Contrato", field: "tipoContrato", required: false, example: "CLT" },
  { header: "Jornada", field: "jornadaTrabalho", required: false, example: "07:00 às 17:00" },
  { header: "Banco", field: "banco", required: false, example: "Bradesco" },
  { header: "Agência", field: "agencia", required: false, example: "1234" },
  { header: "Conta", field: "conta", required: false, example: "12345-6" },
  { header: "Tipo Conta", field: "tipoConta", required: false, example: "Corrente" },
  { header: "Chave PIX", field: "chavePix", required: false, example: "123.456.789-00" },
  { header: "Status", field: "status", required: false, example: "Ativo" },
  { header: "Observações", field: "observacoes", required: false, example: "" },
];

// Gerar planilha modelo
function generateTemplate(): Buffer {
  const wb = XLSX.utils.book_new();

  // Aba principal com cabeçalhos e exemplo
  const headers = COLUMN_MAP.map(c => c.header);
  const examples = COLUMN_MAP.map(c => c.example);
  const wsData = [headers, examples];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Larguras de coluna
  ws["!cols"] = COLUMN_MAP.map(c => ({ wch: Math.max(c.header.length, c.example.length, 15) }));

  XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");

  // Aba de instruções
  const instrucoes = [
    ["INSTRUÇÕES DE PREENCHIMENTO"],
    [""],
    ["Campos obrigatórios estão marcados com * no cabeçalho"],
    [""],
    ["CAMPOS OBRIGATÓRIOS:"],
    ["- Nome Completo: Nome completo do colaborador"],
    ["- CPF: Formato 123.456.789-00 (com ou sem pontuação)"],
    ["- Função: Função do colaborador"],
    ["- Setor: Setor de trabalho"],
    ["- Data Admissão: Formato DD/MM/AAAA"],
    [""],
    ["CAMPOS COM VALORES FIXOS:"],
    ["- Sexo: M, F ou Outro"],
    ["- Estado Civil: Solteiro, Casado, Divorciado, Viuvo, Uniao_Estavel"],
    ["- Tipo Contrato: CLT, PJ, Temporario, Estagio, Aprendiz"],
    ["- Tipo Conta: Corrente ou Poupanca"],
    ["- Status: Ativo, Ferias, Afastado, Licenca, Desligado, Recluso, Lista_Negra"],
    ["- Estado (UF): Sigla de 2 letras (SP, RJ, MG, etc.)"],
    [""],
    ["DATAS: Formato DD/MM/AAAA (ex: 01/02/2024)"],
    [""],
    ["DICA: A linha 2 contém exemplos. Apague-a antes de importar ou substitua pelos dados reais."],
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
  wsInst["!cols"] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

// Parse date string DD/MM/YYYY or Excel serial number
function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
    return null;
  }
  const str = String(val).trim();
  // DD/MM/YYYY
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const dd = match[1].padStart(2, "0");
    const mm = match[2].padStart(2, "0");
    return `${match[3]}-${mm}-${dd}`;
  }
  // YYYY-MM-DD
  const match2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match2) return str;
  return null;
}

// Normalize CPF
function normalizeCPF(cpf: string): string {
  return cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

// Validate CPF digits
function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9]) !== check) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return parseInt(digits[10]) === check;
}

// Validate enum values
const VALID_SEXO = ["M", "F", "Outro"];
const VALID_ESTADO_CIVIL = ["Solteiro", "Casado", "Divorciado", "Viuvo", "Uniao_Estavel"];
const VALID_TIPO_CONTRATO = ["CLT", "PJ", "Temporario", "Estagio", "Aprendiz"];
const VALID_TIPO_CONTA = ["Corrente", "Poupanca"];
const VALID_STATUS = ["Ativo", "Ferias", "Afastado", "Licenca", "Desligado", "Recluso", "Lista_Negra"];

interface ParsedRow {
  rowNum: number;
  data: Record<string, any>;
  errors: string[];
  warnings: string[];
}

function parseRow(row: any, rowNum: number): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, any> = {};

  for (const col of COLUMN_MAP) {
    const rawVal = row[col.header];
    const val = rawVal !== undefined && rawVal !== null && rawVal !== "" ? String(rawVal).trim() : null;

    if (col.required && !val) {
      errors.push(`Campo "${col.header}" é obrigatório`);
      continue;
    }

    if (!val) {
      data[col.field] = null;
      continue;
    }

    // Special handling per field
    switch (col.field) {
      case "cpf": {
        const normalized = normalizeCPF(val);
        if (!isValidCPF(val)) {
          errors.push(`CPF inválido: ${val}`);
        }
        data[col.field] = normalized;
        break;
      }
      case "dataNascimento":
      case "dataAdmissao":
      case "validadeCnh": {
        const parsed = parseDate(rawVal);
        if (!parsed) {
          errors.push(`Data inválida em "${col.header}": ${val}`);
        }
        data[col.field] = parsed;
        break;
      }
      case "sexo": {
        const upper = val.toUpperCase();
        const mapped = upper === "MASCULINO" ? "M" : upper === "FEMININO" ? "F" : val;
        if (!VALID_SEXO.includes(mapped)) {
          warnings.push(`Sexo "${val}" não reconhecido, será ignorado`);
          data[col.field] = null;
        } else {
          data[col.field] = mapped;
        }
        break;
      }
      case "estadoCivil": {
        const normalized = val.replace(/\s+/g, "_").replace(/á/g, "a").replace(/ú/g, "u");
        const found = VALID_ESTADO_CIVIL.find(v => v.toLowerCase() === normalized.toLowerCase());
        if (!found) {
          warnings.push(`Estado civil "${val}" não reconhecido`);
          data[col.field] = null;
        } else {
          data[col.field] = found;
        }
        break;
      }
      case "tipoContrato": {
        const found = VALID_TIPO_CONTRATO.find(v => v.toLowerCase() === val.toLowerCase());
        if (!found) {
          warnings.push(`Tipo contrato "${val}" não reconhecido`);
          data[col.field] = null;
        } else {
          data[col.field] = found;
        }
        break;
      }
      case "tipoConta": {
        const mapped = val.toLowerCase().includes("poup") ? "Poupanca" : "Corrente";
        data[col.field] = mapped;
        break;
      }
      case "status": {
        const found = VALID_STATUS.find(v => v.toLowerCase() === val.toLowerCase());
        if (!found) {
          data[col.field] = "Ativo";
          warnings.push(`Status "${val}" não reconhecido, definido como "Ativo"`);
        } else {
          data[col.field] = found;
        }
        break;
      }
      default:
        data[col.field] = val;
    }
  }

  return { rowNum, data, errors, warnings };
}

export const importExcelRouter = router({
  // Gerar template
  downloadTemplate: protectedProcedure.query(async () => {
    const buf = generateTemplate();
    const base64 = buf.toString("base64");
    return { base64, filename: "modelo_colaboradores.xlsx" };
  }),

  // Parse planilha enviada (base64)
  parseUpload: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

      // Pegar primeira aba
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) {
        return { success: false as const, error: "Planilha vazia", rows: [] as any[], summary: { total: 0, valid: 0, errors: 0, warnings: 0 } };
      }

      const parsed = rows.map((row, i) => parseRow(row, i + 2)); // +2 because row 1 is header

      const summary = {
        total: parsed.length,
        valid: parsed.filter(r => r.errors.length === 0).length,
        errors: parsed.filter(r => r.errors.length > 0).length,
        warnings: parsed.filter(r => r.warnings.length > 0).length,
      };

      return {
        success: true as const,
        rows: parsed.map(r => ({
          rowNum: r.rowNum,
          nomeCompleto: r.data.nomeCompleto || "",
          cpf: r.data.cpf || "",
          cargo: r.data.cargo || "",
          setor: r.data.setor || "",
          dataAdmissao: r.data.dataAdmissao || "",
          status: r.data.status || "Ativo",
          errors: r.errors,
          warnings: r.warnings,
          data: r.data,
        })),
        summary,
      };
    }),

  // Importar em lote
  importBatch: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      rows: z.array(z.record(z.string(), z.any())),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results = { inserted: 0, skipped: 0, errors: [] as string[] };

      for (const row of input.rows) {
        try {
          // Build insert data
          const insertData: any = {
            companyId: input.companyId,
            nomeCompleto: row.nomeCompleto,
            cpf: row.cpf,
            status: row.status || "Ativo",
          };

          // Add all optional fields
          const optionalFields = [
            "matricula", "rg", "orgaoEmissor", "dataNascimento", "sexo", "estadoCivil",
            "nacionalidade", "naturalidade", "nomeMae", "nomePai", "ctps", "serieCtps",
            "pis", "tituloEleitor", "certificadoReservista", "cnh", "categoriaCnh", "validadeCnh",
            "logradouro", "numero", "complemento", "bairro", "cidade", "estado", "cep",
            "telefone", "celular", "email", "contatoEmergencia", "telefoneEmergencia",
            "cargo", "funcao", "setor", "dataAdmissao", "salarioBase", "horasMensais",
            "tipoContrato", "jornadaTrabalho", "banco", "agencia", "conta", "tipoConta",
            "chavePix", "observacoes",
          ];

          for (const field of optionalFields) {
            if (row[field] !== null && row[field] !== undefined && row[field] !== "") {
              insertData[field] = row[field];
            }
          }

          await db.insert(employees).values(insertData);
          results.inserted++;
        } catch (err: any) {
          if (err.message?.includes("Duplicate")) {
            results.skipped++;
            results.errors.push(`CPF ${row.cpf} (${row.nomeCompleto}): já cadastrado`);
          } else {
            results.errors.push(`${row.nomeCompleto}: ${err.message}`);
          }
        }
      }

      return results;
    }),
});
