import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import {
  comprasOrdens,
  comprasOrdensItens,
  comprasSolicitacoes,
  comprasCotacoes,
  fornecedores,
  companies,
  obras,
  users,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

type ComprasOrdem = InferSelectModel<typeof comprasOrdens>;
type ComprasOrdemItem = InferSelectModel<typeof comprasOrdensItens>;
type Fornecedor = InferSelectModel<typeof fornecedores>;
type Company = InferSelectModel<typeof companies>;
type Obra = InferSelectModel<typeof obras>;

interface SolicitacaoVinculada {
  numeroSc: string | null;
  solicitanteNome: string | null;
  aprovadorNome: string | null;
  aprovadoEm: string | null;
}

interface CotacaoVinculada {
  numeroCotacao: string | null;
  cotadorNome: string | null;
  criadoEm: string | null;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
    return date.toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

export interface OCData {
  oc: ComprasOrdem;
  itens: ComprasOrdemItem[];
  fornecedor: Fornecedor | null;
  company: Company | null;
  obra: Obra | null;
  aprovadorOcNome: string | null;
  solicitacao: SolicitacaoVinculada | null;
  cotacao: CotacaoVinculada | null;
}

export async function fetchOCData(ocId: number): Promise<OCData> {
  const db = await getDb();
  const [oc] = await db
    .select()
    .from(comprasOrdens)
    .where(eq(comprasOrdens.id, ocId));
  if (!oc) throw new Error("Ordem de Compra não encontrada");

  const itens = await db
    .select()
    .from(comprasOrdensItens)
    .where(eq(comprasOrdensItens.ordemId, ocId));

  let fornecedor: Fornecedor | null = null;
  if (oc.fornecedorId) {
    const [f] = await db
      .select()
      .from(fornecedores)
      .where(eq(fornecedores.id, oc.fornecedorId));
    fornecedor = f ?? null;
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, oc.companyId));

  let obra: Obra | null = null;
  if (oc.obraId) {
    const [o] = await db
      .select()
      .from(obras)
      .where(eq(obras.id, oc.obraId));
    obra = o ?? null;
  }

  // Nome de quem aprovou a OC
  let aprovadorOcNome: string | null = null;
  if (oc.aprovadorId) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, oc.aprovadorId));
    aprovadorOcNome = u?.name ?? null;
  }

  // Solicitação de Compra vinculada (solicitante + aprovador da SC)
  let solicitacao: SolicitacaoVinculada | null = null;
  if (oc.solicitacaoId) {
    const [sc] = await db
      .select()
      .from(comprasSolicitacoes)
      .where(eq(comprasSolicitacoes.id, oc.solicitacaoId));
    if (sc) {
      let scAprovadorNome: string | null = null;
      if (sc.aprovadorId) {
        const [u2] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, sc.aprovadorId));
        scAprovadorNome = u2?.name ?? null;
      }
      solicitacao = {
        numeroSc: sc.numeroSc ?? null,
        solicitanteNome: sc.criadoPorNome ?? null,
        aprovadorNome: scAprovadorNome,
        aprovadoEm: sc.aprovadoEm ?? null,
      };
    }
  }

  // Cotação vinculada (quem cotou)
  let cotacao: CotacaoVinculada | null = null;
  if (oc.cotacaoId) {
    const [cot] = await db
      .select()
      .from(comprasCotacoes)
      .where(eq(comprasCotacoes.id, oc.cotacaoId));
    if (cot) {
      cotacao = {
        numeroCotacao: cot.numeroCotacao ?? null,
        cotadorNome: cot.criadoPorNome ?? null,
        criadoEm: cot.criadoEm ?? null,
      };
    }
  }

  return {
    oc,
    itens,
    fornecedor,
    company: company ?? null,
    obra,
    aprovadorOcNome,
    solicitacao,
    cotacao,
  };
}

