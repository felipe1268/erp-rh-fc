import PDFDocument from "pdfkit";
import { getDb } from "../db";
import { obras, companies } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { codigoFicha, ordemDisciplina } from "@shared/databookDisciplinas";

interface FornecedorData {
  razaoSocial?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  contato?: string | null;
  telefone?: string | null;
  celular?: string | null;
  email?: string | null;
}

interface DatabookFichaData {
  id: number;
  numero_sequencial: number;
  descricao: string;
  disciplina: string;
  especificacoes?: string | null;
  foto_url?: string | null;
  observacoes?: string | null;
  fornecedor_nome?: string | null;
  fornecedor_id?: number | null;
  contrato_numero?: string | null;
  eap_codigo?: string | null;
  origem: string;
  status: string;
  versao?: number | null;
}

interface ObraData {
  nome: string;
  endereco?: string | null;
  gerenciadoraNome?: string | null;
  gerenciadoraLogoUrl?: string | null;
  clienteLogoUrl?: string | null;
  // Rev. 2879 — flags (0/1) que controlam quais logos aparecem no cabeçalho do Databook.
  // Ausente (null/undefined) = comportamento legado: Cliente ON, Gestora ON, Construtora OFF.
  databookLogoCliente?: number | boolean | null;
  databookLogoGestora?: number | boolean | null;
  databookLogoConstrutora?: number | boolean | null;
  // Rev. 2882 — número do contrato da obra (cadastro). Preenche o campo "Contrato nº"
  // do doc. do cliente, no lugar do nº da OC. Fallback p/ ficha.contrato_numero se vazio.
  numeroContrato?: string | null;
}

interface CompanyData {
  razaoSocial: string;
  logoUrl?: string | null;
}

async function loadImage(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:image")) {
      const b64 = url.split(",")[1];
      return b64 ? Buffer.from(b64, "base64") : null;
    }
    if (url.startsWith("http")) {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) return Buffer.from(await resp.arrayBuffer());
    }
  } catch {}
  return null;
}

