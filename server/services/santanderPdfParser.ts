// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF do SANTANDER (PJ — "Extrato Consolidado
// Inteligente")
// ─────────────────────────────────────────────────────────────────────────────
// O extrato PJ do Santander é PDF de TEXTO SELECIONÁVEL. O layout atual
// ("Extrato_PJ_A4_Inteligente 1.0") coloca DATA + DESCRIÇÃO + VALOR na MESMA
// linha — NÃO em linhas separadas. O modelo de colunas é:
//
//   DD/MM   Descrição [Nº Doc]   [Créditos R$]   [Débitos R$-]   [Saldo R$]
//
// Regras observadas no PDF:
// - CADA LINHA com valor monetário = UMA transação.
// - Linhas SEM valor = continuação da transação anterior (beneficiário, CNPJ,
//   parcela, período etc.).
// - O PRIMEIRO valor monetário da linha é o da transação; valores adicionais
//   na mesma linha são saldo (ignorados).
// - Débito: valor termina em "-" (ex.: "3.000,00-"). Crédito: sem "-".
// - DATA (DD/MM) só aparece na 1ª transação do dia → CARRY-FORWARD.
// - O ANO vem do cabeçalho "janeiro/2026".
// - A seção começa no 1º cabeçalho "Data  Descrição…" e termina em
//   "Saldos por Período" / "Produtos e Serviços" / etc.
//
// Rev. 4106 — DOIS NOVOS CASOS TRATADOS:
//
// CASO A — Layout split (descrição e valor em linhas separadas):
//   Alguns extratos Santander (especialmente contas com PIX RECEBIDO cujo CPF/
//   CNPJ gera uma linha extra) têm a descrição numa linha sem valor e o valor
//   monetário na linha seguinte (com apenas o Nº Doc no prefixo). O parser
//   detecta esse padrão via `transactionStart`: quando uma linha sem valor
//   começa com um dos verbos/tipos canônicos de transação (PIX, TED, CHEQUE,
//   TARIFA, IOF, DEP, RESGATE, etc.), ela é tratada como início de nova
//   transação e sua descrição é staged em `nextDesc`. Na linha seguinte com
//   valor monetário, `nextDesc` substitui o prefixo.
//
// CASO B — Valor da coluna Saldo extraído como linha isolada:
//   O pdf-parse pode extrair o conteúdo da coluna Saldo (ex: "3.896,71-",
//   "0,00") como linha separada sem nenhum texto antes do valor. Essas linhas
//   viravam débitos/créditos fantasma. Se a linha tem valor monetário mas
//   prefixo VAZIO e nenhuma descrição staged (nextDesc=null), ela é ignorada.

export interface ExtratoLine {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // com sinal (negativo = débito)
  saldo: number | null; // sempre null (Santander não expõe saldo por linha)
}

// Rev. 3363 — Rendimento de APLICAÇÃO/RESGATE AUTOMÁTICO (CDB ContaMax)
export interface RendimentoAplicacao {
  competenciaMes: number;
  competenciaAno: number;
  bruto: number;
  iof: number;
  ir: number;
  liquido: number;
  fonte: string;
}

export interface SantanderParseResult {
  lines: ExtratoLine[];
  isSantander: boolean;
  rendimentoAplicacao?: RendimentoAplicacao | null;
}

// Valor monetário BR: "1.234,56" com sufixo "-" opcional (débito).
const RE_MONEY = /(\d{1,3}(?:\.\d{3})*,\d{2})(-?)/g;

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function moneyBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// Todos os valores monetários de uma string como números absolutos.
function moneyMagnitudes(s: string): number[] {
  const out: number[] = [];
  RE_MONEY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_MONEY.exec(s))) out.push(moneyBR(m[1]));
  return out;
}

// Linha SÓ-NÚMERO (sem letras) — usada p/ detectar continuação numérica na
// tabela CDB ContaMax.
function isPureNumberLine(s: string): boolean {
  const t = s.trim();
  return !!t && !/[A-Za-zÀ-ú]/.test(t) && /\d,\d{2}/.test(t);
}

// Remove sufixo doc ("-" final ou espaços) e espaço extra.
function cleanDesc(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*$/, "")
    .trim();
}