function resolveLogoSource(logoUrl: string | null | undefined): string | Buffer | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:image")) {
    const matches = logoUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (matches?.[1]) {
      return Buffer.from(matches[1], "base64");
    }
    return null;
  }
  if (logoUrl.startsWith("/uploads/")) {
    const localPath = path.join(process.cwd(), "server", logoUrl);
    if (fs.existsSync(localPath)) return localPath;
  }
  // Caminho root-relativo servido como asset estático (ex.: "/logo-fc.jpg").
  // O arquivo vive no REPO (não no disco efêmero de /uploads): em prod fica em
  // dist/public, em dev em client/public. Tenta os candidatos e usa o 1º que existir.
  if (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) {
    const rel = logoUrl.replace(/^\/+/, "");
    // Hardening: só imagens, e CONFINA o caminho resolvido dentro da pasta pública
    // (evita path traversal via logoUrl malicioso vindo do banco, ex.: "/../../etc").
    if (/\.(png|jpe?g|webp|gif)$/i.test(rel)) {
      const bases = ["dist/public", "client/public", "server/public", "public"];
      for (const b of bases) {
        const baseDir = path.resolve(process.cwd(), b);
        const resolved = path.resolve(baseDir, rel);
        if (
          (resolved === baseDir || resolved.startsWith(baseDir + path.sep)) &&
          fs.existsSync(resolved)
        ) {
          return resolved;
        }
      }
    }
  }
  return null;
}

