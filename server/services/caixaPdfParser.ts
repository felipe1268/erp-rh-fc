// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF da CAIXA ECONÔMICA FEDERAL (internet banking)
// ─────────────────────────────────────────────────────────────────────────────
// O PDF "extrato_pdf" da Caixa tem layout em colunas com posições X estáveis:
//   Data (DD/MM/AAAA)  x≈54   |  Documento  x≈151  |  Histórico  x≈211
//   Valor (R$ / - R$)  x≈545  |  Saldo (R$ ... C|D)  x≈723
// Cada transação ocupa várias linhas (y próximos): histórico pode vir numa linha
// solta ACIMA da data ("PIX RECEBIDO", "CREDITO TRANSF INTERNET"...), o valor+saldo
// ficam na "linha-valor" e a contraparte/CNPJ aparece na linha da Data Efetiva
// (DD/MM HH:MM) logo ABAIXO. Linhas "SALDO DIA", cabeçalhos e rodapés são ignorados.
//
// A âncora confiável é a LINHA-VALOR: a única que tem ao mesmo tempo um Valor
// (faixa X 520–700 com "R$") e um Saldo (faixa X≥700 com "R$ ... C|D").
// Validado empiricamente: a continuidade de saldo (saldo_anterior + valor =
// saldo_seguinte) bate em 100% das linhas do extrato de referência.

export interface ExtratoLine {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // com sinal (negativo = débito)
  saldo: number | null; // com sinal (negativo = saldo devedor "D")
}

interface Tok { x: number; s: string }
interface RowP {
  descCol: string;
  doc: string | null;
  valor: number | null;
  saldo: { v: number; dc: string } | null;
  date: string | null; // DD/MM/AAAA
  isTimeEff: boolean;
  isHeader: boolean;
  isSaldoDia: boolean;
}

const RE_DATE = /^(\d{2}\/\d{2}\/\d{4})$/;
const RE_TIME_EFF = /^\d{2}\/\d{2}\s+\d{2}:\d{2}$/;