// Extrai rendimento da seção "Movimentação Mensal CDB ContaMax".
function parseRendimentoContaMax(
  rawLines: string[], refMonth: number, refYear: number,
): RendimentoAplicacao | null {
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (!/^Acumulado\s+(do\s+)?M[êe]s\b/i.test(t)) continue;
    let nums = moneyMagnitudes(t);
    let j = i + 1;
    while (nums.length < 7 && j < rawLines.length && j <= i + 3 && isPureNumberLine(rawLines[j])) {
      nums = nums.concat(moneyMagnitudes(rawLines[j]));
      j++;
    }
    if (nums.length < 7) continue;
    const bruto = nums[3];
    const iof = Math.abs(nums[4]);
    const ir = Math.abs(nums[5]);
    if (bruto <= 0 && iof <= 0 && ir <= 0) continue;
    const liquido = Math.round((bruto - iof - ir) * 100) / 100;
    return { competenciaMes: refMonth || 0, competenciaAno: refYear, bruto, iof, ir, liquido, fonte: "santander_contamax" };
  }
  return null;
}

// Rev. 4106 — Verbos/tipos que, quando aparecem numa linha SEM valor monetário,
// indicam o início de uma nova transação cujo valor virá na linha seguinte
// (layout split do PDF). Exige `\s` ou `\b` após o token p/ não fazer match
// em substrings (ex: "DEPOSITANTE" ≠ "DEP ").
const TRANSACTION_START_RE = /^(PIX\s|TED\s|DOC\s|CHEQUE\s|DEP\s|DEPOSITO\b|SAQUE\b|TARIFA\s|IOF\s|JUROS\s|MULTA\s|APLICA[ÇC][AÃ]O\s|RESGATE\s|CANCELAMENTO\s|TRANSFER[EÊ]NCIA\s|PAGAMENTO\s|D[EÉ]BITO\s|CR[EÉ]DITO\s|COBRAN[ÇC]A\s|TAXA\s|COMPENSA[ÇC][AÃ]O\s)/i;

