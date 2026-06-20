// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF do SANTANDER (PJ — "Extrato Consolidado
// Inteligente")
// ─────────────────────────────────────────────────────────────────────────────
// Assim como o BANCO DO BRASIL, o extrato PJ do Santander é um PDF de TEXTO
// SELECIONÁVEL — só que o layout é "quebrado" em VÁRIAS linhas por lançamento:
//
//   DataDescriçãoNº DocumentoMovimentos (R$)Saldo (R$)   <- cabeçalho da seção
//   CréditosDébitos                                      <- subcabeçalho
//   02/12        PIX ENVIADO Jaime Souza Alves-          <- data (DD/MM) + desc + doc
//    101,00-                                             <- VALOR (em linha própria)
//        PIX ENVIADO                                     <- nova txn (mesmo dia, sem data)
//   EDP SAO PAULO DISTRIBUICA                            <- continuação da descrição
//   -                                                    <- doc (sozinho)
//    511,68-                                             <- VALOR
//
// Regras do layout:
// - A DATA (DD/MM, sem ano) só aparece na 1ª transação de cada dia → CARRY-FORWARD.
// - O ANO vem do cabeçalho de página ("dezembro/2024").
// - A DESCRIÇÃO pode ocupar VÁRIAS linhas (a contraparte costuma vir na linha
//   seguinte); o nº do documento aparece como "-" ou dígitos puros (linha própria).
// - O VALOR fica SOZINHO numa linha: "9.999,99" com sufixo "-" = DÉBITO; sem "-" =
//   CRÉDITO. O valor é a ÂNCORA que "fecha" (flush) a transação pendente.
// - A seção de movimentação começa após o 1º cabeçalho "DataDescrição..." e termina
//   em "Saldos por Período" / "Produtos e Serviços" / "Índices Econômicos" (resumos
//   e tarifas no fim do PDF, que têm valores monetários e gerariam lançamentos
//   fantasmas se fossem lidos).
//
// Vantagem sobre o fallback de IA (Gemini/Anthropic): é DETERMINÍSTICO, NÃO consome
// cota de IA e — principalmente — NÃO sofre TRUNCAMENTO do JSON da IA (extratos de
// 10+ páginas / centenas de lançamentos estouravam o `maxTokens` e o JSON vinha
// cortado → "Não consegui interpretar o JSON da IA").

export interface ExtratoLine {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // com sinal (negativo = débito)
  saldo: number | null;
}

export interface SantanderParseResult {
  lines: ExtratoLine[];
  isSantander: boolean; // o PDF é mesmo um extrato do Santander?
}

// Token monetário BR ("1.234,56") com sufixo opcional "-" (débito).
const RE_MONEY = /(\d{1,3}(?:\.\d{3})*,\d{2})(-?)/g;
// Linha que começa com data DD/MM.
const RE_DATE_START = /^(\d{2})\/(\d{2})\b(.*)$/;

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function moneyBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// Uma "linha de valor" contém SOMENTE tokens monetários (+ sinais/espaços).
function isValueLine(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  const stripped = s.replace(RE_MONEY, "").replace(/[-\s]/g, "");
  if (stripped !== "") return false;
  RE_MONEY.lastIndex = 0;
  return RE_MONEY.test(s);
}

// 1º token monetário da linha (= o VALOR do lançamento) com seu sinal.
function firstMoney(t: string): { valor: number; debito: boolean } | null {
  RE_MONEY.lastIndex = 0;
  const m = RE_MONEY.exec(t);
  if (!m) return null;
  return { valor: moneyBR(m[1]), debito: m[2] === "-" };
}

// Limpa uma linha de descrição: tira o doc "-" final e dígitos-doc colados no fim.
function cleanDescPart(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*$/, "") // doc "-" no fim
    .trim();
}