export async function gerarDatabookFichaPdf(
  ficha: DatabookFichaData,
  obra: ObraData,
  company: CompanyData,
  fornecedor?: FornecedorData | null,
): Promise<Buffer> {
  // Rev. 2879 — quais dos 3 logos exibir (por obra). Construtora = logo da própria empresa (company.logoUrl).
  const showCliente = obra.databookLogoCliente == null ? true : Number(obra.databookLogoCliente) === 1 || obra.databookLogoCliente === true;
  const showGestora = obra.databookLogoGestora == null ? true : Number(obra.databookLogoGestora) === 1 || obra.databookLogoGestora === true;
  const showConstrutora = obra.databookLogoConstrutora == null ? false : Number(obra.databookLogoConstrutora) === 1 || obra.databookLogoConstrutora === true;
  const [photoBuf, clienteLogoBuf, gerenciadoraLogoBuf, construtoraLogoBuf] = await Promise.all([
    loadImage(ficha.foto_url),
    showCliente ? loadImage(obra.clienteLogoUrl) : Promise.resolve(null),
    showGestora ? loadImage(obra.gerenciadoraLogoUrl) : Promise.resolve(null),
    showConstrutora ? loadImage(company.logoUrl) : Promise.resolve(null),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 595.28;
    const pageH = 841.89;
    const ml = 40;
    const mr = 40;
    const cw = pageW - ml - mr;
    const s = (v: any) => (v == null || v === "") ? "" : String(v);

    // Rev. 2876 — numeração sutil do databook (código da ficha + revisão) no topo,
    // para rastreio/controle de versão. Cinza claro, fonte pequena — discreto.
    const codigoDatabook =
      `${codigoFicha(ficha.disciplina, ficha.numero_sequencial)} · Rev. ${String(ficha.versao ?? 1).padStart(2, "0")}`;
    doc.font("Helvetica").fontSize(7.5).fillColor("#9aa0a6");
    doc.text(codigoDatabook, ml, 28, { width: cw, align: "center" });
    doc.fillColor("black");

    // Rev. 2879 — até 3 logos configuráveis por obra: Cliente (esq), Construtora (centro), Gestora (dir).
    const LOGO_W = 100, LOGO_H = 60, logoY = 40;
    if (clienteLogoBuf) {
      try { doc.image(clienteLogoBuf, ml, logoY, { fit: [LOGO_W, LOGO_H] }); } catch {}
    }
    if (construtoraLogoBuf) {
      try { doc.image(construtoraLogoBuf, (pageW - LOGO_W) / 2, logoY, { fit: [LOGO_W, LOGO_H] }); } catch {}
    }
    if (gerenciadoraLogoBuf) {
      try { doc.image(gerenciadoraLogoBuf, pageW - mr - LOGO_W, logoY, { fit: [LOGO_W, LOGO_H] }); } catch {}
    }
    const anyLogo = !!(clienteLogoBuf || construtoraLogoBuf || gerenciadoraLogoBuf);
    let y = anyLogo ? logoY + LOGO_H + 13 : 48;

    // Rev. 2873 — CADA SEÇÃO ("assunto") ganha MOLDURA (caixa) em volta do
    // conteúdo, replicando o modelo LOTUS: título em negrito + régua + caixa.
    const sectionTitle = (label: string) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
      doc.text(label, ml, y);
      y = doc.y + 1;
      doc.moveTo(ml, y).lineTo(ml + cw, y).lineWidth(1).strokeColor("black").stroke();
      y += 3;
    };

    // Reserva espaço p/ TÍTULO + RÉGUA + CAIXA juntos: se não couber, vira a
    // página ANTES de desenhar o título (evita título/régua órfãos). ~20px = bloco título.
    const TITLE_BLOCK = 20;
    const bottomY = pageH - 40;
    // Rev. 2878 — espaçamento entre seções enxuto p/ caber tudo em UMA página.
    const GAP = 10;
    const ensureSpace = (contentH: number) => {
      if (y + TITLE_BLOCK + contentH > bottomY) { doc.addPage(); y = 40; }
    };

    // ===== DADOS CONTRATUAIS — tabela emoldurada (célula a célula) =====
    const rowH = 18;
    const c1w = Math.round(cw * 0.55);
    const c2w = cw - c1w;
    const tRows = [
      ["Contratada: " + (s(fornecedor?.razaoSocial) || s(ficha.fornecedor_nome)), "Contrato nº: " + s(obra.numeroContrato || ficha.contrato_numero)],
      ["Endereço: " + s(fornecedor?.endereco), "Bairro: " + s(fornecedor?.bairro)],
      ["Município: " + s(fornecedor?.cidade), "Estado: " + s(fornecedor?.estado) + "       CEP: " + s(fornecedor?.cep)],
      ["Contato: " + s(fornecedor?.contato), "Fone Comercial: " + s(fornecedor?.telefone)],
      ["Email: " + s(fornecedor?.email), "Celular: " + s(fornecedor?.celular)],
    ];
    ensureSpace(tRows.length * rowH);
    sectionTitle("DADOS CONTRATUAIS:");
    doc.lineWidth(0.5).strokeColor("black");
    for (let i = 0; i < tRows.length; i++) {
      const ry = y + i * rowH;
      doc.rect(ml, ry, c1w, rowH).stroke();
      doc.rect(ml + c1w, ry, c2w, rowH).stroke();
      doc.font("Helvetica").fontSize(8.5).fillColor("black");
      doc.text(tRows[i][0], ml + 4, ry + 4, { width: c1w - 8 });
      doc.text(tRows[i][1], ml + c1w + 4, ry + 4, { width: c2w - 8 });
    }
    y += tRows.length * rowH + GAP;

    // ===== DESCRIÇÃO DO PRODUTO / SERVIÇO — caixa única =====
    {
      const pad = 4;
      doc.font("Helvetica").fontSize(9).fillColor("black");
      const txt = s(ficha.descricao);
      const th = doc.heightOfString(txt, { width: cw - 2 * pad });
      const boxH = Math.max(22, th + 2 * pad);
      ensureSpace(boxH);
      sectionTitle("DESCRIÇÃO DO PRODUTO / SERVIÇO:");
      doc.font("Helvetica").fontSize(9).fillColor("black");
      doc.lineWidth(0.5).strokeColor("black").rect(ml, y, cw, boxH).stroke();
      doc.text(txt, ml + pad, y + pad, { width: cw - 2 * pad });
      y += boxH + GAP;
    }

    // ===== ESPECIFICAÇÕES — caixa em volta da lista de itens =====
    {
      const pad = 6;
      const indent = 16;
      const lineW = cw - indent - pad;
      const lines = s(ficha.especificacoes)
        .split("\n")
        .map((l) => l.replace(/^[\s•\-\*○◦▪o]+/, "").trim())
        .filter(Boolean);
      doc.font("Helvetica").fontSize(8.5).fillColor("black");
      const lineHs: number[] = [];
      let contentH = pad;
      for (const line of lines) {
        const h = doc.heightOfString("o    " + line, { width: lineW });
        lineHs.push(h);
        contentH += h + 3;
      }
      contentH = Math.max(22, contentH + pad - 3);
      ensureSpace(contentH);
      sectionTitle("ESPECIFICAÇÕES:");
      const boxY = y;
      doc.lineWidth(0.5).strokeColor("black").rect(ml, boxY, cw, contentH).stroke();
      let ly = boxY + pad;
      doc.font("Helvetica").fontSize(8.5).fillColor("black");
      for (let i = 0; i < lines.length; i++) {
        doc.text("o    " + lines[i], ml + indent, ly, { width: lineW });
        ly += lineHs[i] + 3;
      }
      y = boxY + contentH + GAP;
    }

    // ===== OUTRAS INFORMAÇÕES / FOTO — caixa SÓ com a foto centralizada =====
    {
      const pad = 8;
      const maxW = cw * 0.6;

      // Rev. 2878 — a foto é a seção que mais empurra o conteúdo p/ a 2ª página.
      // Em vez de um teto fixo (250px), calculamos o espaço REALMENTE disponível
      // entre o ponto atual e o rodapé, RESERVANDO o bloco de OBSERVAÇÕES (que vem
      // logo abaixo) — assim a foto encolhe só o necessário e tudo cabe em UMA
      // página. Clamp [90, 250] preserva legibilidade quando há folga de sobra.
      const obsPad = 6;
      const obsTxt = s(ficha.observacoes);
      // Pré-medição com a MESMA tipografia da seção OBSERVAÇÕES (Helvetica 9),
      // senão herdaríamos a fonte das ESPECIFICAÇÕES (8.5) e subestimaríamos a
      // reserva, voltando a empurrar OBSERVAÇÕES p/ a 2ª página em casos limítrofes.
      doc.font("Helvetica").fontSize(9);
      const obsTh = obsTxt ? doc.heightOfString(obsTxt, { width: cw - 2 * obsPad }) : 0;
      const obsBoxH = Math.max(40, obsTh + 2 * obsPad);
      const obsReserve = TITLE_BLOCK + obsBoxH + GAP;
      const availPhotoH = bottomY - y - TITLE_BLOCK - 2 * pad - obsReserve;
      const maxH = Math.max(90, Math.min(250, availPhotoH));

      let imgObj: any = null;
      let photoW = 0;
      let photoH = 0;
      if (photoBuf) {
        try {
          imgObj = (doc as any).openImage(photoBuf);
          const scale = Math.min(maxW / imgObj.width, maxH / imgObj.height);
          photoW = imgObj.width * scale;
          photoH = imgObj.height * scale;
        } catch { imgObj = null; }
        if (!imgObj) { photoW = maxW; photoH = Math.min(170, maxH); } // fallback sem openImage
      }

      const boxH = Math.max(40, pad + photoH + pad);
      ensureSpace(boxH);
      sectionTitle("OUTRAS INFORMAÇÕES / FOTO:");
      const boxY = y;
      doc.lineWidth(0.5).strokeColor("black").rect(ml, boxY, cw, boxH).stroke();
      if (photoBuf && photoH) {
        try {
          const px = ml + (cw - photoW) / 2;
          const py = boxY + pad;
          if (imgObj) doc.image(imgObj, px, py, { width: photoW, height: photoH });
          else doc.image(photoBuf, px, py, { fit: [photoW, photoH], align: "center" });
        } catch {}
      }
      y = boxY + boxH + GAP;
    }

    // ===== OBSERVAÇÕES — SEÇÃO SEPARADA com caixa própria (modelo LOTUS) =====
    {
      const pad = 6;
      doc.font("Helvetica").fontSize(9).fillColor("black");
      const txt = s(ficha.observacoes);
      const th = txt ? doc.heightOfString(txt, { width: cw - 2 * pad }) : 0;
      const boxH = Math.max(40, th + 2 * pad);
      ensureSpace(boxH);
      sectionTitle("OBSERVAÇÕES:");
      const boxY = y;
      doc.lineWidth(0.5).strokeColor("black").rect(ml, boxY, cw, boxH).stroke();
      if (txt) {
        doc.font("Helvetica").fontSize(9).fillColor("black");
        doc.text(txt, ml + pad, boxY + pad, { width: cw - 2 * pad });
      }
      y = boxY + boxH;
    }

    doc.end();
  });
}