function moneyBR(s: string): number {
  return parseFloat(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
}

function brDateToISO(d: string): string {
  const [dd, mm, yyyy] = d.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

export async function parseCaixaExtratoPdf(base64: string): Promise<ExtratoLine[]> {
  const clean = base64.replace(/^data:[^,]*,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }

  // pdfjs-dist é "external" no build (ESM) — carrega lazy só quando há PDF.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  // 1) Coleta todas as linhas (todas as páginas) em ordem de leitura (cima→baixo).
  const rows: Tok[][] = [];
  for (let pn = 1; pn <= doc.numPages; pn++) {
    const page = await doc.getPage(pn);
    const tc = await page.getTextContent();
    const map: Record<number, Tok[]> = {};
    for (const it of tc.items as any[]) {
      const str: string = it.str ?? "";
      if (!str.trim()) continue;
      const x = Math.round(it.transform[4]);
      const y = Math.round(it.transform[5]);
      (map[y] ||= []).push({ x, s: str });
    }
    const ys = Object.keys(map).map(Number).sort((a, b) => b - a);
    for (const y of ys) rows.push(map[y].sort((a, b) => a.x - b.x));
  }

  // 2) Classifica cada linha pelas faixas de coluna (X).
  const P: RowP[] = rows.map((toks) => {
    const join = (lo: number, hi: number) =>
      toks.filter((t) => t.x >= lo && t.x < hi).map((t) => t.s).join(" ").replace(/\s+/g, " ").trim();
    const all = toks.map((t) => t.s).join(" ").replace(/\s+/g, " ").trim();
    const valTok = toks.filter((t) => t.x >= 520 && t.x < 700).map((t) => t.s).join(" ");
    const salTok = toks.filter((t) => t.x >= 700).map((t) => t.s).join(" ");
    const valM = valTok.match(/(-\s*)?R\$\s*([\d.]+,\d{2})/);
    const salM = salTok.match(/R\$\s*([\d.]+,\d{2})\s*([CD])/);
    const dtok = toks.find((t) => t.x < 160 && RE_DATE.test(t.s));
    const doctok = toks.find((t) => t.x >= 148 && t.x < 205 && /^\d{6}$/.test(t.s));
    const descCol = join(205, 535);
    return {
      descCol,
      doc: doctok ? doctok.s : null,
      valor: valM ? (valM[1] ? -1 : 1) * moneyBR(valM[2]) : null,
      saldo: salM ? { v: moneyBR(salM[1]), dc: salM[2] } : null,
      date: dtok ? dtok.s : null,
      isTimeEff: toks.some((t) => t.x < 160 && RE_TIME_EFF.test(t.s)),
      // Rev. 4905 — linha com valor E saldo é sempre transação real: nunca tratar
      // como cabeçalho (PIX recebido da própria empresa traz o nome dela na
      // mesma linha do valor e era descartado indevidamente).
      isHeader:
        !(valM && salM) &&
        /about:blank|extrato_pdf|SAC CAIXA|Ouvidoria|Saldo anterior|Extrato no per|Documento .*Hist|Data Efeti|defici|Agência:|CNPJ:|FC ENGENHARIA E CONST LTDA|Pessoas com/i.test(all),
      isSaldoDia: /SALDO DIA/i.test(descCol),
    };
  });

  // 3) Percorre as linhas e materializa cada transação a partir da LINHA-VALOR.
  //
  // "consumed": conjunto de índices de linhas já vinculadas a uma transação como
  // trail (Data Efetiva + linhas de continuação abaixo dela, ex.: "ALLUCK",
  // "E003603..."). O loop de lead da transação seguinte para ao encontrar uma
  // linha consumida, evitando que a continuação da transação anterior seja
  // capturada indevidamente como tipo/descrição da próxima.
  const consumed = new Set<number>();
  const out: ExtratoLine[] = [];
  for (let i = 0; i < P.length; i++) {
    const r = P[i];
    if (r.valor === null || r.saldo === null || r.isSaldoDia || r.isHeader) continue;

    // Data: na própria linha-valor ou até 4 linhas acima (coluna esquerda).
    let di = i;
    for (let j = i; j >= Math.max(0, i - 4); j--) {
      if (P[j].date) { di = j; break; }
    }
    const dataBR = P[di].date || r.date;
    if (!dataBR) continue;

    // Histórico "solto" imediatamente acima da linha da data (ex.: "PIX RECEBIDO").
    // Para ao encontrar linha já consumida pela transação anterior (trail).
    const lead: string[] = [];
    for (let j = di - 1; j >= 0; j--) {
      if (consumed.has(j)) break;
      const p = P[j];
      if (p.isHeader || p.isSaldoDia || p.valor !== null || p.isTimeEff || p.date) break;
      if (p.descCol) lead.unshift(p.descCol);
      else break;
    }

    // Contraparte/CNPJ: linha da Data Efetiva (isTimeEff) logo abaixo da linha-valor
    // + quaisquer linhas de continuação logo após (ex.: abreviação do favorecido,
    // chave E003603...). Todas marcadas como consumed para não vazar para a próxima.
    let trail = "";
    if (i + 1 < P.length && P[i + 1].isTimeEff) {
      consumed.add(i + 1);
      if (P[i + 1].descCol) trail = P[i + 1].descCol;
      // Captura linhas extras de continuação imediatamente após o isTimeEff.
      for (let k = i + 2; k < P.length; k++) {
        const pk = P[k];
        if (pk.isHeader || pk.isSaldoDia || pk.valor !== null || pk.isTimeEff || pk.date) break;
        if (!pk.descCol) break;
        // Rev. 4905 — linha imediatamente seguida por uma linha de Data é o
        // histórico "solto" (lead) da PRÓXIMA transação — não pertence a esta.
        if (k + 1 < P.length && P[k + 1].date) break;
        consumed.add(k);
        trail = trail ? `${trail} ${pk.descCol}` : pk.descCol;
      }
    }

    const docNum = r.doc && r.doc !== "000000" ? r.doc : null;
    let descricao = [...lead, r.descCol, trail].filter(Boolean).join(" - ").replace(/\s+/g, " ").trim();
    if (docNum) descricao = `${descricao} · Doc ${docNum}`;
    if (!descricao) descricao = "Sem descrição";

    out.push({
      data: brDateToISO(dataBR),
      descricao,
      valor: r.valor,
      saldo: r.saldo.dc === "C" ? r.saldo.v : -r.saldo.v,
    });
  }

  return out;
}