export async function parseSantanderExtratoPdf(base64: string): Promise<SantanderParseResult> {
  const clean = base64.replace(/^data:[^,]*,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }

  // pdf-parse é "external" no build; usa o entrypoint da lib (evita o harness de
  // teste do index.js, que tenta ler ./test/data/*.pdf e quebra no bundle).
  const pdfParse: any = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buf);
  const text: string = data?.text || "";

  const isSantander = /EXTRATO CONSOLIDADO INTELIGENTE|santander/i.test(text);
  if (!isSantander) return { lines: [], isSantander: false };

  const rawLines = text.split(/\r?\n/);

  // ANO/MÊS de referência a partir do cabeçalho "dezembro/2024".
  let refYear = new Date().getFullYear();
  let refMonth = 0;
  const my = text.match(
    /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})/i,
  );
  if (my) {
    refMonth = MESES_PT[my[1].toLowerCase()] ?? 0;
    refYear = parseInt(my[2], 10);
  } else {
    const yOnly = text.match(/\b(20\d{2})\b/);
    if (yOnly) refYear = parseInt(yOnly[1], 10);
  }

  // Resolve o ano de uma data DD/MM ancorando no mês de referência (cobre virada
  // de ano: txn de dez. num extrato de jan. = ano anterior, e vice-versa).
  function resolveYear(mm: number): number {
    if (!refMonth) return refYear;
    if (mm - refMonth > 6) return refYear - 1;
    if (refMonth - mm > 6) return refYear + 1;
    return refYear;
  }

  const out: ExtratoLine[] = [];
  let started = false; // já entrou na seção de Movimentação?
  let currentDate: string | null = null; // YYYY-MM-DD em curso (carry-forward)
  let descParts: string[] = []; // descrição da transação pendente

  const flush = () => {
    descParts = [];
  };

  const startMovement = /^Data\s*Descri|DataDescri|^Movimenta[çc][aã]o$/i;
  const endMovement =
    /Saldos por Per[ií]odo|Produtos e Servi|Pacote de Servi[çc]os|[ÍI]ndices Econ[oô]micos|Valores Praticados|Resumo das Tarifas/i;
  const noise =
    /^Cr[ée]ditos\s*D[ée]bitos$|Cr[ée]ditosD[ée]bitos|EXTRATO CONSOLIDADO INTELIGENTE|^Extrato_PJ|^BALP_|^Pagina:|^SALDO\b|SALDO ANTERIOR|^Conta Corrente$|^Movimenta[çc][aã]o$/i;

  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, "");
    const t = line.trim();

    if (!started) {
      if (startMovement.test(t)) started = true;
      continue;
    }
    // Fim da seção de lançamentos → para (evita resumos/tarifas do rodapé).
    if (endMovement.test(t)) break;

    if (!t) continue;
    // Cabeçalho de seção repetido a cada página: reentra na seção, não é dado.
    if (startMovement.test(t)) { flush(); continue; }
    if (noise.test(t)) continue;
    // Mês/ano isolado do cabeçalho de página ("dezembro/2024").
    if (/^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*\d{4}$/i.test(t)) continue;

    // 1) VALOR → fecha a transação pendente.
    if (isValueLine(t)) {
      const mv = firstMoney(t);
      const desc = cleanDescPart(descParts.join(" "));
      // Linha de valor SEM descrição pendente = coluna "Saldo (R$)" do dia impressa
      // sozinha (ex.: "0,00", que aparece logo após o valor do lançamento já fechado)
      // — NÃO é um lançamento. Ignora para não criar transação fantasma.
      if (!mv || !currentDate || !desc) { flush(); continue; }
      out.push({
        data: currentDate,
        descricao: desc.slice(0, 500),
        valor: mv.debito ? -mv.valor : mv.valor,
        saldo: null,
      });
      flush();
      continue;
    }

    // 2) DATA (DD/MM) no início — só conta como NOVA data num limite de transação
    //    (descParts vazio). Mid-transação, um DD/MM é parte da descrição (ex.: nº
    //    de parcela "20/09", competência etc.) → cai no caso 3.
    if (descParts.length === 0) {
      const dm = t.match(RE_DATE_START);
      if (dm) {
        const dd = parseInt(dm[1], 10);
        const mm = parseInt(dm[2], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          currentDate = `${resolveYear(mm)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
          const rest = cleanDescPart(dm[3]);
          if (rest) descParts.push(rest);
          continue;
        }
      }
    }

    // 3) DOC isolado (só "-" ou só dígitos) → ignora; não entra na descrição.
    if (/^-$/.test(t) || /^\d+$/.test(t)) continue;

    // 4) Demais linhas → parte da descrição (1ª linha ou continuação/contraparte).
    const part = cleanDescPart(t);
    if (part) descParts.push(part);
  }

  return { lines: out, isSantander: true };
}
