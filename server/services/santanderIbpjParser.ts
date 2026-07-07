// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário SANTANDER — Internet Banking Empresarial (IBPJ).
// ─────────────────────────────────────────────────────────────────────────────
// Diferente do "Extrato Consolidado Inteligente" (santanderPdfParser.ts), este
// extrato é gerado pelo Internet Banking PJ (IBPJ). Visualmente cada lançamento
// aparece como uma linha (Data | Histórico | Valor), mas o `pdf-parse` extrai o
// texto da tabela QUEBRANDO CADA CÉLULA EM SUA PRÓPRIA LINHA — um lançamento
// típico vira 3 linhas de texto:
//
//   30/06/2026                      <- data sozinha
//   Cheque Emitido/debitado         <- histórico
//   - R$ 1.063,00                   <- valor (às vezes com texto extra colado, ex.:
//                                       "FELIPE COSTA ALVES ME- R$ 37.000,00" ou
//                                       "26/06/2026- R$ 5,30" quando o histórico tem
//                                       uma 2ª data/documento embutido)
//
// As linhas de saldo diário ("Saldo do dia Cc + ContaMax principal") aparecem
// COLADAS na data, sem espaço (ex.: "30/06/2026Saldo do dia..."), numa única
// linha — são ignoradas (não são lançamentos).
//
// Identificação: texto do PDF contém "Internet Banking Empresarial" OU o
// cabeçalho "IBPJ" OU ambos — ausente em extratos do tipo "Consolidado".

export interface IbpjExtratoLine {
  data: string;   // YYYY-MM-DD
  descricao: string;
  valor: number;  // negativo = débito
  saldo: number | null;
}

export interface IbpjParseResult {
  lines: IbpjExtratoLine[];
  isIbpj: boolean;
}

// Valor monetário BR: "1.234,56" com prefixo "- R$" opcional (débito).
const RE_VALUE = /(-\s*)?R\$\s*([\d.]+,\d{2})/;
// Data completa DD/MM/YYYY sozinha na linha (marca o início de um bloco multi-linha).
const PURE_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
// Data completa DD/MM/YYYY seguida de espaço + resto (formato de 1 linha só).
const RE_DATE_SPACE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/;
// Data completa DD/MM/YYYY colada diretamente ao texto seguinte (sem espaço).
const RE_DATE_GLUED = /^(\d{2})\/(\d{2})\/(\d{4})(\S.*)$/;

