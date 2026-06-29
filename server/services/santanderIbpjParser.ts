// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário SANTANDER — Internet Banking Empresarial (IBPJ).
// ─────────────────────────────────────────────────────────────────────────────
// Diferente do "Extrato Consolidado Inteligente" (santanderPdfParser.ts), este
// extrato é gerado pelo Internet Banking PJ (IBPJ) e tem formato distinto:
//
//   Data completa DD/MM/AAAA | Histórico | [- ]R$ V.VVV,VV
//
// Cada linha é uma única transação. As linhas de saldo intercaladas ("Saldo do
// dia Cc + ContaMax principal") são ignoradas.
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
// Data completa DD/MM/YYYY no início da linha.
const RE_DATE = /^(\d{2})\/(\d{2})\/(\d{4})\s+/;

// Prefixos de linha a ignorar (saldos diários, cabeçalhos, rodapés).
const SKIP_PREFIXES = [
  /^saldo do dia/i,
  /^saldo anterior/i,
  /^saldo em/i,
  /^data\s+hist/i,      // cabeçalho "Data  Histórico  Valor"
  /^agência:/i,
  /^conta:/i,
  /^fc engenharia/i,
  /^internet banking/i,
  /^ibpj/i,
  /^about:blank/i,
  /^\d{2}\/\d{2}\/\d{2},\s+\d{2}:\d{2}/i, // rodapé de data de impressão
];

function moneyBR(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
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

  const rawLines = text.split(/\r?\n/);
  const out: IbpjExtratoLine[] = [];

  for (const raw of rawLines) {
    const t = raw.trim();
    if (!t) continue;

    // Pula linhas de saldo, cabeçalhos e rodapés.
    if (SKIP_PREFIXES.some(re => re.test(t))) continue;

    // Precisa começar com uma data completa DD/MM/YYYY.
    const dateMatch = t.match(RE_DATE);
    if (!dateMatch) continue;

    const dd = dateMatch[1];
    const mm = dateMatch[2];
    const yyyy = dateMatch[3];
    const dataIso = `${yyyy}-${mm}-${dd}`;

    // Resto da linha após a data.
    const rest = t.slice(dateMatch[0].length).trim();

    // Extrai o valor monetário no final da linha.
    const valMatch = rest.match(RE_VALUE);
    if (!valMatch) continue;

    const isDebit = !!valMatch[1]; // tem "- R$"
    const absVal = moneyBR(valMatch[2]);
    const valor = isDebit ? -absVal : absVal;

    // Descrição = tudo antes do valor monetário.
    const valIdx = rest.search(RE_VALUE);
    let descricao = rest.slice(0, valIdx).trim();
    // Remove "- R$ ..." ou "R$ ..." que possa ter sobrado
    descricao = descricao.replace(/[-\s]*R\$\s*$/, "").trim();
    if (!descricao) descricao = "Sem descrição";

    out.push({ data: dataIso, descricao: descricao.slice(0, 500), valor, saldo: null });
  }

  return { lines: out, isIbpj: true };
}
