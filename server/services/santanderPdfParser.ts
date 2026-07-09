// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF do SANTANDER (PJ — "Extrato Consolidado
// Inteligente")
// ─────────────────────────────────────────────────────────────────────────────
// Layout real extraído pelo pdf-parse (validado no extrato de março/2026 da
// conta 13000464-5):
//
//   - CADA linha de lançamento é dividida em DUAS LINHAS pelo pdf-parse:
//       Linha A (sem valor): [DD/MM] DESCRIÇÃO[DocNº]   ← data + descrição + doc concatenado
//       Linha B (com valor): CR/DB-value                ← valor (prefix = vazio)
//   - Data DD/MM só aparece na primeira transação do dia → carry-forward.
//   - Doc de 6 dígitos é concatenado sem espaço ao final da descrição.
//   - Doc "-" é concatenado ao final ou aparece na linha seguinte isolado.
//   - Saldo da coluna Saldo(R$) aparece numa 3ª linha separada (vazia de prefixo).
//   - Continuações (PERIODO:, datas de referência, motivo de devolução) aparecem
//     como linhas sem valor entre a descrição e o valor.
//   - Datas de referência como "26/02/2026" aparecem como continuação (DD/MM/YYYY)
//     e NÃO devem atualizar currentDate (o "/YYYY" no resto as distingue).
//
// ESTRATÉGIA (Rev. 4106):
//   • Extrair data de linhas SEM valor (não só de linhas COM valor).
//   • Limpar doc concatenado (/\d{6}$/) e doc "-" final antes de classificar.
//   • Linhas COM valor + prefixo vazio + nextDesc staged → lançamento correto.
//   • Linhas COM valor + prefixo vazio + nextDesc null → saldo orfão → ignorar.

export interface ExtratoLine {
  data: string;        // YYYY-MM-DD
  descricao: string;
  valor: number;       // com sinal (negativo = débito)
  saldo: number | null;
}

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

const RE_MONEY = /(\d{1,3}(?:\.\d{3})*,\d{2})(-?)/g;

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function moneyBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function moneyMagnitudes(s: string): number[] {
  const out: number[] = [];
  RE_MONEY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_MONEY.exec(s))) out.push(moneyBR(m[1]));
  return out;
}

function isPureNumberLine(s: string): boolean {
  const t = s.trim();
  return !!t && !/[A-Za-zÀ-ú]/.test(t) && /\d,\d{2}/.test(t);
}

function cleanDesc(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s*-\s*$/, "").trim();
}

// Remove doc de 6 dígitos concatenado diretamente ao final da descrição (sem espaço).
// Ex: "DEP DINHEIRO ATM152744" → "DEP DINHEIRO ATM"
//     "PIX RECEBIDO 43010898886231841" → "PIX RECEBIDO 43010898886"
// NÃO remove quando o número faz parte de uma data (últimos dígitos consecutivos < 6).
function stripTrailingDoc6(s: string): string {
  return s.replace(/\d{6}$/, "");
}

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