export function generateOCPdf(data: OCData): PDFKit.PDFDocument {
  const { oc, itens, fornecedor, company, obra, aprovadorOcNome, solicitacao, cotacao } = data;
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const mL = 40;
  const mR = 40;
  const cW = pageW - mL - mR;

  const primary = "#1B3A5C";
  const accent = "#2980b9";
  const dark = "#1a1a2e";
  const midGray = "#666666";
  const lightGray = "#f8f9fa";
  const borderColor = "#dee2e6";
  const white = "#ffffff";

  function drawHLine(y: number, color = borderColor, width = 0.5) {
    doc.strokeColor(color).lineWidth(width).moveTo(mL, y).lineTo(pageW - mR, y).stroke();
  }

  function sectionTitle(title: string, y: number): number {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(primary).text(title.toUpperCase(), mL, y);
    y += 13;
    drawHLine(y, accent, 0.8);
    y += 6;
    return y;
  }

  function infoBlock(label: string, value: string, x: number, y: number, w: number): number {
    doc.font("Helvetica").fontSize(6.5).fillColor(midGray).text(label, x, y, { width: w });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(dark).text(value || "—", x, y + 9, { width: w });
    const valH = doc.heightOfString(value || "—", { width: w, fontSize: 8.5 });
    return 9 + valH + 4;
  }

  function infoRow(entries: [string, string][], y: number, colW: number): number {
    let maxH = 0;
    entries.forEach((e, i) => {
      const h = infoBlock(e[0], e[1], mL + colW * i, y, colW - 8);
      if (h > maxH) maxH = h;
    });
    return y + Math.max(maxH, 22);
  }

  function checkPage(needed: number, currentY: number): number {
    if (currentY + needed > pageH - 60) {
      doc.addPage();
      return 40;
    }
    return currentY;
  }

  // ══════════════════════════════════════════════════════════════════════
  // HEADER — Faixa azul com logo + nome da empresa + OC
  // ══════════════════════════════════════════════════════════════════════
  const headerH = 85;
  doc.rect(0, 0, pageW, headerH).fill(primary);

  // Logo no cabeçalho ESCURO: prefere a variante clara (branco/amarelo, fundo
  // transparente) quando a empresa usa o logo FC de fundo branco — assim não vira
  // um quadrado branco sobre o azul-marinho. Senão usa o logo cadastrado.
  let logoSrc = resolveLogoSource(company?.logoUrl);
  if (/logo-fc\.jpg$/i.test(company?.logoUrl || "")) {
    const claro = resolveLogoSource("/logo-fc-branco-amarelo.png");
    if (claro) logoSrc = claro;
  }
  let logoRendered = false;
  const logoBoxW = 108;
  const logoBoxH = 56;
  if (logoSrc) {
    try {
      doc.image(logoSrc, mL, (headerH - logoBoxH) / 2, { fit: [logoBoxW, logoBoxH], align: "center", valign: "center" });
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }

  const nameX = logoRendered ? mL + logoBoxW + 14 : mL + 10;
  const ocBlockW = 155;
  const nameW = pageW - nameX - ocBlockW - mR - 15;

  doc.font("Helvetica-Bold").fontSize(12).fillColor(white)
    .text(company?.razaoSocial || "FC ENGENHARIA", nameX, 12, { width: nameW });

  if (company?.nomeFantasia && company.nomeFantasia !== company.razaoSocial) {
    doc.font("Helvetica").fontSize(7.5).fillColor("#c5d9ed")
      .text(company.nomeFantasia, nameX, 28, { width: nameW });
  }

  const compLineParts: string[] = [];
  if (company?.cnpj) compLineParts.push(`CNPJ: ${company.cnpj}`);
  if (company?.telefone) compLineParts.push(`Tel: ${company.telefone}`);
  if (company?.email) compLineParts.push(company.email);
  if (compLineParts.length > 0) {
    doc.font("Helvetica").fontSize(6.5).fillColor("#a0bdd4")
      .text(compLineParts.join("  |  "), nameX, 40, { width: nameW });
  }

  if (company?.endereco) {
    let addr = company.endereco;
    if (company.cidade) addr += ` - ${company.cidade}`;
    if (company.estado) addr += `/${company.estado}`;
    if (company.cep) addr += ` - CEP: ${company.cep}`;
    doc.font("Helvetica").fontSize(6).fillColor("#a0bdd4")
      .text(addr, nameX, 50, { width: nameW });
  }

  const ocBlockX = pageW - mR - ocBlockW;
  doc.rect(ocBlockX, 12, ocBlockW, 52).lineWidth(1.5).strokeColor("#ffffff40").stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor("#c5d9ed")
    .text("ORDEM DE COMPRA", ocBlockX, 18, { width: ocBlockW, align: "center" });
  doc.font("Helvetica-Bold").fontSize(15).fillColor(white)
    .text(oc.numeroOc || "—", ocBlockX, 34, { width: ocBlockW, align: "center" });

  let y = headerH + 8;

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 1: DADOS DA ORDEM
  // ══════════════════════════════════════════════════════════════════════
  y = sectionTitle("Dados da Ordem", y);

  const col3 = cW / 3;
  y = infoRow([
    ["Data de Emissão", fmtDate(oc.criadoEm)],
    ["Status", (oc.status || "pendente").toUpperCase()],
    ["Forma de Pagamento", oc.formaPagamento ?? "—"],
  ], y, col3);

  const tipoFatLabel = (oc as any).modalidadeFd === "fd_cliente"
    ? "Pagamento Cliente"
    : (oc as any).modalidadeFd === "fd_fc"
    ? "Faturamento Direto"
    : "Empresa FC";

  const prazoVal = fmtDate(oc.dataEntregaPrevista) !== "—" ? fmtDate(oc.dataEntregaPrevista) : "—";
  const row2: [string, string][] = [
    ["Prazo de Entrega", prazoVal],
    ["Vencimento", fmtDate(oc.dataVencimento)],
    ["Tipo de Faturamento", tipoFatLabel],
  ];
  if (oc.observacoes) row2.push(["Observações", oc.observacoes]);
  y = infoRow(row2, y, col3);

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 2: FORNECEDOR
  // ══════════════════════════════════════════════════════════════════════
  y = sectionTitle("Fornecedor", y);

  if (fornecedor) {
    const col2 = cW / 2;
    y = infoRow([
      ["Razão Social", fornecedor.razaoSocial || "—"],
      ["CNPJ", fornecedor.cnpj || "—"],
    ], y, col2);

    const row2F: [string, string][] = [];
    if (fornecedor.nomeFantasia) row2F.push(["Nome Fantasia", fornecedor.nomeFantasia]);
    if (fornecedor.telefone || fornecedor.email) {
      const contactParts: string[] = [];
      if (fornecedor.telefone) contactParts.push(`Tel: ${fornecedor.telefone}`);
      if (fornecedor.email) contactParts.push(fornecedor.email);
      row2F.push(["Contato", contactParts.join(" | ")]);
    }
    if (row2F.length > 0) y = infoRow(row2F, y, col2);

    if (fornecedor.endereco) {
      let addr = fornecedor.endereco;
      if (fornecedor.numero) addr += `, ${fornecedor.numero}`;
      if (fornecedor.complemento) addr += ` - ${fornecedor.complemento}`;
      if (fornecedor.bairro) addr += ` - ${fornecedor.bairro}`;
      if (fornecedor.cidade) addr += ` - ${fornecedor.cidade}`;
      if (fornecedor.estado) addr += `/${fornecedor.estado}`;
      if (fornecedor.cep) addr += ` - CEP: ${fornecedor.cep}`;
      infoBlock("Endereço", addr, mL, y, cW);
      const addrH = doc.heightOfString(addr, { width: cW, fontSize: 8.5 });
      y += 9 + addrH + 6;
    }
  } else if (oc.fornecedorNome) {
    doc.font("Helvetica").fontSize(8.5).fillColor(dark).text(oc.fornecedorNome, mL, y);
    y += 16;
  } else {
    doc.font("Helvetica").fontSize(8.5).fillColor(midGray).text("Não informado", mL, y);
    y += 16;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 3: LOCAL DE ENTREGA (OBRA)
  // ══════════════════════════════════════════════════════════════════════
  if (obra) {
    y = sectionTitle("Local de Entrega (Obra)", y);

    const col2 = cW / 2;
    const obraRow: [string, string][] = [["Obra", obra.nome || "—"]];
    if (obra.endereco) {
      let obraAddr = obra.endereco;
      if (obra.cidade) obraAddr += ` - ${obra.cidade}`;
      if (obra.estado) obraAddr += `/${obra.estado}`;
      obraRow.push(["Endereço", obraAddr]);
    }
    y = infoRow(obraRow, y, col2);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 4: ITENS
  // ══════════════════════════════════════════════════════════════════════
  y = checkPage(60, y);
  y = sectionTitle("Itens da Ordem de Compra", y);

  const colWidths = [28, cW - 28 - 40 - 55 - 85 - 85, 40, 55, 85, 85];
  const headers = ["#", "Descrição", "Un.", "Qtd", "Preço Unit.", "Total"];

  function drawTableHeader(atY: number): number {
    doc.rect(mL, atY, cW, 16).fill(primary);
    let xP = mL;
    headers.forEach((h, i) => {
      const align: "left" | "right" | "center" = i === 0 ? "center" : i >= 3 ? "right" : "left";
      doc.font("Helvetica-Bold").fontSize(7).fillColor(white)
        .text(h, xP + 3, atY + 4, { width: colWidths[i] - 6, align });
      xP += colWidths[i];
    });
    return atY + 16;
  }

  y = drawTableHeader(y);

  itens.forEach((item, idx) => {
    const qty = parseFloat(item.quantidade || "0");
    const price = parseFloat(item.precoUnitario || "0");
    const total = parseFloat(item.total || "0");

    const descText = item.descricao || "—";
    const descH = doc.heightOfString(descText, { width: colWidths[1] - 10, fontSize: 7 });
    const rowH = Math.max(16, descH + 8);

    if (y + rowH > pageH - 160) {
      doc.addPage();
      y = 40;
      y = drawTableHeader(y);
    }

    const bgColor = idx % 2 === 0 ? white : lightGray;
    doc.rect(mL, y, cW, rowH).fill(bgColor);

    doc.strokeColor(borderColor).lineWidth(0.3)
      .moveTo(mL, y + rowH).lineTo(pageW - mR, y + rowH).stroke();

    const rowData = [
      String(idx + 1),
      descText,
      item.unidade || "un",
      qty.toLocaleString("pt-BR", { minimumFractionDigits: 0 }),
      fmt(price),
      fmt(total),
    ];

    let xPos = mL;
    rowData.forEach((val, i) => {
      const align: "left" | "right" | "center" = i === 0 ? "center" : i >= 3 ? "right" : "left";
      doc.font("Helvetica").fontSize(7).fillColor(dark)
        .text(val, xPos + 3, y + 4, { width: colWidths[i] - 6, align });
      xPos += colWidths[i];
    });
    y += rowH;
  });

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 5: TOTAIS
  // ══════════════════════════════════════════════════════════════════════
  y += 8;
  y = checkPage(80, y);

  const subtotal = parseFloat(oc.subtotal ?? oc.total ?? "0");
  const frete = parseFloat(oc.frete ?? "0");
  const outrasDespesas = parseFloat(oc.outrasDespesas ?? "0");
  const impostos = parseFloat(oc.impostos ?? "0");
  const desconto = parseFloat(oc.desconto ?? "0");
  const totalOC = parseFloat(oc.total ?? "0");

  const summaryW = 220;
  const summaryX = pageW - mR - summaryW;
  const labelW = 120;
  const valW = 90;

  const summaryLines: { label: string; value: string; bold?: boolean; color?: string }[] = [
    { label: "Subtotal Itens", value: fmt(subtotal) },
  ];
  if (frete > 0) summaryLines.push({ label: "(+) Frete", value: fmt(frete) });
  if (outrasDespesas > 0) summaryLines.push({ label: "(+) Outras Despesas", value: fmt(outrasDespesas) });
  if (impostos > 0) summaryLines.push({ label: "(+) Impostos", value: fmt(impostos) });
  if (desconto > 0) summaryLines.push({ label: "(−) Desconto", value: fmt(desconto), color: "#cc0000" });

  summaryLines.forEach((line) => {
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text(line.label, summaryX, y, { width: labelW, align: "right" });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(line.color || dark)
      .text(line.value, summaryX + labelW + 5, y, { width: valW, align: "right" });
    y += 14;
  });

  y += 2;
  doc.strokeColor(primary).lineWidth(1.2).moveTo(summaryX, y).lineTo(summaryX + summaryW, y).stroke();
  y += 8;

  doc.rect(summaryX - 5, y - 3, summaryW + 10, 22).fill(primary);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(white)
    .text("TOTAL GERAL", summaryX, y, { width: labelW, align: "right" });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(white)
    .text(fmt(totalOC), summaryX + labelW + 5, y, { width: valW, align: "right" });
  y += 30;

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 6: CONDIÇÕES DE PAGAMENTO (se houver)
  // ══════════════════════════════════════════════════════════════════════
  if (oc.formaPagamento && oc.dataVencimento) {
    y = checkPage(100, y);
    y = sectionTitle("Condição de Pagamento", y);

    const col2 = cW / 2;
    infoBlock("Forma de Pagamento", oc.formaPagamento, mL, y, col2);
    infoBlock("Vencimento", fmtDate(oc.dataVencimento), mL + col2, y, col2);
    y += 28;

    const numParcelas = 1;
    const valorParcela = totalOC / numParcelas;
    const vencBase = new Date(oc.dataVencimento + "T00:00:00");

    doc.rect(mL, y, cW * 0.55, 16).fill(primary);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(white)
      .text("Parcela", mL + 4, y + 4, { width: 60 });
    doc.font("Helvetica-Bold").fontSize(7).fillColor(white)
      .text("Vencimento", mL + 70, y + 4, { width: 100 });
    doc.font("Helvetica-Bold").fontSize(7).fillColor(white)
      .text("Valor", mL + 190, y + 4, { width: 90, align: "right" });
    y += 16;

    for (let p = 0; p < numParcelas; p++) {
      const venc = new Date(vencBase);
      venc.setMonth(venc.getMonth() + p);
      const bg = p % 2 === 0 ? white : lightGray;
      doc.rect(mL, y, cW * 0.55, 16).fill(bg);
      doc.font("Helvetica").fontSize(7.5).fillColor(dark)
        .text(`${p + 1}/${numParcelas}`, mL + 4, y + 4, { width: 60 });
      doc.font("Helvetica").fontSize(7.5).fillColor(dark)
        .text(venc.toLocaleDateString("pt-BR"), mL + 70, y + 4, { width: 100 });
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(dark)
        .text(fmt(valorParcela), mL + 190, y + 4, { width: 90, align: "right" });
      y += 16;
    }
    y += 8;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SEÇÃO 7: OBSERVAÇÕES
  // ══════════════════════════════════════════════════════════════════════
  if (oc.observacoes) {
    y = checkPage(60, y);
    y = sectionTitle("Observações", y);
    doc.font("Helvetica").fontSize(8).fillColor(dark)
      .text(oc.observacoes, mL, y, { width: cW });
    y += doc.heightOfString(oc.observacoes, { width: cW, fontSize: 8 }) + 12;
  }

  // ══════════════════════════════════════════════════════════════════════
  // RASTREABILIDADE / AUDITORIA
  // ══════════════════════════════════════════════════════════════════════
  y = checkPage(80, y);
  y += 6;
  y = sectionTitle("Rastreabilidade do Pedido", y);

  const fmtDateTime = (s: string | null | undefined): string => {
    if (!s) return "—";
    try {
      const d = new Date(s);
      return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR")}`;
    } catch { return s; }
  };

  const auditLinhas: Array<{ rotulo: string; valor: string }> = [];
  if (solicitacao) {
    auditLinhas.push({
      rotulo: `Solicitação ${solicitacao.numeroSc || ""}`.trim() + " — criada por",
      valor: solicitacao.solicitanteNome || "—",
    });
    auditLinhas.push({
      rotulo: "Solicitação aprovada por",
      valor: solicitacao.aprovadorNome
        ? `${solicitacao.aprovadorNome}${solicitacao.aprovadoEm ? "  ·  " + fmtDateTime(solicitacao.aprovadoEm) : ""}`
        : "—",
    });
  }
  if (cotacao) {
    auditLinhas.push({
      rotulo: `Cotação ${cotacao.numeroCotacao || ""}`.trim() + " — registrada por",
      valor: `${cotacao.cotadorNome || "—"}${cotacao.criadoEm ? "  ·  " + fmtDateTime(cotacao.criadoEm) : ""}`,
    });
  }
  auditLinhas.push({
    rotulo: `OC ${oc.numeroOc} — emitida por`,
    valor: `${oc.criadoPorNome || "—"}  ·  ${fmtDateTime(oc.criadoEm)}`,
  });
  auditLinhas.push({
    rotulo: "OC aprovada por",
    valor: aprovadorOcNome
      ? `${aprovadorOcNome}  ·  ${oc.aprovacaoStatus || ""}`.trim()
      : (oc.aprovacaoStatus === "aprovada" || oc.aprovacaoStatus === "aprovado"
          ? "Aprovada (responsável não registrado)"
          : "—"),
  });
  if (oc.aprovacaoExtraAdminNome) {
    auditLinhas.push({
      rotulo: "Aprovação extra (admin)",
      valor: `${oc.aprovacaoExtraAdminNome}  ·  ${fmtDateTime(oc.aprovacaoExtraEm)}`,
    });
  }

  doc.font("Helvetica").fontSize(8).fillColor(dark);
  for (const linha of auditLinhas) {
    const rotuloTxt = linha.rotulo + ": ";
    const valorTxt = linha.valor;
    doc.font("Helvetica-Bold").fontSize(8);
    const rotW = doc.widthOfString(rotuloTxt);
    doc.font("Helvetica").fontSize(8);
    const linhaH = Math.max(
      11,
      doc.heightOfString(valorTxt, { width: cW - rotW }) + 1
    );
    y = checkPage(linhaH + 2, y);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
       .text(rotuloTxt, mL, y, { continued: true })
       .font("Helvetica").text(valorTxt, { width: cW - rotW });
    y += linhaH;
  }
  y += 4;

  // ══════════════════════════════════════════════════════════════════════
  // ASSINATURAS + RODAPÉ
  // ══════════════════════════════════════════════════════════════════════
  y = checkPage(60, y);
  y += 30;
  const sigW = (cW - 60) / 2;
  // Linha de assinatura — Responsável pela Compra
  doc.strokeColor(dark).lineWidth(0.5).moveTo(mL, y).lineTo(mL + sigW, y).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
    .text((oc as any).criadoPorNome || "—", mL, y + 3, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(7).fillColor(midGray)
    .text("Responsável pela Compra", mL, y + 14, { width: sigW, align: "center" });
  // Linha de assinatura — Aprovação
  doc.strokeColor(dark).lineWidth(0.5).moveTo(pageW - mR - sigW, y).lineTo(pageW - mR, y).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
    .text(aprovadorOcNome || "—", pageW - mR - sigW, y + 3, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(7).fillColor(midGray)
    .text("Aprovação", pageW - mR - sigW, y + 14, { width: sigW, align: "center" });
  y += 28;
  drawHLine(y, borderColor, 0.3);
  y += 3;
  doc.font("Helvetica").fontSize(6).fillColor(midGray)
    .text(
      `Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")} — ${company?.razaoSocial || "FC Engenharia"}`,
      mL, y, { width: cW, align: "center", lineBreak: false }
    );

  return doc;
}
