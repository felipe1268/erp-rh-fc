/**
 * Rev. 3953 — Gerador do PDF da DFC (Demonstração do Fluxo de Caixa).
 * Método Indireto Simplificado, conforme NBC TG 03 R3 (CPC 03).
 *
 * Objetivo: documento DIDÁTICO, não técnico-contábil formal.
 * Público-alvo: gestores sem formação em contabilidade.
 *
 * Estrutura do documento:
 *   Cabeçalho  — institucional FC (azul #1B2A4A + logo)
 *   Seção 1    — "Ponto de Partida: Resultado da Operação (DRE)"
 *   Seção 2    — "Ajustes: o que movimentou o banco fora do DRE"
 *   Seção 3    — "A Conta Fecha: Reconciliação Final"
 *   Seção 4    — "O que isso significa?" (interpretação contextual)
 *   Rodapé     — nota metodológica + data de geração
 */

import jsPDF from "jspdf";

// ─────────────────────────────────────────────────────────────
// Paleta de cores (padrão institucional FC)
// ─────────────────────────────────────────────────────────────
const AZUL: [number, number, number] = [27, 42, 74];          // #1B2A4A navy
const AZUL_MEDIO: [number, number, number] = [37, 99, 235];   // blue-600
const CINZA: [number, number, number] = [33, 33, 33];
const CINZA_CLARO: [number, number, number] = [110, 110, 110];
const VERDE: [number, number, number] = [5, 150, 105];        // emerald-600
const VERMELHO: [number, number, number] = [220, 38, 38];     // red-600
const LARANJA: [number, number, number] = [234, 88, 12];      // orange-600 (acento FC)
const AMARELO_BG: [number, number, number] = [254, 243, 199]; // amber-100
const AZUL_BG: [number, number, number] = [219, 234, 254];    // blue-100
const VERDE_BG: [number, number, number] = [209, 250, 229];   // emerald-100

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────
export interface DREDataForDFC {
  receitaBruta: number;
  custosObra: number;
  lucroBruto: number;
  despesasFixas: number;
  despesasVariaveis: number;
  ebitda: number;
  receitasFinanceiras: number;
  despesasFinanceiras: number;
  resultadoFinanceiro: number;
  lair: number;
  impostos: number;
  lucroLiquido: number;
}

export interface BankCompData {
  bankEntradas: number;
  bankSaidas: number;
  bankSaldo: number;
}

export interface DFCItem {
  contaNome: string;
  tipo: "receita" | "despesa";
  classificacao: "nao_operacional" | "investimento";
  total: number;
}