// Linhas a ignorar: saldos diários, cabeçalhos, rodapés, boilerplate de contato.
// Rev. 4083 — expandido com mais razões sociais comuns e variações de rodapé.
const SKIP_LINE_RES = [
  /^saldo do dia/i,
  /^saldo anterior/i,
  /^saldo em/i,
  /^data$/i,
  /^hist[oó]rico$/i,
  /^valor$/i,
  /^agência:/i,
  /^conta:/i,
  // razões sociais das empresas (cabeçalho do IBPJ)
  /^fc engenharia/i,
  /^locnow /i,
  /^julio ferraz/i,
  /^internet banking/i,
  /^ibpj/i,
  /^about:blank/i,
  /^central de atendimento/i,
  /^das \d/i,
  /^sac$/i,
  /^ouvidoria$/i,
  /^sac e ouvidoria$/i,
  /^atendimento 24h/i,
  /^canal exclusivo/i,
  /^https?:\/\//i,
  /^0800\s*\d/i,
  /^\d{4}\s*\d{4}\s*\(/i, // telefone tipo "4004 2125 (Capitais...)"
  /^55\s*\(11\)/i,
  /^\d{2}\/\d{2}\/\d{2},\s+\d{2}:\d{2}/i, // rodapé de data de impressão
  /^\d+\/\d+$/, // número de página isolado (ex.: "1/4", "2/3")
];

const MAX_BLOCK_LOOKAHEAD = 10;

function moneyBR(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

function isSaldoText(s: string): boolean {
  return /^saldo\s+(do\s+dia|anterior|em)\b/i.test(s.trim());
}

function isSkippable(line: string): boolean {
  return SKIP_LINE_RES.some(re => re.test(line));
}

function buildDescricao(parts: string[]): string {
  const descricao = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return descricao || "Sem descrição";
}

function extractValor(line: string): { valor: number; prefix: string } | null {
  const valMatch = line.match(RE_VALUE);
  if (!valMatch) return null;
  const isDebit = !!valMatch[1];
  const absVal = moneyBR(valMatch[2]);
  const valor = isDebit ? -absVal : absVal;
  const idx = line.search(RE_VALUE);
  const prefix = line.slice(0, idx).trim();
  return { valor, prefix };
}

export async function parseSantanderIbpjPdf(base64: string): Promise<IbpjParseResult> {
  const clean = base64.replace(/^data:[^,]*,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }

  const pdfParse: any = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buf);
  const text: string = data?.text || "";

  // Identificação: deve conter marcas do Internet Banking PJ (ausente no Consolidado).
  const isIbpj =
    /Internet Banking Empresarial/i.test(text) ||
    /IBPJ/i.test(text) ||
    /Internet\s+Banking\s+PJ/i.test(text);

  if (!isIbpj) return { lines: [], isIbpj: false };

  const rawLines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const out: IbpjExtratoLine[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    if (isSkippable(line)) {
      i++;
      continue;
    }

    // Formato de 1 linha só, COM espaço após a data: "DD/MM/AAAA  Histórico  [-]R$ V,VV".
    const spaceMatch = line.match(RE_DATE_SPACE);
    if (spaceMatch) {
      const [, dd, mm, yyyy, rest] = spaceMatch;
      if (!isSaldoText(rest)) {
        const parsed = extractValor(rest);
        if (parsed) {
          out.push({
            data: `${yyyy}-${mm}-${dd}`,
            descricao: buildDescricao([parsed.prefix]).slice(0, 500),
            valor: parsed.valor,
            saldo: null,
          });
        }
      }
      i++;
      continue;
    }

    // Formato de 1 linha só, SEM espaço após a data (ex.: saldo diário, ou raramente
    // um lançamento emendado): "DD/MM/AAAAtexto...[-]R$ V,VV".
    const gluedMatch = line.match(RE_DATE_GLUED);
    if (gluedMatch) {
      const [, dd, mm, yyyy, rest] = gluedMatch;
      if (!isSaldoText(rest)) {
        const parsed = extractValor(rest);
        if (parsed) {
          out.push({
            data: `${yyyy}-${mm}-${dd}`,
            descricao: buildDescricao([parsed.prefix]).slice(0, 500),
            valor: parsed.valor,
            saldo: null,
          });
        }
      }
      i++;
      continue;
    }

    // Formato multi-linha: a linha contém SÓ a data (célula "Data" isolada pelo
    // pdf-parse); histórico e valor vêm em uma ou mais linhas seguintes.
    const pureMatch = line.match(PURE_DATE);
    if (pureMatch) {
      const [, dd, mm, yyyy] = pureMatch;
      const descParts: string[] = [];
      let j = i + 1;
      let emitted = false;
      while (j < rawLines.length && j - i <= MAX_BLOCK_LOOKAHEAD) {
        const l2 = rawLines[j];
        // Outra data "pura" apareceu antes de achar o valor: bloco incompleto/quebrado
        // (não deveria acontecer em extratos normais) — aborta sem emitir.
        if (PURE_DATE.test(l2)) break;
        if (isSkippable(l2)) {
          // Rev. 4083 — Bug: "Saldo do dia..." era pulado (continue), mas a linha
          // seguinte com o valor (ex.: "- R$ 6.414,44") era emitida como transação.
          // Quando o bloco É de saldo, abortar sem emitir nada.
          if (isSaldoText(l2)) break;
          j++;
          continue;
        }
        const parsed = extractValor(l2);
        if (parsed) {
          descParts.push(parsed.prefix);
          out.push({
            data: `${yyyy}-${mm}-${dd}`,
            descricao: buildDescricao(descParts).slice(0, 500),
            valor: parsed.valor,
            saldo: null,
          });
          emitted = true;
          j++;
          break;
        }
        descParts.push(l2);
        j++;
      }
      i = emitted ? j : i + 1;
      continue;
    }

    i++;
  }

  return { lines: out, isIbpj: true };
}
