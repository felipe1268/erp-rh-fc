import { Express, Request, Response } from "express";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { XMLParser } from "fast-xml-parser";
import { userCompanies } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  numberParseOptions: { skipLike: /^\d{12,}$/ },
});

function fmtCNPJ(v: string): string {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v || "";
}

function fmtCEP(v: string): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0,5)}-${d.slice(5)}` : v || "";
}

function fmtDate(v: string): string {
  try {
    if (!v) return "";
    const dt = new Date(v);
    if (isNaN(dt.getTime())) return v;
    return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return v || ""; }
}

function fmtBRL(v: any): string {
  const n = parseFloat(String(v || "0"));
  if (isNaN(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtChave(v: string): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function buildDanfeHtml(row: any): string {
  const xml = row.xml_payload ? String(row.xml_payload) : null;
  let ide: any = {}, emit: any = {}, dest: any = {}, total: any = {}, itens: any[] = [], infAdic = "", dups: any[] = [];
  let nProt = "", dhRecbto = "";

  if (xml) {
    try {
      const p = xmlParser.parse(xml);
      const proc = p["nfeProc"] || p;
      const nfe = proc["NFe"] || proc["nfe"] || {};
      const infNFe = nfe["infNFe"] || {};
      const infProt = proc["protNFe"]?.["infProt"] || {};
      ide = infNFe["ide"] || {};
      const emitRaw = infNFe["emit"] || {};
      const destRaw = infNFe["dest"] || {};
      const enderEmit = emitRaw["enderEmit"] || {};
      const enderDest = destRaw["enderDest"] || {};
      const rawDet = infNFe["det"];
      const detArr: any[] = Array.isArray(rawDet) ? rawDet : rawDet ? [rawDet] : [];
      const cobr = infNFe["cobr"] || {};
      const rawDup = cobr["dup"];
      dups = Array.isArray(rawDup) ? rawDup : rawDup ? [rawDup] : [];
      infAdic = String(infNFe["infAdic"]?.["infCpl"] || infNFe["infAdic"]?.["infAdFisco"] || "");
      nProt = String(infProt["nProt"] || "");
      dhRecbto = String(infProt["dhRecbto"] || "");
      emit = {
        cnpj: fmtCNPJ(String(emitRaw["CNPJ"] || emitRaw["CPF"] || "")),
        xNome: String(emitRaw["xNome"] || ""),
        xFant: String(emitRaw["xFant"] || ""),
        ie: String(emitRaw["IE"] || ""),
        crt: String(emitRaw["CRT"] || ""),
        endereco: `${enderEmit["xLgr"] || ""}, ${enderEmit["nro"] || ""}${enderEmit["xCpl"] ? " " + enderEmit["xCpl"] : ""}`,
        bairro: String(enderEmit["xBairro"] || ""),
        municipio: String(enderEmit["xMun"] || ""),
        uf: String(enderEmit["UF"] || ""),
        cep: fmtCEP(String(enderEmit["CEP"] || "")),
        fone: String(enderEmit["fone"] || ""),
      };
      dest = {
        cnpj: fmtCNPJ(String(destRaw["CNPJ"] || destRaw["CPF"] || "")),
        xNome: String(destRaw["xNome"] || ""),
        ie: String(destRaw["IE"] || ""),
        email: String(destRaw["email"] || ""),
        endereco: `${enderDest["xLgr"] || ""}, ${enderDest["nro"] || ""}${enderDest["xCpl"] ? " " + enderDest["xCpl"] : ""}`,
        bairro: String(enderDest["xBairro"] || ""),
        municipio: String(enderDest["xMun"] || ""),
        uf: String(enderDest["UF"] || ""),
        cep: fmtCEP(String(enderDest["CEP"] || "")),
      };
      const totalRaw = infNFe["total"]?.["ICMSTot"] || {};
      total = {
        vBC: fmtBRL(totalRaw["vBC"]),
        vICMS: fmtBRL(totalRaw["vICMS"]),
        vST: fmtBRL(totalRaw["vST"]),
        vProd: fmtBRL(totalRaw["vProd"]),
        vFrete: fmtBRL(totalRaw["vFrete"]),
        vSeg: fmtBRL(totalRaw["vSeg"]),
        vDesc: fmtBRL(totalRaw["vDesc"]),
        vIPI: fmtBRL(totalRaw["vIPI"]),
        vPIS: fmtBRL(totalRaw["vPIS"]),
        vCOFINS: fmtBRL(totalRaw["vCOFINS"]),
        vNF: fmtBRL(totalRaw["vNF"]),
        vTotTrib: fmtBRL(totalRaw["vTotTrib"]),
      };
      itens = detArr.map((det: any) => {
        const prod = det["prod"] || {};
        const imp = det["imposto"] || {};
        const icmsBlock = imp["ICMS"] || {};
        const icmsInner = icmsBlock[Object.keys(icmsBlock)[0]] || {};
        const ipiBlock = imp["IPI"]?.["IPITrib"] || {};
        return {
          nItem: String(det["@_nItem"] ?? ""),
          cProd: String(prod["cProd"] || ""),
          xProd: String(prod["xProd"] || ""),
          ncm: String(prod["NCM"] || ""),
          cfop: String(prod["CFOP"] || ""),
          uCom: String(prod["uCom"] || ""),
          qCom: fmtBRL(prod["qCom"]),
          vUnCom: fmtBRL(prod["vUnCom"]),
          vProd: fmtBRL(prod["vProd"]),
          vDesc: fmtBRL(prod["vDesc"]),
          cst: String(icmsInner["CST"] || icmsInner["CSOSN"] || ""),
          pICMS: fmtBRL(icmsInner["pICMS"]),
          vICMS: fmtBRL(icmsInner["vICMS"]),
          vIPI: fmtBRL(ipiBlock["vIPI"]),
        };
      });
    } catch (_) {}
  } else {
    emit = { cnpj: fmtCNPJ(String(row.emitente_cnpj || "")), xNome: String(row.emitente_nome || ""), xFant: "", ie: "", endereco: "", bairro: "", municipio: "", uf: "", cep: "", fone: "" };
    dest = { cnpj: "", xNome: "", ie: "", endereco: "", bairro: "", municipio: "", uf: "", cep: "" };
    total = { vNF: fmtBRL(row.valor_total || row.valor_bruto || 0) };
  }

  const nNF = String(ide["nNF"] || row.numero_nf || "");
  const serie = String(ide["serie"] || "");
  const dhEmi = fmtDate(String(ide["dhEmi"] || row.data_emissao || ""));
  const natOp = String(ide["natOp"] || "");
  const chave = String(row.chave_acesso || "").replace(/\D/g, "");
  const chaveFormatada = fmtChave(chave);
  const TPNF: Record<string, string> = { "0": "Entrada", "1": "Saída" };
  const tpNF = String(ide["tpNF"] ?? "");

  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const itensRows = itens.length
    ? itens.map(it => `
      <tr>
        <td style="padding:3px 4px;border-right:1px solid #ccc">${esc(it.nItem)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc">${esc(it.cProd)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc">${esc(it.xProd)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:center">${esc(it.ncm)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:center">${esc(it.cst)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:center">${esc(it.cfop)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:center">${esc(it.uCom)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:right">${esc(it.qCom)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:right">${esc(it.vUnCom)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:right">${esc(it.vDesc)}</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:right">${esc(it.pICMS)}%</td>
        <td style="padding:3px 4px;border-right:1px solid #ccc;text-align:right">${esc(it.vICMS)}</td>
        <td style="padding:3px 4px;text-align:right">${esc(it.vProd)}</td>
      </tr>`).join("")
    : `<tr><td colspan="13" style="padding:8px;text-align:center;color:#888;font-style:italic">XML completo não disponível — nota recebida como resumo SEFAZ</td></tr>`;

  const dupsHtml = dups.length
    ? dups.map((d: any) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 6px;border:1px solid #ccc;border-radius:4px;font-size:10px">
        ${esc(String(d["nDup"] || ""))} · Venc: ${esc(String(d["dDup"] || "").slice(0,10))} · ${esc(fmtBRL(d["vDup"]))}
      </span>`).join("")
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DANFE — NF-e ${esc(nNF)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; background: #fff; padding: 8px; }
  .page { max-width: 900px; margin: 0 auto; }
  .border-box { border: 1px solid #555; }
  .section { border: 1px solid #555; margin-bottom: 4px; }
  .section + .section { border-top: none; }
  .section-title { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #555; padding: 1px 4px; letter-spacing: 0.5px; }
  .grid { display: grid; }
  .field { padding: 2px 5px; }
  .field-label { font-size: 7px; text-transform: uppercase; color: #666; letter-spacing: 0.3px; }
  .field-value { font-size: 10px; font-weight: 500; word-break: break-word; }
  .field-value.mono { font-family: monospace; font-size: 9px; letter-spacing: 0.5px; }
  .header-top { display: flex; border: 1px solid #555; margin-bottom: 4px; }
  .header-logo { width: 180px; padding: 6px; border-right: 1px solid #555; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .header-logo .company-name { font-size: 13px; font-weight: bold; line-height: 1.2; margin-bottom: 3px; }
  .header-logo .company-info { font-size: 8px; color: #444; line-height: 1.4; }
  .header-danfe { flex: 1; border-right: 1px solid #555; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px; text-align: center; }
  .danfe-title { font-size: 14px; font-weight: bold; border: 2px solid #000; padding: 2px 10px; margin-bottom: 2px; }
  .danfe-subtitle { font-size: 8px; color: #555; }
  .header-nf { width: 130px; padding: 6px; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .nf-num { font-size: 16px; font-weight: bold; font-family: monospace; }
  .nf-serie { font-size: 10px; color: #555; }
  .chave-box { border: 1px solid #555; padding: 4px 5px; margin-bottom: 4px; background: #f9f9f9; }
  .chave-label { font-size: 7px; text-transform: uppercase; color: #666; margin-bottom: 1px; }
  .chave-value { font-family: monospace; font-size: 10px; letter-spacing: 1px; word-break: break-all; }
  .prot-box { display: flex; gap: 8px; flex-wrap: wrap; }
  table.itens { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  table.itens th { background: #e8e8e8; font-size: 7px; text-transform: uppercase; padding: 3px 4px; border: 1px solid #bbb; text-align: center; }
  table.itens td { border-bottom: 1px solid #eee; font-size: 9px; }
  table.itens tr:nth-child(even) td { background: #fafafa; }
  .totais-grid { display: grid; grid-template-columns: repeat(4,1fr); border-top: 1px solid #ccc; }
  .totais-grid .field { border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; }
  .total-nf { text-align: right; font-size: 14px; font-weight: bold; color: #1a3a6b; padding: 4px 8px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="page">

  <!-- Barra DANFE + Emitente -->
  <div class="header-top">
    <div class="header-logo">
      <div class="company-name">${esc(emit.xNome || emit.xFant || "EMITENTE")}</div>
      <div class="company-info">
        ${emit.xFant ? `<strong>${esc(emit.xFant)}</strong><br>` : ""}
        ${esc(emit.endereco)}<br>
        ${esc(emit.bairro)}${emit.bairro && emit.municipio ? " — " : ""}${esc(emit.municipio)}${emit.uf ? "/" + esc(emit.uf) : ""}<br>
        ${emit.cep ? "CEP: " + esc(emit.cep) + "<br>" : ""}
        CNPJ: ${esc(emit.cnpj)}<br>
        ${emit.ie ? "IE: " + esc(emit.ie) : ""}
        ${emit.fone ? "<br>Tel: " + esc(emit.fone) : ""}
      </div>
    </div>
    <div class="header-danfe">
      <div class="danfe-title">DANFE</div>
      <div class="danfe-subtitle">Documento Auxiliar da<br>Nota Fiscal Eletrônica</div>
      <div style="margin-top:6px;font-size:8px;color:#444">
        ${tpNF !== "" ? `Tipo: <strong>${esc(TPNF[tpNF] ?? tpNF)}</strong>` : ""}
        ${natOp ? `<br>Natureza: ${esc(natOp)}` : ""}
      </div>
    </div>
    <div class="header-nf">
      <div class="field-label">Nº</div>
      <div class="nf-num">${esc(nNF.padStart(9, "0"))}</div>
      ${serie ? `<div class="nf-serie">Série ${esc(serie)}</div>` : ""}
      <div style="margin-top:8px">
        <div class="field-label">Emissão</div>
        <div style="font-size:9px;font-weight:500">${esc(dhEmi)}</div>
      </div>
      ${nProt ? `<div style="margin-top:6px"><div class="field-label">Protocolo</div><div style="font-size:8px;font-family:monospace">${esc(nProt)}</div></div>` : ""}
    </div>
  </div>

  <!-- Chave de acesso -->
  ${chave ? `
  <div class="chave-box">
    <div class="chave-label">Chave de acesso (44 dígitos)</div>
    <div class="chave-value">${esc(chaveFormatada)}</div>
  </div>` : ""}

  <!-- Destinatário -->
  <div class="section">
    <div class="section-title">Destinatário / Remetente</div>
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr;border-top:1px solid #ccc">
      <div class="field" style="border-right:1px solid #ccc">
        <div class="field-label">Razão Social</div>
        <div class="field-value">${esc(dest.xNome || "—")}</div>
      </div>
      <div class="field" style="border-right:1px solid #ccc">
        <div class="field-label">CNPJ / CPF</div>
        <div class="field-value mono">${esc(dest.cnpj || "—")}</div>
      </div>
      <div class="field">
        <div class="field-label">Inscrição Estadual</div>
        <div class="field-value">${esc(dest.ie || "—")}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr;border-top:1px solid #ccc">
      <div class="field" style="border-right:1px solid #ccc">
        <div class="field-label">Endereço</div>
        <div class="field-value">${esc(dest.endereco || "—")}</div>
      </div>
      <div class="field" style="border-right:1px solid #ccc">
        <div class="field-label">Bairro</div>
        <div class="field-value">${esc(dest.bairro || "—")}</div>
      </div>
      <div class="field" style="border-right:1px solid #ccc">
        <div class="field-label">Município / UF</div>
        <div class="field-value">${esc(dest.municipio || "—")}${dest.uf ? "/" + esc(dest.uf) : ""}</div>
      </div>
      <div class="field">
        <div class="field-label">CEP</div>
        <div class="field-value mono">${esc(dest.cep || "—")}</div>
      </div>
    </div>
  </div>

  <!-- Itens -->
  <div class="section" style="border-top:1px solid #555">
    <div class="section-title">Dados dos Produtos / Serviços</div>
    <div style="overflow-x:auto">
      <table class="itens">
        <thead>
          <tr>
            <th style="width:25px">#</th>
            <th>Cód.</th>
            <th style="min-width:180px;text-align:left">Descrição do Produto / Serviço</th>
            <th>NCM</th>
            <th>CST</th>
            <th>CFOP</th>
            <th>UN</th>
            <th>Qtd.</th>
            <th>V. Unit.</th>
            <th>Desconto</th>
            <th>% ICMS</th>
            <th>V. ICMS</th>
            <th>V. Total</th>
          </tr>
        </thead>
        <tbody>
          ${itensRows}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Totais -->
  <div class="section" style="border-top:1px solid #555">
    <div class="section-title">Cálculo do Imposto</div>
    <div class="totais-grid">
      <div class="field"><div class="field-label">Base Cálc. ICMS</div><div class="field-value">${esc(total.vBC || "0,00")}</div></div>
      <div class="field"><div class="field-label">Valor ICMS</div><div class="field-value">${esc(total.vICMS || "0,00")}</div></div>
      <div class="field"><div class="field-label">Base Cálc. ICMS ST</div><div class="field-value">${esc(total.vST || "0,00")}</div></div>
      <div class="field"><div class="field-label">Valor IPI</div><div class="field-value">${esc(total.vIPI || "0,00")}</div></div>
      <div class="field"><div class="field-label">Valor PIS</div><div class="field-value">${esc(total.vPIS || "0,00")}</div></div>
      <div class="field"><div class="field-label">Valor COFINS</div><div class="field-value">${esc(total.vCOFINS || "0,00")}</div></div>
      <div class="field"><div class="field-label">Valor Frete</div><div class="field-value">${esc(total.vFrete || "0,00")}</div></div>
      <div class="field"><div class="field-label">Valor Desconto</div><div class="field-value">${esc(total.vDesc || "0,00")}</div></div>
    </div>
    <div style="border-top:2px solid #333;display:flex;justify-content:flex-end;align-items:center;padding:4px 6px;gap:16px">
      <div>
        <span class="field-label">Valor Total dos Produtos: </span>
        <span style="font-size:11px;font-weight:600">${esc(total.vProd || "0,00")}</span>
      </div>
      <div>
        <span class="field-label" style="font-size:9px">VALOR TOTAL DA NF-e: </span>
        <span class="total-nf">R$ ${esc(total.vNF || "0,00")}</span>
      </div>
    </div>
  </div>

  <!-- Duplicatas -->
  ${dups.length ? `
  <div class="section" style="border-top:1px solid #555;padding:4px 6px">
    <div class="section-title" style="margin-bottom:3px">Faturas / Duplicatas</div>
    ${dupsHtml}
  </div>` : ""}

  <!-- Informações adicionais -->
  ${infAdic ? `
  <div class="section" style="border-top:1px solid #555;padding:4px 6px">
    <div class="section-title" style="margin-bottom:2px">Informações Complementares</div>
    <div style="font-size:9px;line-height:1.5;color:#333">${esc(infAdic)}</div>
  </div>` : ""}

  <!-- Protocolo -->
  ${nProt ? `
  <div style="margin-top:6px;padding:4px 6px;background:#f0f8e8;border:1px solid #6ab04c;border-radius:4px;font-size:9px">
    ✓ <strong>Nota Fiscal Autorizada.</strong> Protocolo de Autorização: <strong>${esc(nProt)}</strong>${dhRecbto ? ` — ${esc(fmtDate(dhRecbto))}` : ""}
  </div>` : ""}

  <!-- Rodapé -->
  <div class="no-print" style="margin-top:12px;text-align:center;font-size:9px;color:#aaa">
    Gerado pelo ERP Gestão Integrada · Esta é uma representação visual da NF-e. O documento original está disponível no portal da SEFAZ.
  </div>

</div>
</body>
</html>`;
}

export function registerDanfeRoute(app: Express) {
  app.get("/api/fiscal-notes/:id/danfe", async (req: Request, res: Response) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); }
      catch { res.status(401).send("<h3>Não autenticado</h3>"); return; }

      const id = parseInt(String(req.params.id));
      const companyId = parseInt(String(req.query.companyId ?? ""));
      if (isNaN(id) || isNaN(companyId)) { res.status(400).send("<h3>Parâmetros inválidos</h3>"); return; }

      const db = await getDb();
      if (!db) { res.status(500).send("<h3>DB indisponível</h3>"); return; }

      if (user.role !== "admin_master" && user.role !== "admin") {
        const userComps = await db
          .select()
          .from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, companyId)));
        if (userComps.length === 0) {
          res.status(403).send("<h3>Sem permissão para acessar esta nota</h3>");
          return;
        }
      }

      const result = await db.$client.query(
        `SELECT id, numero_nf, chave_acesso, data_emissao, emitente_cnpj, emitente_nome,
                valor_bruto, valor_liquido, xml_payload, status
         FROM fiscal_notes
         WHERE id = $1 AND company_id = $2
         LIMIT 1`,
        [id, companyId]
      );
      const row = result.rows[0];
      if (!row) { res.status(404).send("<h3>Nota não encontrada</h3>"); return; }

      const html = buildDanfeHtml(row);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(html);
    } catch (err: any) {
      res.status(500).send(`<h3>Erro ao gerar DANFE: ${String(err?.message ?? err)}</h3>`);
    }
  });
}