export interface DFCPdfParams {
  dre: DREDataForDFC;
  bankComp: BankCompData;
  dfcData: {
    itens: DFCItem[];
    receitasAReceber: number;
    despesasAPagar: number;
  };
  periodo: string;      // "2026-01" | "2026" | etc.
  tipoPeriodo: string;  // "mensal" | "trimestral" | "semestral" | "anual"
  companyName?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function labelPeriodo(periodo: string, tipoPeriodo: string): string {
  const ano = periodo.slice(0, 4);
  const mes = parseInt(periodo.slice(5, 7) || "1", 10);
  if (tipoPeriodo === "anual") return `Exercício ${ano}`;
  if (tipoPeriodo === "semestral") return `${mes <= 6 ? "1º" : "2º"} Semestre/${ano}`;
  if (tipoPeriodo === "trimestral") {
    const t = Math.ceil(mes / 3);
    return `${t}º Trimestre/${ano}`;
  }
  return `${MESES[mes - 1] ?? periodo}/${ano}`;
}

function brl(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${formatted})` : formatted;
}

function brlSigned(v: number): string {
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `− R$ ${formatted}` : `+ R$ ${formatted}`;
}

async function fetchLogo(origin: string): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/logo-fc.jpg`, { cache: "no-store" });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((res) => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result as string);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// Gerador principal
// ─────────────────────────────────────────────────────────────
export async function gerarDFCPdf(params: DFCPdfParams): Promise<void> {
  const { dre, bankComp, dfcData, periodo, tipoPeriodo, companyName } = params;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 14;          // margem lateral
  const CW = W - M * 2;  // largura útil
  const BOTTOM = H - M - 14;
  let y = M;

  const novaPage = (needed = 10) => {
    if (y + needed > BOTTOM) { pdf.addPage(); y = M; return true; }
    return false;
  };

  // ── Cabeçalho institucional ──────────────────────────────────
  const logo = await fetchLogo(window.location.origin);
  if (logo) {
    try { pdf.addImage(logo, "JPEG", (W - 20) / 2, y, 20, 20, undefined, "FAST"); y += 22; }
    catch { /* logo opcional */ }
  }

  const empresa = companyName ?? "FC Engenharia";
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...AZUL);
  pdf.text(empresa.toUpperCase(), W / 2, y + 4, { align: "center" });
  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...CINZA_CLARO);
  pdf.text("Gestão Financeira — Relatório Gerencial", W / 2, y, { align: "center" });
  y += 8;

  // Faixa azul com título
  const faixaH = 12;
  pdf.setFillColor(...AZUL);
  pdf.rect(M, y, CW, faixaH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(255, 255, 255);
  pdf.text("DEMONSTRAÇÃO DO FLUXO DE CAIXA (DFC)", W / 2, y + 4.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Método Indireto Simplificado — NBC TG 03 R3   ·   Período: ${labelPeriodo(periodo, tipoPeriodo)}`, W / 2, y + 9, { align: "center" });
  y += faixaH + 6;

  // ── Helpers de desenho ───────────────────────────────────────
  const sectionHeader = (titulo: string, subtitulo: string, bg: [number,number,number] = AZUL) => {
    novaPage(14);
    pdf.setFillColor(...bg);
    pdf.roundedRect(M, y, CW, 11, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(titulo, M + 4, y + 4.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(subtitulo, M + 4, y + 8.5);
    y += 14;
  };

  const pill = (x: number, py: number, texto: string, bg: [number,number,number], fg: [number,number,number]) => {
    pdf.setFontSize(7);
    const tw = pdf.getTextWidth(texto);
    pdf.setFillColor(...bg);
    pdf.roundedRect(x, py - 3.2, tw + 4, 4.2, 1, 1, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...fg);
    pdf.text(texto, x + 2, py, {});
  };

  const explicacao = (texto: string, bgColor: [number,number,number], textColor: [number,number,number]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const lines = pdf.splitTextToSize(`ℹ  ${texto}`, CW - 6);
    const boxH = lines.length * 3.6 + 4;
    novaPage(boxH + 2);
    pdf.setFillColor(...bgColor);
    pdf.roundedRect(M, y, CW, boxH, 1.5, 1.5, "F");
    pdf.setTextColor(...textColor);
    let ly = y + 4;
    for (const l of lines) { pdf.text(l, M + 3, ly); ly += 3.6; }
    y += boxH + 3;
  };

  // ─────────────────────────────────────────────────────────────
  // SEÇÃO 1 — PONTO DE PARTIDA: O que a operação produziu?
  // ─────────────────────────────────────────────────────────────
  sectionHeader(
    "SEÇÃO 1 — PONTO DE PARTIDA: Resultado da Operação (DRE)",
    "O DRE mede o desempenho econômico — quanto a empresa ganhou ou perdeu nas atividades normais."
  );

  explicacao(
    "O DRE (Demonstração do Resultado) trabalha com o \"regime de competência\": registra receitas quando " +
    "foram realizadas e despesas quando foram incorridas — independentemente de quando o dinheiro entrou " +
    "ou saiu do banco. Por isso, o resultado do DRE quase nunca é igual ao saldo bancário do período.",
    AZUL_BG, [30, 64, 175]
  );

  // Tabela do DRE waterfall
  const dreWaterfall: { label: string; valor: number; indent: boolean; isTotal: boolean }[] = [
    { label: "1. RECEITA BRUTA", valor: dre.receitaBruta, indent: false, isTotal: false },
    { label: "  (–) Custos Diretos de Obra", valor: -dre.custosObra, indent: true, isTotal: false },
    { label: "= LUCRO BRUTO", valor: dre.lucroBruto, indent: false, isTotal: true },
    { label: "  (–) Despesas Fixas", valor: -dre.despesasFixas, indent: true, isTotal: false },
    { label: "  (–) Despesas Variáveis", valor: -dre.despesasVariaveis, indent: true, isTotal: false },
    { label: "= EBITDA", valor: dre.ebitda, indent: false, isTotal: true },
    { label: "  (±) Resultado Financeiro", valor: dre.resultadoFinanceiro, indent: true, isTotal: false },
    { label: "= LAIR (Antes dos Impostos)", valor: dre.lair, indent: false, isTotal: true },
    { label: "  (–) Impostos sobre o Resultado", valor: -dre.impostos, indent: true, isTotal: false },
    { label: "= LUCRO LÍQUIDO  ← ponto de partida da DFC", valor: dre.lucroLiquido, indent: false, isTotal: true },
  ];

  const ROW_H = 5.5;
  const COL_LABEL = CW * 0.72;
  const COL_VALOR = CW * 0.28;

  // cabeçalho da tabela
  novaPage(ROW_H + 2);
  pdf.setFillColor(240, 242, 248);
  pdf.rect(M, y, CW, ROW_H, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...CINZA);
  pdf.text("LINHA", M + 3, y + 3.7);
  pdf.text("R$ (valores em reais)", M + COL_LABEL + COL_VALOR - 3, y + 3.7, { align: "right" });
  y += ROW_H;

  dreWaterfall.forEach((row, i) => {
    novaPage(ROW_H + 2);
    if (row.isTotal) {
      pdf.setFillColor(237, 242, 252);
      pdf.rect(M, y, CW, ROW_H, "F");
    } else if (i % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(M, y, CW, ROW_H, "F");
    }
    const isLast = row.label.startsWith("= LUCRO LÍQUIDO");
    if (isLast) {
      pdf.setFillColor(...AZUL);
      pdf.rect(M, y, CW, ROW_H, "F");
    }

    const xLabel = M + (row.indent ? 7 : 3);
    pdf.setFont("helvetica", row.isTotal || isLast ? "bold" : "normal");
    pdf.setFontSize(7.8);
    pdf.setTextColor(...(isLast ? [255,255,255] as [number,number,number] : CINZA));
    pdf.text(row.label, xLabel, y + 3.7);

    const xValor = M + CW - 3;
    const color: [number,number,number] = isLast
      ? [255,255,255]
      : row.valor >= 0 ? VERDE : VERMELHO;
    pdf.setFont("helvetica", row.isTotal || isLast ? "bold" : "normal");
    pdf.setTextColor(...color);
    pdf.text(`R$ ${brl(row.valor)}`, xValor, y + 3.7, { align: "right" });
    y += ROW_H;
  });
  y += 6;

  // ─────────────────────────────────────────────────────────────
  // SEÇÃO 2 — AJUSTES: O que mais movimentou o banco?
  // ─────────────────────────────────────────────────────────────
  novaPage(20);
  sectionHeader(
    "SEÇÃO 2 — AJUSTES: Movimentações fora do DRE",
    "Entradas e saídas que aparecem no banco, mas que a contabilidade NÃO registra como receita ou despesa operacional.",
    [37, 99, 235]
  );

  explicacao(
    "Dois tipos de movimento aparecem no extrato bancário mas ficam fora do DRE: " +
    "(1) Atividades de FINANCIAMENTO — empréstimos recebidos e amortizações pagas. " +
    "Empréstimo recebido entra no banco mas é dívida (não receita); parcela de principal paga sai do banco mas é quitação de dívida (não despesa). " +
    "(2) Atividades de INVESTIMENTO — compra de equipamentos, veículos, obras (CAPEX). " +
    "O dinheiro sai do banco mas o bem fica no ativo da empresa.",
    AMARELO_BG, [146, 64, 14]
  );

  // Agrupa por classificação
  const itens = dfcData.itens;
  const financNaoOp = itens.filter(i => i.classificacao === "nao_operacional");
  const investCapex  = itens.filter(i => i.classificacao === "investimento");

  const renderAjusteGroup = (
    titulo: string,
    grupo: typeof itens,
    tipoLabel: (tipo: string, clasf: string) => string
  ) => {
    if (grupo.length === 0) return;
    novaPage(12);
    // sub-header
    pdf.setFillColor(243, 244, 246);
    pdf.rect(M, y, CW, 6.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...AZUL);
    pdf.text(titulo, M + 3, y + 4.3);
    y += 7;

    // colunas: conta | tipo | valor | o que representa
    const C1 = CW * 0.38;
    const C2 = CW * 0.22;
    const C3 = CW * 0.18;
    const C4 = CW * 0.22;

    // cabeçalho da sub-tabela
    novaPage(5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...CINZA_CLARO);
    pdf.text("CONTA", M + 3, y + 3.2);
    pdf.text("ATIVIDADE", M + C1 + 3, y + 3.2);
    pdf.text("VALOR (R$)", M + C1 + C2 + C3 - 3, y + 3.2, { align: "right" });
    pdf.text("IMPACTO NO CAIXA", M + C1 + C2 + C3 + 3, y + 3.2);
    y += 5;

    let subtotal = 0;
    grupo.forEach((item, ri) => {
      novaPage(ROW_H + 1);
      if (ri % 2 === 0) { pdf.setFillColor(249, 250, 251); pdf.rect(M, y, CW, ROW_H, "F"); }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...CINZA);
      // conta
      const nomeLines = pdf.splitTextToSize(item.contaNome, C1 - 4);
      pdf.text(nomeLines[0], M + 3, y + 3.7);
      // atividade pill
      const ativ = tipoLabel(item.tipo, item.classificacao);
      const ativColor: [number,number,number] = item.tipo === "receita" ? VERDE : VERMELHO;
      pill(M + C1 + 2, y + 3.7, ativ, item.tipo === "receita" ? VERDE_BG : [254, 226, 226], ativColor);
      // valor
      const signedV = item.tipo === "receita" ? item.total : -item.total;
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...(signedV >= 0 ? VERDE : VERMELHO));
      pdf.text(`${signedV >= 0 ? "+" : ""}R$ ${brl(item.total)}`, M + C1 + C2 + C3 - 3, y + 3.7, { align: "right" });
      // impacto texto
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(...CINZA_CLARO);
      const imp = item.tipo === "receita"
        ? (item.classificacao === "nao_operacional" ? "Dívida recebida (passivo)" : "Venda de ativo")
        : (item.classificacao === "nao_operacional" ? "Pagamento de dívida" : "Compra de ativo/CAPEX");
      pdf.text(imp, M + C1 + C2 + C3 + 3, y + 3.7);
      subtotal += signedV;
      y += ROW_H;
    });

    // linha de subtotal
    novaPage(6);
    pdf.setFillColor(230, 236, 250);
    pdf.rect(M, y, CW, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...AZUL);
    pdf.text("SUBTOTAL", M + 3, y + 4);
    pdf.setTextColor(...(subtotal >= 0 ? VERDE : VERMELHO));
    pdf.text(`R$ ${brl(subtotal)}`, M + CW - 3, y + 4, { align: "right" });
    y += 9;
    return subtotal;
  };

  const stFinanc = renderAjusteGroup(
    "ATIVIDADES DE FINANCIAMENTO  (Empréstimos · Mútuos · Aportes)",
    financNaoOp,
    (tipo) => tipo === "receita" ? "Recebimento" : "Pagamento"
  ) ?? 0;

  const stInvest = renderAjusteGroup(
    "ATIVIDADES DE INVESTIMENTO  (CAPEX · Aquisição de Ativos)",
    investCapex,
    (tipo) => tipo === "receita" ? "Venda de Ativo" : "Compra/CAPEX"
  ) ?? 0;

  // ─────────────────────────────────────────────────────────────
  // SEÇÃO 3 — RECONCILIAÇÃO FINAL
  // ─────────────────────────────────────────────────────────────
  novaPage(20);
  sectionHeader(
    "SEÇÃO 3 — A CONTA FECHA: Reconciliação Final",
    "Somando o resultado operacional com os ajustes chegamos à variação real de caixa do período.",
    VERDE
  );

  // Calcula o resíduo
  const variacaoCalculada = dre.lucroLiquido + stFinanc + stInvest;
  const residual = bankComp.bankSaldo - variacaoCalculada;

  const reconcRows: { desc: string; valor: number; sub?: string; isTotal?: boolean; isFinal?: boolean; isBank?: boolean }[] = [
    { desc: "Lucro Líquido (DRE)", valor: dre.lucroLiquido,
      sub: "Resultado da operação — receitas, custos e despesas" },
    { desc: "(+) Atividades de Financiamento", valor: stFinanc,
      sub: "Empréstimos recebidos menos amortizações pagas" },
    { desc: "(+) Atividades de Investimento", valor: stInvest,
      sub: "CAPEX e aquisições de ativo" },
    { desc: "= Variação de Caixa (Calculada)", valor: variacaoCalculada,
      isTotal: true, sub: "Somatório das três linhas acima" },
    { desc: "Saldo Bancário Real (Extrato Conciliado)", valor: bankComp.bankSaldo,
      isBank: true, sub: `Entradas R$ ${brl(bankComp.bankEntradas)} · Saídas R$ ${brl(bankComp.bankSaidas)}` },
    { desc: "Diferença Residual (Capital de Giro + Timing)", valor: residual,
      isFinal: true, sub: "Regime de competência, prazos de recebimento, outros ajustes" },
  ];

  const RH2 = 7;
  reconcRows.forEach((row, ri) => {
    const needed = RH2 + (row.sub ? 3.5 : 0) + 1;
    novaPage(needed);

    if (row.isBank) {
      pdf.setFillColor(230, 244, 234);
      pdf.rect(M, y, CW, needed - 1, "F");
    } else if (row.isTotal) {
      pdf.setFillColor(237, 242, 252);
      pdf.rect(M, y, CW, needed - 1, "F");
    } else if (row.isFinal) {
      const isBig = Math.abs(residual) > 5000;
      pdf.setFillColor(...(isBig ? AMARELO_BG : VERDE_BG));
      pdf.rect(M, y, CW, needed - 1, "F");
    } else if (ri % 2 === 0) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(M, y, CW, needed - 1, "F");
    }

    pdf.setFont("helvetica", (row.isTotal || row.isBank || row.isFinal) ? "bold" : "normal");
    pdf.setFontSize(8.5);
    const descColor: [number,number,number] =
      row.isBank ? VERDE :
      row.isFinal ? (Math.abs(residual) > 5000 ? [146,64,14] : [5,150,105]) :
      CINZA;
    pdf.setTextColor(...descColor);
    pdf.text(row.desc, M + 3, y + 4.2);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const valColor: [number,number,number] = row.valor >= 0 ? VERDE : VERMELHO;
    pdf.setTextColor(...valColor);
    pdf.text(`R$ ${brl(row.valor)}`, M + CW - 3, y + 4.2, { align: "right" });

    if (row.sub) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(...CINZA_CLARO);
      pdf.text(row.sub, M + 5, y + 7.4);
      y += RH2 + 3;
    } else {
      y += RH2;
    }
    // Linha separadora
    if (!row.isFinal) {
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.1);
      pdf.line(M, y, M + CW, y);
    }
    y += 1;
  });
  y += 5;

  // ─────────────────────────────────────────────────────────────
  // SEÇÃO 4 — INTERPRETAÇÃO
  // ─────────────────────────────────────────────────────────────
  novaPage(20);
  sectionHeader(
    "SEÇÃO 4 — O QUE ISSO SIGNIFICA?",
    "Interpretação dos números em linguagem objetiva.",
    LARANJA
  );

  const drePos = dre.lucroLiquido >= 0;
  const bankPos = bankComp.bankSaldo >= 0;
  const divergente = drePos !== bankPos;

  let interpretacao = "";
  if (!divergente && drePos) {
    interpretacao =
      "SITUAÇÃO POSITIVA: A empresa tanto gerou resultado operacional positivo (DRE) quanto " +
      "manteve o caixa bancário positivo. Os dois indicadores estão alinhados, o que demonstra " +
      "solidez financeira no período. Continue monitorando a margem EBITDA e a geração de caixa.";
  } else if (!divergente && !drePos) {
    interpretacao =
      "SITUAÇÃO DESAFIADORA: Tanto o resultado operacional (DRE) quanto o caixa bancário " +
      "ficaram negativos. A operação está consumindo mais recursos do que gera. " +
      "Atenção: revise custos, melhore o prazo de recebimento e avalie o nível de endividamento.";
  } else if (!drePos && bankPos) {
    interpretacao =
      "RESULTADO NEGATIVO, CAIXA POSITIVO: A operação (DRE) apresentou prejuízo, mas o caixa " +
      "ficou positivo porque a empresa recebeu entradas externas — empréstimos, aportes ou " +
      "mútuos intercompany. Atenção: o caixa positivo é temporário e vem de dívida, não de " +
      "geração de valor. O foco deve ser reverter o resultado operacional.";
  } else {
    interpretacao =
      "RESULTADO POSITIVO, CAIXA NEGATIVO: A operação (DRE) foi lucrativa, mas o caixa caiu " +
      "porque a empresa fez investimentos (CAPEX) ou pagou amortizações de dívidas. " +
      "Isso é saudável se os investimentos gerarem retorno futuro. " +
      "Monitore o caixa operacional para garantir que a empresa não fique descapitalizada.";
  }

  const iLines = pdf.splitTextToSize(interpretacao, CW - 8);
  const intH = iLines.length * 4 + 8;
  novaPage(intH + 4);
  const intBg: [number,number,number] = divergente
    ? (!drePos && bankPos ? AZUL_BG : AMARELO_BG)
    : (drePos ? VERDE_BG : [254, 226, 226]);
  pdf.setFillColor(...intBg);
  pdf.roundedRect(M, y, CW, intH, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...CINZA);
  const icon = (!divergente && drePos) ? "✓ " : (!divergente && !drePos) ? "⚠ " : ((!drePos && bankPos) ? "ℹ " : "⚠ ");
  pdf.text(icon + "Diagnóstico do Período", M + 4, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...CINZA);
  let iy = y + 9.5;
  for (const l of iLines) { pdf.text(l, M + 4, iy); iy += 4; }
  y += intH + 6;

  // Nota sobre diferença residual (se significativa)
  if (Math.abs(residual) > 1000) {
    novaPage(25);
    const percResidual = bankComp.bankSaldo !== 0
      ? Math.abs(residual / bankComp.bankSaldo * 100).toFixed(1)
      : "—";
    const residualTexto =
      `A diferença residual de R$ ${brl(residual)} (${percResidual}% do saldo bancário) representa ` +
      "variações no capital de giro e diferenças de timing entre o regime de competência e o regime " +
      "de caixa. Causas típicas: (a) receitas reconhecidas no DRE ainda não recebidas; " +
      "(b) despesas pagas antecipadamente (pré-pagas); (c) variações em estoques; " +
      "(d) recebimentos de clientes de períodos anteriores que entraram no banco agora. " +
      "Para decompor este valor com precisão, é necessária uma análise do Balanço Patrimonial.";
    explicacao(residualTexto, AMARELO_BG, [146, 64, 14]);
  }

  // ─────────────────────────────────────────────────────────────
  // Rodapé em todas as páginas
  // ─────────────────────────────────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  const now = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFillColor(...AZUL);
    pdf.rect(0, H - 10, W, 10, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(200, 210, 230);
    pdf.text(
      `DFC Simplificada · NBC TG 03 R3 · Gerado em ${now} · Uso interno — não substitui demonstrações contábeis formais`,
      W / 2, H - 4, { align: "center" }
    );
    pdf.text(`Pág. ${p} / ${totalPages}`, W - M, H - 4, { align: "right" });
  }

  // ─────────────────────────────────────────────────────────────
  // Download
  // ─────────────────────────────────────────────────────────────
  const periodoSlug = labelPeriodo(periodo, tipoPeriodo).replace("/", "-").replace(/[^\w-]/g, "");
  pdf.save(`DFC-${periodoSlug}.pdf`);
}