export async function gerarIndicePdf(
  fichas: DatabookFichaData[],
  obra: ObraData,
  company: CompanyData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 841.89;
    const margin = 40;
    const contentW = pageW - margin * 2;

    doc.font("Helvetica-Bold").fontSize(14).fillColor("black")
      .text("ÍNDICE DO DATABOOK", margin, 30, { width: contentW, align: "center" });

    let y = 60;
    doc.font("Helvetica").fontSize(10)
      .text("Obra: " + obra.nome + " | Construtora: " + company.razaoSocial, margin, y);
    y += 25;

    const cols = [
      { label: "Nº", w: 50 },
      { label: "Disciplina", w: 120 },
      { label: "Descrição", w: 300 },
      { label: "Fornecedor", w: 150 },
      { label: "OC/Contrato", w: 80 },
      { label: "Status", w: 70 },
    ];

    let cx = margin + 5;
    doc.font("Helvetica-Bold").fontSize(8);
    for (const col of cols) {
      doc.text(col.label, cx, y, { width: col.w - 10 });
      cx += col.w;
    }
    y += 14;
    doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("black").lineWidth(0.5).stroke();
    y += 6;

    // Rev. 2861 — índice SEPARADO POR DISCIPLINA, numerado dentro de cada
    // disciplina (código EST-001, HID-002, ...), para facilitar a busca.
    const ordenadas = [...fichas].sort((a, b) => {
      const od = ordemDisciplina(a.disciplina) - ordemDisciplina(b.disciplina);
      if (od !== 0) return od;
      return (a.numero_sequencial || 0) - (b.numero_sequencial || 0);
    });

    let disciplinaAtual: string | null = null;
    const pageW2 = pageW - margin * 2;
    for (const ficha of ordenadas) {
      const disc = ficha.disciplina || "Outros";
      if (disc !== disciplinaAtual) {
        if (y > 520) { doc.addPage(); y = 40; }
        y += 4;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#1B2A4A");
        doc.rect(margin, y - 2, pageW2, 16).fill("#E8EDF5");
        doc.fillColor("#1B2A4A").text(disc.toUpperCase(), margin + 5, y + 1, { width: pageW2 - 10 });
        doc.fillColor("black");
        y += 18;
        disciplinaAtual = disc;
      }
      if (y > 540) { doc.addPage(); y = 40; }
      doc.font("Helvetica").fontSize(8).fillColor("black");
      cx = margin + 5;
      const row = [
        codigoFicha(ficha.disciplina, ficha.numero_sequencial),
        ficha.disciplina || "—",
        ficha.descricao.substring(0, 60) + (ficha.descricao.length > 60 ? "..." : ""),
        ficha.fornecedor_nome || "—",
        ficha.contrato_numero || "—",
        ficha.status,
      ];
      for (let i = 0; i < cols.length; i++) {
        doc.text(row[i], cx, y, { width: cols[i].w - 10 });
        cx += cols[i].w;
      }
      y += 16;
    }

    doc.end();
  });
}

