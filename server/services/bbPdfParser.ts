// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF do BANCO DO BRASIL (internet banking PJ/PF)
// ─────────────────────────────────────────────────────────────────────────────
// Suporta DOIS formatos distintos gerados pelo BB:
//
// FORMATO LEGADO ("C/D"): cada lançamento em UMA linha, valor + indicador C ou D.
//   "11/12/2024000000000000 Saldo Anterior0,00 C"
//   "31/01/2026000000000999 S A L D O0,00 C"
//
// FORMATO NOVO ("(+)/(-)"):  — Rev. 3387
//   "Extrato de Conta Corrente" do Internet Banking PJ. Transações MULTI-LINHA:
//   linha de data (+ descrição opcional) → linha de lote/documento/valor.
//   Ex.:
//     "15/06/2026                          Tarifa Pacote de Serviços"
//     "      13113     881661100616673                                   1,44 (-)"
//   e:
//     "17/06/2026"
//     "      14397     171906263926171     17/06 19:06 29353906000171 FC ENGENHAR   2.100,00 (+)"
//   Linhas de saldo ("Saldo do dia", "Saldo Anterior", "SALDO") têm o mesmo
//   formato de valor mas devem ser IGNORADAS.
//
// DETECÇÃO DE FORMATO: se o texto contém pelo menos um token "X,XX (+)" ou "X,XX (-)"
//   → novo formato. Caso contrário → formato legado.
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

// ── Formato legado: valor como "9.999,99 C" ou "9.999,99 D" ─────────────────
const RE_LINE_DATE = /^(\d{2}\/\d{2}\/\d{4})/;
// FIX (Rev. 3871): pdf-parse do BB impresso no browser colapsa o nº de documento
// com o valor sem espaço: "616.6731,44 D0,00 C" (esperado: "616.673 1,44 D 0,00 C").
// Dois bugs resultantes:
//   1. [CD]\b falha quando D/C é seguido de dígito (ex: "D0") → token de VALOR ignorado.
//   2. Regex casa "712.100,00" dentro de "1712.100,00" → valor errado.
// Solução:
//   a. Pré-stripping do nº de documento (padrão fixo BBrasil: XXX.XXX.XXX.XXX.XXX = 15 dígitos).
//   b. (?<!\d) lookbehind: não pode ser precedido de dígito → evita recorte parcial.
//   c. (?=[\s\d]|$) em vez de \b: D/C pode ser seguido de dígito (saldo colado) ou espaço/fim.
const RE_MONEY_CC = /(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])(?=[\s\d]|$)/g;
// Padrão do nº de documento BB: 5 grupos de 3 dígitos separados por ponto (15 dígitos total).
const RE_BB_DOCNUM = /\d{3}\.\d{3}\.\d{3}\.\d{3}\.\d{3}/g;

// ── Formato novo: valor como "9.999,99 (+)" ou "9.999,99 (-)" ───────────────
const RE_MONEY_PM = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*\(([+-])\)/;

function moneyBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function brDateToISO(d: string): string {
  const [dd, mm, yyyy] = d.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

// Linhas de cabeçalho/rodapé que NÃO contêm valor transacional (formato novo).
// "Saldo do dia" e "SALDO" NÃO ficam aqui — são tratadas separadamente para capturar o saldo diário.
const RE_SKIP_NOVO = /Saldo Anterior|Histórico|Lançamentos|Informações Adicionais|Dia\s+Lote|Total Aplicações|Data de Deb|Juros|Sujeitos a confirm/i;
// Linhas que representam saldo (não são transações) mas têm valor para captura de saldo diário.
const RE_SALDO_LINHA = /Saldo do dia|^SALDO\b/i;

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

  // ── Detecção de formato ────────────────────────────────────────────────────
  const hasNewFormat = RE_MONEY_PM.test(text);

  // ── Variante "VALOR → DATA" (extrato mensal do IB/app novo do BB) ──────────
  // O pdf-parse entrega as linhas nesta ordem, POR transação:
  //   "5.000,00 (+)"                              ← valor (linha só com o token)
  //   "02/01/2026"                                ← data
  //   "1439721306399215041"                       ← lote+documento (só dígitos)
  //   "Pix - Recebido"                            ← descrição
  //   "02/01 13:06 96221305772 ADILSON MENDES"    ← detalhe da descrição
  // Blocos de saldo: "0,00 (+)" / "00/00/0000" / "10318Saldo do dia".
  // Detecção: 3+ ocorrências de linha-valor seguida imediatamente de linha-data.
  const RE_MONEY_ONLY = /^(\d{1,3}(?:\.\d{3})*,\d{2})\s*\(([+-])\)$/;
  const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let valorAntesDaData = 0;
  for (let i = 0; i + 1 < allLines.length; i++) {
    if (RE_MONEY_ONLY.test(allLines[i]) && /^\d{2}\/\d{2}\/\d{4}$/.test(allLines[i + 1])) valorAntesDaData++;
  }

  if (hasNewFormat && valorAntesDaData >= 3) {
    const dailySaldo = new Map<string, number>();
    let curDate: string | null = null; // última data REAL vista (dd ≠ 00)
    let pending: { valor: number; data: string | null; descParts: string[] } | null = null;

    const flush = () => {
      if (!pending) return;
      const p = pending;
      pending = null;
      const descFull = p.descParts.join(" ").replace(/\s+/g, " ").trim();
      // Blocos de saldo não geram lançamento
      if (/Saldo Anterior|Saldo do dia|^S\s*A\s*L\s*D\s*O\b|^SALDO\b/i.test(descFull)) {
        if (/Saldo do dia/i.test(descFull) && curDate) dailySaldo.set(curDate, p.valor);
        return;
      }
      if (!p.data) return;
      out.push({ data: p.data, descricao: (descFull || "Sem descrição").slice(0, 500), valor: p.valor, saldo: null });
    };

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const mMoney = line.match(RE_MONEY_ONLY);
      if (mMoney && i + 1 < allLines.length && /^\d{2}\/\d{2}\/\d{4}$/.test(allLines[i + 1])) {
        flush();
        const [dd, mm, yyyy] = allLines[i + 1].split("/");
        let data: string | null = null;
        if (dd !== "00") {
          data = `${yyyy}-${mm}-${dd}`;
          curDate = data;
        }
        pending = { valor: (mMoney[2] === "+" ? 1 : -1) * moneyBR(mMoney[1]), data, descParts: [] };
        i++; // pula a linha de data
        continue;
      }
      if (!pending) continue;
      // Cabeçalhos/rodapés encerram a transação corrente
      if (RE_SKIP_NOVO.test(line) || /^DiaLote|^Extrato de|^Cliente|^Ag[êe]ncia:/i.test(line)) {
        if (/Saldo Anterior/i.test(line)) pending = null; // bloco de saldo anterior: descarta
        else flush();
        continue;
      }
      // Linha só de dígitos = lote/documento → ignora; "10318Saldo do dia" mantém o texto
      const semLote = line.replace(/^\d+(?=Saldo)/i, "");
      if (/^\d+$/.test(line)) continue;
      pending.descParts.push(semLote);
    }
    flush();

    // Saldo diário no ÚLTIMO lançamento de cada dia
    for (const [date, saldo] of dailySaldo) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].data === date) { out[i].saldo = saldo; break; }
      }
    }
    return { lines: out, isBancoBrasil, semMovimento };
  }

  if (hasNewFormat) {
    // ─────────────────────────────────────────────────────────────────────────
    // NOVO FORMATO "(+)/(-)": transações multi-linha
    // Algoritmo: percorre linha a linha mantendo "data corrente" e "descrição
    // da linha de data". A linha de data atualiza esses dois valores. A linha
    // de valor (contém "X,XX (+/-)" e não é linha de saldo) gera o lançamento.
    // ─────────────────────────────────────────────────────────────────────────
    const textLines = text.split(/\r?\n/);
    let curDate: string | null = null;
    let curDateDesc = "";
    // Mapa de saldo final por dia (capturado das linhas "Saldo do dia")
    const dailySaldo = new Map<string, number>();

    for (const rawLine of textLines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Pular cabeçalhos e rodapés puros (não contêm valor)
      if (RE_SKIP_NOVO.test(line)) continue;

      // Linha de data: atualiza estado; data "00/00/0000" é marcador de saldo → não atualiza curDate
      const dm = line.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (dm) {
        const dd = dm[1];
        if (dd !== "00") {
          curDate = `${dm[3]}-${dm[2]}-${dd}`;
          // Texto após a data (ex.: "Tarifa Pacote de Serviços") vira descrição
          curDateDesc = line.slice(dm[0].length).trim();
        }
        continue; // linhas de data nunca têm valor (+)/(-) na mesma linha
      }

      // Linha de valor?
      const moneyMatch = line.match(RE_MONEY_PM);
      if (!moneyMatch || !curDate) continue;

      const rawVal = moneyBR(moneyMatch[1]);
      const sign = moneyMatch[2] === "+" ? 1 : -1;

      // "Saldo do dia" ou "SALDO": captura o saldo diário mas NÃO gera lançamento
      if (RE_SALDO_LINHA.test(line)) {
        dailySaldo.set(curDate, sign * rawVal);
        continue;
      }

      const valor = sign * rawVal;

      // Descrição: prefere texto da linha de data; senão extrai da linha de valor.
      // Na linha de valor, remove: lote (1º grupo de dígitos), documento (2º grupo)
      // e o token de valor ao final.
      let desc = curDateDesc;
      if (!desc) {
        desc = line
          .replace(/^\d+\s+/, "")    // remove lote (início)
          .replace(/^\d+\s+/, "")    // remove documento (agora no início)
          .replace(RE_MONEY_PM, "")  // remove token de valor
          .replace(/\s+/g, " ")
          .trim();
      }
      if (!desc) desc = "Sem descrição";

      out.push({
        data: curDate,
        descricao: desc.slice(0, 500),
        valor,
        saldo: null,
      });

      // Limpa desc da linha de data para o próximo lançamento do mesmo dia
      curDateDesc = "";
    }

    // Pós-processamento: atribui o saldo diário ao ÚLTIMO lançamento de cada dia.
    // (O extrato BB mostra "Saldo do dia" = saldo após todos os lançamentos do dia.)
    for (const [date, saldo] of dailySaldo) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].data === date) {
          out[i].saldo = saldo;
          break;
        }
      }
    }
  } else {
    // ─────────────────────────────────────────────────────────────────────────
    // FORMATO LEGADO "C/D": uma linha por transação, valor com indicador C ou D.
    // ─────────────────────────────────────────────────────────────────────────
    for (const ln of text.split(/\r?\n/)) {
      const line = ln.trim();
      const dm = line.match(RE_LINE_DATE);
      if (!dm) continue;
      // Linhas-resumo NÃO são transações.
      if (/Saldo Anterior|S\s*A\s*L\s*D\s*O|SALDO DIA/i.test(line)) continue;

      // Pré-processa: remove nº de documento BB (XXX.XXX.XXX.XXX.XXX, 15 dígitos)
      // que o pdf-parse colapsa diretamente contra o valor sem espaço separador.
      RE_BB_DOCNUM.lastIndex = 0;
      const cleanLine = line.replace(RE_BB_DOCNUM, " ");

      const monies: { v: number; dc: string }[] = [];
      let m: RegExpExecArray | null;
      RE_MONEY_CC.lastIndex = 0;
      while ((m = RE_MONEY_CC.exec(cleanLine)) !== null) {
        monies.push({ v: moneyBR(m[1]), dc: m[2] });
      }
      if (monies.length === 0) continue;

      // 1º token monetário = Valor; último = Saldo (quando há 2+). Só Valor → saldo null.
      const valorTok = monies[0];
      const saldoTok = monies.length >= 2 ? monies[monies.length - 1] : null;
      const valor = valorTok.dc === "D" ? -valorTok.v : valorTok.v;

      // Descrição: remove a data, os dígitos colados (ag+lote+histórico), os tokens
      // monetários e qualquer resíduo numérico no fim. Usa cleanLine (sem nº de doc).
      RE_MONEY_CC.lastIndex = 0;
      let desc = cleanLine
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
  }

  return { lines: out, isBancoBrasil, semMovimento };
}