// Verbos/tipos canônicos do Santander. Quando uma linha SEM valor começa com
// esses termos, é o início de uma nova transação (o valor virá na próxima linha).
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

  const isSantander =
    /EXTRATO CONSOLIDADO INTELIGENTE/i.test(text) &&
    !/Internet Banking Empresarial|IBPJ/i.test(text);
  if (!isSantander) return { lines: [], isSantander: false };

  const rawLines = text.split(/\r?\n/);

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

  // ─────────────────────────────────────────────────────────────────────────────
  // ALGORITMO PRINCIPAL
  //
  // Cada lançamento do Santander PJ tem:
  //   Linha A (sem valor): "[DD/MM] DESCRIÇÃO[doc6]"   ← nova transação ou herda data
  //   Linha B (com valor): "CR/DB value"               ← prefix vazio, usa nextDesc
  //   Linha C (com valor): "Saldo value"               ← prefix vazio, nextDesc=null → ignora
  //
  // Linhas de continuação (PERIODO:, datas DD/MM/YYYY, motivos) também não têm valor
  // e são distinguidas por NÃO começarem com verbo canônico e NÃO terem DD/MM + texto.
  // ─────────────────────────────────────────────────────────────────────────────

  interface PendingTxn { date: string; parts: string[]; valor: number; }

  const out: ExtratoLine[] = [];
  let started = false;
  let currentDate: string | null = null;
  let pending: PendingTxn | null = null;
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

  const startMovement = /^DataDescri|^Data\s*Descri|^Movimenta[çc][aã]o$/i;
  const endMovement =
    /Saldos por Per[ií]odo|Produtos e Servi|Pacote de Servi[çc]os|[ÍI]ndices Econ[oô]micos|Valores Praticados|Resumo das Tarifas/i;
  const noise =
    /^Cr[ée]ditos\s*D[ée]bitos$|Cr[ée]ditos\s+D[ée]bitos|EXTRATO CONSOLIDADO INTELIGENTE|^Extrato_PJ|^BALP_|^P[áa]gina:|^SALDO\b|SALDO ANTERIOR|^Conta Corrente$|^Movimenta[çc][aã]o$|Se\s+sua\s+empresa\s+n[aã]o\s+tiver|sujeito\s+[aà]\s+cobran/i;

  for (const raw of rawLines) {
    const t = raw.trim();
    if (!t) continue;

    if (!started) {
      if (startMovement.test(t)) started = true;
      continue;
    }

    if (endMovement.test(t)) { flushPending(); break; }
    if (startMovement.test(t)) continue; // cabeçalho repetido de página
    if (noise.test(t)) continue;
    if (/^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*\d{4}$/i.test(t)) continue;

    RE_MONEY.lastIndex = 0;
    const moneyMatch = RE_MONEY.exec(t);

    // ══════════════════════════════════════════════════════════════════════════
    // LINHA SEM VALOR MONETÁRIO
    // ══════════════════════════════════════════════════════════════════════════
    if (!moneyMatch) {
      // Doc sozinho ("-") ou 6 dígitos puros → ignorar
      if (t === "-" || /^\d{6}$/.test(t)) continue;

      // ── TENTA EXTRAIR DATA DD/MM ──────────────────────────────────────────
      // Transações: "04/03 DEP DINHEIRO ATM152744" → data 04/03 + descrição
      // Continuação: "26/02/2026" → DM[3]="/2026" começa com "/" → ignora data
      const dm2 = t.match(/^(\d{2})\/(\d{2})\b(.*)/s);
      let treated = false;

      if (dm2) {
        const dd = parseInt(dm2[1], 10);
        const mm = parseInt(dm2[2], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          const restCleaned = cleanDesc(
            stripTrailingDoc6(dm2[3]).replace(/\s*-\s*$/, "")
          );
          // Se o resto começa com "/" é data de continuação (ex: "26/02/2026" → "/2026")
          if (restCleaned && !/^\//.test(restCleaned)) {
            // Nova transação com data explícita
            currentDate = `${resolveYear(mm)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
            flushPending();
            nextDesc = restCleaned;
            treated = true;
          }
          // Se não tratado: cai para continuação abaixo
        }
      }

      if (!treated) {
        // Sem data nova: checar TRANSACTION_START_RE ou tratar como continuação
        const part = cleanDesc(
          stripTrailingDoc6(t).replace(/\s*-\s*$/, "")
        );
        if (!part) continue;

        if (TRANSACTION_START_RE.test(part)) {
          // Nova transação sem data (herda currentDate)
          flushPending();
          nextDesc = part;
        } else if (nextDesc !== null) {
          // Continuação da descrição staged (ex: PERIODO:, datas, motivo devolução)
          nextDesc = (nextDesc + " " + part).replace(/\s+/g, " ").trim();
        } else if (pending) {
          // Continuação da transação pendente
          pending.parts.push(part);
        }
      }
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LINHA COM VALOR MONETÁRIO
    // ══════════════════════════════════════════════════════════════════════════
    const valor = moneyBR(moneyMatch[1]) * (moneyMatch[2] === "-" ? -1 : 1);

    // Prefixo = texto antes do 1º valor (raro neste layout — quase sempre vazio)
    let prefix = t.slice(0, moneyMatch.index).trim();

    // Tenta extrair data do prefixo (formato antigo ou edge-case)
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
      // Usa descrição staged de linha(s) anterior(es) sem valor.
      // O prefixo desta linha, se existir, tende a ser o nº doc — ignoramos.
      const extra = cleanDesc(stripTrailingDoc6(prefix).replace(/\s*-\s*$/, ""));
      const isDocOnly = !extra || /^\d+$/.test(extra);
      desc = isDocOnly
        ? nextDesc
        : (nextDesc + " " + extra).replace(/\s+/g, " ").trim();
      nextDesc = null;
    } else if (nextDesc !== null && dateFound) {
      // Nova data com nextDesc pendente → nextDesc era órfão, descarta
      nextDesc = null;
      desc = cleanDesc(stripTrailingDoc6(prefix));
    } else if (!prefix && !dateFound) {
      // Valor sem prefixo e sem nextDesc staged: é o valor da coluna Saldo
      // do lançamento anterior extraído como linha separada → ignorar.
      continue;
    } else {
      desc = cleanDesc(stripTrailingDoc6(prefix));
    }

    flushPending();
    pending = { date: currentDate, parts: desc ? [desc] : [], valor };
  }

  flushPending();

  // Rendimento CDB ContaMax (seção após endMovement, varrida no texto completo)
  let rendimentoAplicacao: RendimentoAplicacao | null = null;
  if (/ContaMax|CDB|Aplica[çc][aã]o\s+Autom/i.test(text)) {
    rendimentoAplicacao = parseRendimentoContaMax(rawLines, refMonth, refYear);
  }

  return { lines: out, isSantander: true, rendimentoAplicacao };
}