export async function parseSantanderExtratoPdf(base64: string): Promise<SantanderParseResult> {
  const clean = base64.replace(/^data:[^,]*,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }

  const pdfParse: any = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buf);
  const text: string = data?.text || "";

  // Rev. 4083 — Restringir a detecção ao marcador ÚNICO do Extrato Consolidado
  // Inteligente ("EXTRATO CONSOLIDADO INTELIGENTE"). O critério anterior incluía
  // "|santander" que batia em QUALQUER PDF com "Santander" no texto — inclusive o
  // formato IBPJ (Internet Banking Empresarial), causando confusão entre parsers.
  const isSantander =
    /EXTRATO CONSOLIDADO INTELIGENTE/i.test(text) &&
    !/Internet Banking Empresarial|IBPJ/i.test(text);
  if (!isSantander) return { lines: [], isSantander: false };

  const rawLines = text.split(/\r?\n/);

  // ANO/MÊS de referência a partir do cabeçalho "janeiro/2026".
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

  function resolveYear(mm: number): number {
    if (!refMonth) return refYear;
    if (mm - refMonth > 6) return refYear - 1;
    if (refMonth - mm > 6) return refYear + 1;
    return refYear;
  }

  // ─── ALGORITMO PRINCIPAL ────────────────────────────────────────────────────
  // Regra principal: CADA linha com valor monetário = 1 transação.
  // Linhas sem valor monetário = continuação da transação anterior OU início
  // de nova transação (quando a linha começa com padrão canônico de transação).
  //
  // Dentro de uma linha de transação:
  //   prefix (antes do 1º valor) = data carry-forward + descrição + nº doc
  //   1º valor = transação (débito se termina "-", crédito se não termina)
  //   Demais valores na mesma linha = saldo (ignorados)
  // ───────────────────────────────────────────────────────────────────────────

  interface PendingTxn { date: string; parts: string[]; valor: number; }

  const out: ExtratoLine[] = [];
  let started = false;
  let currentDate: string | null = null;
  let pending: PendingTxn | null = null;
  // Rev. 4106 — descrição staged quando a linha de descrição aparece ANTES da
  // linha de valor (layout split). Resetada a cada transação emitida.
  let nextDesc: string | null = null;

  function flushPending() {
    if (!pending) return;
    const desc = pending.parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || "Sem descrição";
    out.push({ data: pending.date, descricao: desc.slice(0, 500), valor: pending.valor, saldo: null });
    pending = null;
  }

  const startMovement = /^Data\s*Descri|DataDescri|^Movimenta[çc][aã]o$/i;
  const endMovement =
    /Saldos por Per[ií]odo|Produtos e Servi|Pacote de Servi[çc]os|[ÍI]ndices Econ[oô]micos|Valores Praticados|Resumo das Tarifas/i;
  // Linhas de ruído: cabeçalhos, saldos agregados, rodapés de página.
  const noise =
    /^Cr[ée]ditos\s*D[ée]bitos$|Cr[ée]ditos\s+D[ée]bitos|EXTRATO CONSOLIDADO INTELIGENTE|^Extrato_PJ|^BALP_|^P[áa]gina:|^SALDO\b|SALDO ANTERIOR|^Conta Corrente$|^Movimenta[çc][aã]o$/i;

  for (const raw of rawLines) {
    const t = raw.trim();
    if (!t) continue;

    if (!started) {
      if (startMovement.test(t)) started = true;
      continue;
    }

    if (endMovement.test(t)) { flushPending(); break; }

    // Cabeçalho de seção repetido (nova página) — reinicia flag, não é dado.
    if (startMovement.test(t)) continue;

    if (noise.test(t)) continue;

    // Mês/ano isolado do cabeçalho de página ("janeiro/2026").
    if (/^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*\d{4}$/i.test(t)) continue;

    // ── Detecta se a linha tem valor monetário ──────────────────────────────
    RE_MONEY.lastIndex = 0;
    const moneyMatch = RE_MONEY.exec(t);

    if (!moneyMatch) {
      // Linha SEM valor monetário.
      // Ignora doc sozinho ("-") e números puros de 6 dígitos (nº doc interno).
      if (t !== "-" && !/^\d{6}$/.test(t)) {
        const part = cleanDesc(t);
        if (part) {
          if (TRANSACTION_START_RE.test(part)) {
            // Rev. 4106 — Início de NOVA transação numa linha sem valor.
            // O valor monetário correspondente virá na próxima linha com número
            // (ex: "PIX RECEBIDO 43010898886" em linha separada de "231841 111,33").
            // Flush da transação anterior + staging da descrição.
            flushPending();
            nextDesc = part;
          } else if (nextDesc !== null) {
            // Continuação da descrição staged (nova transação ainda sem valor).
            nextDesc = (nextDesc + " " + part).replace(/\s+/g, " ").trim();
          } else if (pending) {
            // Continuação normal da transação pendente.
            pending.parts.push(part);
          }
        }
      }
      continue;
    }

    // ── LINHA DE TRANSAÇÃO: tem valor monetário ─────────────────────────────
    const valor = moneyBR(moneyMatch[1]) * (moneyMatch[2] === "-" ? -1 : 1);

    // Prefixo = tudo antes do 1º valor (data + descrição + nº doc).
    let prefix = t.slice(0, moneyMatch.index).trim();

    // Tenta extrair data DD/MM do início do prefixo.
    let dateFound = false;
    const dm = prefix.match(/^(\d{2})\/(\d{2})\b(.*)/s);
    if (dm) {
      const dd = parseInt(dm[1], 10);
      const mm = parseInt(dm[2], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        currentDate = `${resolveYear(mm)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        prefix = dm[3].trim();
        dateFound = true;
      }
    }

    if (!currentDate) { nextDesc = null; continue; }

    let desc: string;

    if (nextDesc !== null && !dateFound) {
      // Rev. 4106 — usa descrição staged de linha(s) anterior(es) sem valor.
      // O prefixo desta linha costuma ter apenas o Nº Doc (6 dígitos) ou está
      // vazio — não substitui a descrição real.
      const extraFromPrefix = cleanDesc(
        prefix.replace(/\s+\d{6}\s*$/, "").replace(/\s*-\s*$/, "")
      );
      const isDocOrEmpty = !extraFromPrefix || /^\d+$/.test(extraFromPrefix);
      desc = isDocOrEmpty
        ? nextDesc
        : (nextDesc + " " + extraFromPrefix).replace(/\s+/g, " ").trim();
      nextDesc = null;
    } else if (nextDesc !== null && dateFound) {
      // Nova data encontrada com nextDesc ainda pendente → a descrição staged
      // era órfã (o valor nunca apareceu). Descarta e processa normalmente.
      nextDesc = null;
      desc = cleanDesc(prefix.replace(/\s+\d{6}\s*$/, ""));
    } else if (!prefix && !dateFound) {
      // Rev. 4106 — linha com valor MAS sem prefixo e sem nextDesc staged:
      // quase certamente é o valor da coluna Saldo do lançamento anterior que
      // o pdf-parse extraiu na linha seguinte. Ignora para evitar lançamento fantasma.
      continue;
    } else {
      // Caminho normal: prefixo tem descrição + nº doc.
      desc = cleanDesc(prefix.replace(/\s+\d{6}\s*$/, ""));
    }

    // Emite a transação anterior e inicia a nova.
    flushPending();
    pending = { date: currentDate, parts: desc ? [desc] : [], valor };
  }

  flushPending();

  // Rendimento CDB ContaMax (seção após endMovement, varrida no texto completo).
  let rendimentoAplicacao: RendimentoAplicacao | null = null;
  if (/ContaMax|CDB|Aplica[çc][aã]o\s+Autom/i.test(text)) {
    rendimentoAplicacao = parseRendimentoContaMax(rawLines, refMonth, refYear);
  }

  return { lines: out, isSantander: true, rendimentoAplicacao };
}