export async function gerarDatabookCompletoPdf(
  companyId: number,
  obraId: number,
): Promise<{ pdfBuffer: Buffer; fichas: DatabookFichaData[] }> {
  const db = await getDb();

  const [obraRow] = await db.select().from(obras).where(eq(obras.id, obraId));
  const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyId));

  const obraData: ObraData = {
    nome: obraRow?.nome || "Obra",
    endereco: obraRow?.endereco,
    gerenciadoraNome: (obraRow as any)?.gerenciadoraNome,
    gerenciadoraLogoUrl: (obraRow as any)?.gerenciadoraLogoUrl,
    clienteLogoUrl: (obraRow as any)?.clienteLogoUrl,
    numeroContrato: (obraRow as any)?.numeroContrato,
  };
  const companyData: CompanyData = {
    razaoSocial: companyRow?.razaoSocial || "Empresa",
    logoUrl: companyRow?.logoUrl,
  };

  const result = await db.execute(sql`
    SELECT * FROM databook_fichas
    WHERE company_id = ${companyId} AND obra_id = ${obraId}
    ORDER BY numero_sequencial ASC
  `);
  const fichas = ((result as any).rows ?? result ?? []) as DatabookFichaData[];

  const indicePdf = await gerarIndicePdf(fichas, obraData, companyData);

  return { pdfBuffer: indicePdf, fichas };
}
