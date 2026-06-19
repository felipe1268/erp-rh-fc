// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF do BANCO DO BRASIL (internet banking PJ/PF)
// ─────────────────────────────────────────────────────────────────────────────
// Diferente da CAIXA (que precisa de parsing por POSIÇÃO X via pdfjs porque o texto
// vem espalhado em colunas), o "Extrato de conta corrente" do BB é um PDF de TEXTO
// SELECIONÁVEL: cada lançamento ocupa UMA linha, com os campos CONCATENADOS:
//
//   <Dt.balancete DD/MM/AAAA><Ag.origem 4d><Lote 5d><Histórico 3d> <descrição>...
//   <Documento><Valor R$ 9.999,99 D|C><Saldo 9.999,99 C|D>
//
// Ex. (conta sem movimento):
//   "11/12/2024000000000000 Saldo Anterior0,00 C"
//   "31/01/2026000000000999 S A L D O0,00 C"
//
// A âncora confiável é o TOKEN MONETÁRIO "9.999,99 C|D": numa linha de movimento há
// dois (Valor e Saldo); em linhas-resumo (Saldo Anterior / SALDO) há um só — e essas
// são ignoradas pela descrição. Quando o BB imprime "*** A CONTA NAO FOI MOVIMENTADA
// ***" não há nenhum lançamento e devolvemos { semMovimento: true, lines: [] }.
//
// Vantagem sobre o fallback de IA (Gemini/Anthropic): é DETERMINÍSTICO e NÃO consome
// cota de IA (free-tier do Gemini estoura com 429 RESOURCE_EXHAUSTED).

export interface ExtratoLine {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // com sinal (negativo = débito)
  saldo: number | null; // com sinal (negativo = saldo devedor "D")
}

export interface BBParseResult {
  lines: ExtratoLine[];
  isBancoBrasil: boolean; // o PDF é mesmo um extrato do BB?
  semMovimento: boolean; // "A CONTA NAO FOI MOVIMENTADA"
}

const RE_LINE_DATE = /^(\d{2}\/\d{2}\/\d{4})/;
// Valor monetário BR seguido do indicador C (crédito) ou D (débito): "1.234,56 D".
const RE_MONEY_CC = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])\b/g;

function moneyBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function brDateToISO(d: string): string {
  const [dd, mm, yyyy] = d.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

export async function parseBancoBrasilExtratoPdf(base64: string): Promise<BBParseResult> {
  const clean = base64.replace(/^data:[^,]*,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }

  // pdf-parse é "external" no build; usa o entrypoint da lib (evita o harness de teste
  // do index.js, que tenta ler ./test/data/*.pdf e quebra no bundle).
  const pdfParse: any = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buf);
  const text: string = data?.text || "";

  const isBancoBrasil =
    /Banco do Brasil|autoatendimento\.bb\.com\.br|Extrato de conta corrente/i.test(text);
  const semMovimento = /N[ÃA]O FOI MOVIMENTAD/i.test(text);

  const out: ExtratoLine[] = [];
  for (const ln of text.split(/\r?\n/)) {
    const line = ln.trim();
    const dm = line.match(RE_LINE_DATE);
    if (!dm) continue;
    // Linhas-resumo NÃO são transações.
    if (/Saldo Anterior|S\s*A\s*L\s*D\s*O|SALDO DIA/i.test(line)) continue;

    const monies: { v: number; dc: string }[] = [];
    let m: RegExpExecArray | null;
    RE_MONEY_CC.lastIndex = 0;
    while ((m = RE_MONEY_CC.exec(line)) !== null) {
      monies.push({ v: moneyBR(m[1]), dc: m[2] });
    }
    if (monies.length === 0) continue;

    // 1º token monetário = Valor; último = Saldo (quando há 2+). Só Valor → saldo null.
    const valorTok = monies[0];
    const saldoTok = monies.length >= 2 ? monies[monies.length - 1] : null;
    const valor = valorTok.dc === "D" ? -valorTok.v : valorTok.v;

    // Descrição: remove a data, os dígitos colados (ag+lote+histórico), os tokens
    // monetários e o nº de documento residual (corrida de dígitos no fim).
    let desc = line
      .replace(RE_LINE_DATE, "")
      .replace(/^\d+/, "")
      .replace(RE_MONEY_CC, " ")
      .replace(/\d{4,}\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!desc) desc = "Sem descrição";

    out.push({
      data: brDateToISO(dm[1]),
      descricao: desc.slice(0, 500),
      valor,
      saldo: saldoTok ? (saldoTok.dc === "C" ? saldoTok.v : -saldoTok.v) : null,
    });
  }

  return { lines: out, isBancoBrasil, semMovimento };
}
