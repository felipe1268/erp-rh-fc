/**
 * Rev. 4793 — HTML do Boletim de Medição de TERCEIROS para assinatura digital
 * no FCSign (fluxo sem papel). Gerado server-side a partir do banco para que o
 * documento assinado seja sempre fiel aos dados da medição no momento do envio.
 * Layout paisagem (@page landscape), mesmo conteúdo do PDF: identificação,
 * planilha com quantidades contratadas/medidas em números e resumo financeiro.
 */
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  terceiroMedicoes, terceiroContratos, terceiroContratoItens, terceiroMedicaoItens,
  empresasTerceiras, companies, obras, terceiroMedicaoFds,
  medicaoCampo, medicaoCampoContornos, medicaoCampoFotos, medicaoCampoPdfs,
} from "../drizzle/schema";
import { sql } from "drizzle-orm";

const num = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const QTD = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function buildBoletimMedicaoHtml(db: any, medicaoId: number, companyId: number): Promise<{ html: string; titulo: string }> {
  const [medicao] = await db.select().from(terceiroMedicoes)
    .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
  if (!medicao) throw new Error("Medição não encontrada");
  const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
  if (!contrato) throw new Error("Contrato não encontrado");
  const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  let obraNome = "";
  if (contrato.obraId) {
    const [obra] = await db.select().from(obras).where(eq(obras.id, contrato.obraId));
    if (obra) obraNome = obra.nome;
  }
  const itensMedicao = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, medicaoId));
  const itensContrato = await db.select().from(terceiroContratoItens)
    .where(eq(terceiroContratoItens.contratoId, contrato.id)).orderBy(asc(terceiroContratoItens.ordem));

  const rows = itensMedicao.map((im: any) => {
    const ci = itensContrato.find((c: any) => c.id === im.contratoItemId);
    const quantidade = num(ci?.quantidade);
    const percPeriodo = num(im.percentualMedidoPeriodo);
    const percAcum = num(im.percentualAvancoFisico);
    return {
      eap: (ci as any)?.eapCodigo || "",
      descricao: ci?.descricao || im.descricao || "",
      unidade: ci?.unidade || "-",
      quantidade,
      valorUnitario: num(ci?.valorUnitario),
      valorTotal: num(ci?.valorTotal),
      percAnterior: num(im.percentualAcumuladoAnterior),
      percPeriodo,
      qtdPeriodo: quantidade * percPeriodo / 100,
      valorPeriodo: num(im.valorMedidoPeriodo),
      percAcum,
      qtdAcum: quantidade * percAcum / 100,
      valorAcum: num(im.valorAcumulado),
    };
  }).sort((a: any, b: any) => a.eap.localeCompare(b.eap, undefined, { numeric: true }));

  const totContrato = rows.reduce((s: number, r: any) => s + r.valorTotal, 0);
  const totPeriodo = rows.reduce((s: number, r: any) => s + r.valorPeriodo, 0);
  const totAcum = rows.reduce((s: number, r: any) => s + r.valorAcum, 0);

  const pISS = num((contrato as any).percISS), pINSS = num((contrato as any).percINSS), pIRRF = num((contrato as any).percIRRF);
  const pOutras = num((contrato as any).percOutrasRetencoes), pRetTec = num((contrato as any).percRetencaoTecnica);
  const totalRet = (pISS + pINSS + pIRRF + pOutras + pRetTec) > 0
    ? totPeriodo * (pISS + pINSS + pIRRF + pOutras + pRetTec) / 100
    : num((medicao as any).retencaoISS) + num((medicao as any).retencaoINSS) + num((medicao as any).retencaoIRRF) + num((medicao as any).outrasRetencoes) + num((medicao as any).retencaoTecnica);
  const descontos = num((medicao as any).descontos);
  // Rev. 4857 — FD / Descontos lançados na medição (mesma regra da tela e do
  // título no Contas a Pagar): o líquido a pagar abate também os FDs.
  const fdRows = await db.select({ valor: terceiroMedicaoFds.valor }).from(terceiroMedicaoFds)
    .where(and(eq(terceiroMedicaoFds.companyId, companyId), eq(terceiroMedicaoFds.medicaoId, medicaoId)));
  const fdTotal = fdRows.reduce((s: number, f: any) => s + num(f.valor), 0);
  const liquido = totPeriodo - totalRet - descontos - fdTotal;

  const numStr = String(medicao.numero || 1).padStart(2, "0");
  const revNum = Number((medicao as any).revisao || 0);
  const revSuf = revNum > 0 ? ` · Rev. ${revNum}` : "";
  const titulo = `Boletim de Medição Nº ${numStr}${revSuf} — ${contrato.descricao || `Contrato #${contrato.id}`} — ${medicao.periodo || ""}`;
  const logoUrl = (company as any)?.logoUrl || "";
  const logoImg = logoUrl && (logoUrl.startsWith("data:image") || (logoUrl.startsWith("/") && !logoUrl.includes("..")))
    ? `<img src="${esc(logoUrl)}" style="height:44px;border-radius:4px" />` : "";

  // Rev. 4796 — datas do contrato + ritmo (adiantado/em dia/atrasado)
  const fmtBR = (d: unknown) => {
    if (!d) return "-";
    const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    const [a, m2, dd] = s.split("-");
    return dd && m2 && a ? `${dd}/${m2}/${a}` : s;
  };
  const toDate = (d: unknown) => {
    if (!d) return null;
    const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    const t = new Date(s + "T12:00:00");
    return isNaN(t.getTime()) ? null : t;
  };
  const percAcumGlobal = totContrato > 0 ? totAcum / totContrato * 100 : 0;
  const ini = toDate((contrato as any).dataInicio);
  const fimC = toDate((contrato as any).dataTermino);
  const refD = toDate((medicao as any).dataFim) || new Date(new Date().toISOString());
  let ritmoHtml = "";
  if (ini && fimC && fimC.getTime() > ini.getTime()) {
    const percTempo = Math.max(0, Math.min(100, (refD.getTime() - ini.getTime()) / (fimC.getTime() - ini.getTime()) * 100));
    const delta = percAcumGlobal - percTempo;
    const [label, cor, bg] = delta >= 5 ? ["ADIANTADO", "#065f46", "#d1fae5"] : delta <= -5 ? ["ATRASADO", "#991b1b", "#fee2e2"] : ["EM DIA", "#1e40af", "#dbeafe"];
    ritmoHtml = `<span style="background:${bg};color:${cor};border-radius:10px;padding:2px 10px;font-weight:bold">${label}</span><br/><span style="font-size:8px;color:#7a8699">Físico ${percAcumGlobal.toFixed(1)}% × Prazo ${percTempo.toFixed(1)}%</span>`;
  } else {
    ritmoHtml = "Sem datas no contrato";
  }

  const trs = rows.map((r: any, i: number) => `
    <tr style="background:${i % 2 ? "#fff" : "#fafbfc"}">
      <td class="mono">${esc(r.eap) || "-"}</td>
      <td>${esc(r.descricao)}</td>
      <td class="c">${esc(r.unidade)}</td>
      <td class="r">${QTD(r.quantidade)}</td>
      <td class="r">${BRL(r.valorUnitario)}</td>
      <td class="r">${BRL(r.valorTotal)}</td>
      <td class="r">${r.percAnterior.toFixed(1)}%</td>
      <td class="r hl b">${r.percPeriodo.toFixed(1)}%</td>
      <td class="r hl b">${QTD(r.qtdPeriodo)} ${esc(r.unidade !== "-" ? r.unidade : "")}</td>
      <td class="r hl b">${BRL(r.valorPeriodo)}</td>
      <td class="r">${r.percAcum.toFixed(1)}%</td>
      <td class="r">${QTD(r.qtdAcum)} ${esc(r.unidade !== "-" ? r.unidade : "")}</td>
      <td class="r">${BRL(r.valorAcum)}</td>
    </tr>`).join("");

  // ── Rev. 4857 — DOCUMENTO ÚNICO (pedido do usuário): memória de cálculo do
  // levantamento de campo + registro fotográfico embutidos no próprio boletim
  // da tela de assinatura (fotos via miniatura pública /uploads?w=512).
  let memoriaHtml = "";
  try {
    const levCampoId = num((medicao as any).levantamentoCampoId);
    const campos = await db.select().from(medicaoCampo).where(and(
      eq(medicaoCampo.companyId, companyId),
      eq(medicaoCampo.origem, "terceiro"),
      sql`${medicaoCampo.deletedAt} IS NULL`,
      levCampoId > 0
        ? sql`(${medicaoCampo.id} = ${levCampoId} OR ${(medicaoCampo as any).medicaoId} = ${medicaoId})`
        : eq((medicaoCampo as any).medicaoId, medicaoId),
    ));
    const blocos: string[] = [];
    // Rev. 4857 — PLANTAS/CROQUIS server-side (pedido do usuário: "arquivo
    // completo"): mesma geometria da tela — SVG derivado do DXF (sidecar
    // .planta.json em cache) + contornos coloridos com numeração e legenda.
    const CORES_TIPO: Record<string, string> = { area: "#2563eb", volume: "#7c3aed", perimetro: "#059669", contagem: "#ea580c", parede: "#db2777" };
    const corSafe = (v: unknown) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v ?? "")) ? String(v) : "#2563eb");
    const buildPlantasHtml = async (campoId: number, contornos: any[]): Promise<string> => {
      try {
        // planta pode ter sido IMPORTADA de outro levantamento/pavimento —
        // busca pelos pdf_id referenciados nos contornos (sempre da empresa).
        const pdfIds = [...new Set(contornos.map((c: any) => Number(c.pdfId)).filter((n: number) => n > 0))];
        if (!pdfIds.length) return "";
        const pdfs = await db.select().from(medicaoCampoPdfs).where(and(
          inArray(medicaoCampoPdfs.id, pdfIds),
          eq(medicaoCampoPdfs.companyId, companyId),
          sql`${medicaoCampoPdfs.deletedAt} IS NULL`,
        )).orderBy(asc(medicaoCampoPdfs.ordem), asc(medicaoCampoPdfs.id));
        if (!pdfs.length || !contornos.length) return "";
        const { dbRetrieve } = await import("./storage");
        const partes: string[] = [];
        for (const pdf of pdfs) {
          const nomeArq = String((pdf as any).arquivoNome || (pdf as any).nome || (pdf as any).arquivoUrl || "").toLowerCase();
          if (!nomeArq.split("?")[0].endsWith(".dxf") && !nomeArq.includes(".dxf")) continue; // PDF raster só no app
          const key = String((pdf as any).arquivoKey || "").trim()
            || (String((pdf as any).arquivoUrl || "").startsWith("/uploads/")
              ? decodeURIComponent(String((pdf as any).arquivoUrl).slice("/uploads/".length).split("?")[0]) : "");
          if (!key.startsWith(`medicao-campo/${companyId}/`)) continue; // anti-IDOR
          let parsed: any = null;
          const side = await dbRetrieve(`${key}.planta.json`).catch(() => null);
          if (side) { try { parsed = JSON.parse(side.buffer.toString("utf8")); } catch { /* regenera */ } }
          if (!parsed?.svg) {
            const orig = await dbRetrieve(key).catch(() => null);
            if (!orig) continue;
            const { parseDxfPlanta } = await import("../client/src/pages/medicao/dxfPlanta");
            parsed = parseDxfPlanta(orig.buffer.toString("utf8"));
          }
          if (!parsed?.svg) continue;
          const pw = Number(parsed.w) || 1, ph = Number(parsed.h) || 1;
          const ratio = pw / ph;
          const mpu = parseFloat(String(parsed.metrosPorUnidade ?? ""));
          let fgx = 0, fgy = 0;
          if (isFinite(mpu) && mpu > 0) { fgx = Math.min(0.3, (1 / mpu) / pw); fgy = Math.min(0.3, (1 / mpu) / ph); }
          const stl = `position:absolute;left:${((fgx / (1 + 2 * fgx)) * 100).toFixed(3)}%;top:${((fgy / (1 + 2 * fgy)) * 100).toFixed(3)}%;width:${(100 / (1 + 2 * fgx)).toFixed(3)}%;height:${(100 / (1 + 2 * fgy)).toFixed(3)}%`;
          const bg = String(parsed.svg).replace("<svg ", `<svg style="${stl}" `);
          const W = 1000, H = 1000 / Math.max(ratio, 0.05);
          // um croqui por camada/serviço (Forro, Tabica…), como na tela
          const doPdf = contornos.filter((c: any) => c.pdfId === (pdf as any).id);
          const camadas = new Map<string, any[]>();
          for (const c of doPdf) {
            const nome = String(c.rotulo || c.servico || c.tipo || "Geral").trim() || "Geral";
            camadas.set(nome, [...(camadas.get(nome) ?? []), c]);
          }
          for (const [camadaNome, ccs] of [...camadas.entries()]) {
            const shapes: string[] = []; const legenda: string[] = [];
            let soma = 0; let unid = "";
            for (const c of [...ccs].sort((a: any, b: any) => (a.numero ?? 0) - (b.numero ?? 0))) {
              let pts: any[] = []; try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
              if (!pts.length) continue;
              const cor = corSafe(c.cor || CORES_TIPO[String(c.tipo)]);
              const fecha = c.tipo === "area" || c.tipo === "volume";
              const ptsStr = pts.map((p: any) => `${(Number(p.x) * W).toFixed(1)},${(Number(p.y) * H).toFixed(1)}`).join(" ");
              shapes.push(fecha
                ? `<polygon points="${ptsStr}" fill="${cor}" fill-opacity="0.18" stroke="${cor}" stroke-width="2.5"/>`
                : `<polyline points="${ptsStr}" fill="none" stroke="${cor}" stroke-width="3"/>`);
              // badge numerado na etiqueta salva ou no centroide
              let ex = pts.reduce((s: number, p: any) => s + Number(p.x), 0) / pts.length;
              let ey = pts.reduce((s: number, p: any) => s + Number(p.y), 0) / pts.length;
              try { const ep = c.etiquetaJson ? JSON.parse(c.etiquetaJson) : null; if (ep && isFinite(ep.x) && isFinite(ep.y)) { ex = ep.x; ey = ep.y; } } catch { /* */ }
              const numC = Number(c.numero);
              if (c.numero != null && isFinite(numC)) {
                shapes.push(`<circle cx="${(ex * W).toFixed(1)}" cy="${(ey * H).toFixed(1)}" r="16" fill="#fff" stroke="${cor}" stroke-width="2.5"/><text x="${(ex * W).toFixed(1)}" y="${(ey * H + 5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="bold" fill="${cor}">${numC}</text>`);
              }
              const q = num(c.quantidade);
              if (q > 0) { soma += q; unid = c.unidade || unid; }
              const medida = q > 0 ? `${QTD(q)} ${esc(c.unidade || "")}` : num(c.area) > 0 ? `${QTD(num(c.area))} m²` : num(c.perimetro) > 0 ? `${QTD(num(c.perimetro))} m` : "";
              legenda.push(`<div style="font-size:9px;padding:2px 0;border-bottom:1px solid #eef1f5"><span style="display:inline-block;width:18px;height:18px;border:1.5px solid ${cor};border-radius:50%;text-align:center;line-height:16px;font-weight:bold;color:${cor}">${esc(c.numero ?? "")}</span> ${esc(c.observacoes || "")} <b>${medida}</b></div>`);
            }
            if (!shapes.length) continue;
            partes.push(`
              <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-top:10px">
                <div style="font-size:10px;font-weight:bold;color:#1B3A5C;text-transform:uppercase">${esc(camadaNome)} <span style="color:#7a8699;font-weight:normal">· ${esc((pdf as any).nome || (pdf as any).arquivoNome || "Planta")} · ${ccs.length} medição(ões)${soma > 0 ? ` · total ${QTD(soma)} ${esc(unid)}` : ""}</span></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
                  <div style="flex:2;min-width:280px;position:relative;padding-top:${(100 / Math.max(ratio, 0.05) * 0.66).toFixed(2)}%;background:#fff;border:1px solid #eef1f5">
                    <div style="position:absolute;inset:0">${bg}<svg viewBox="0 0 ${W} ${H.toFixed(1)}" style="position:absolute;inset:0;width:100%;height:100%" preserveAspectRatio="none">${shapes.join("")}</svg></div>
                  </div>
                  <div style="flex:1;min-width:170px"><div style="font-size:8.5px;color:#7a8699;text-transform:uppercase;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:2px">Legenda — ${esc(camadaNome)}</div>${legenda.join("")}${soma > 0 ? `<div style="font-size:9px;text-align:right;font-weight:bold;padding-top:3px">TOTAL: ${QTD(soma)} ${esc(unid)}</div>` : ""}</div>
                </div>
              </div>`);
          }
        }
        return partes.length ? `<div style="margin-top:10px"><b style="font-size:9px;color:#1B3A5C">PLANTAS, MEDIÇÕES POR SERVIÇO</b>${partes.join("")}</div>` : "";
      } catch (e: any) {
        console.warn("[boletimMedicaoHtml] plantas indisponíveis:", e?.message);
        return "";
      }
    };
    for (const campo of campos) {
      const contornos = await db.select().from(medicaoCampoContornos).where(and(
        eq(medicaoCampoContornos.medicaoCampoId, campo.id),
        eq(medicaoCampoContornos.companyId, companyId),
        sql`${medicaoCampoContornos.deletedAt} IS NULL`,
      )).orderBy(asc(medicaoCampoContornos.tipo), asc(medicaoCampoContornos.numero), asc(medicaoCampoContornos.id));
      const fotosRows = await db.select().from(medicaoCampoFotos).where(and(
        eq(medicaoCampoFotos.medicaoCampoId, campo.id),
        eq(medicaoCampoFotos.companyId, companyId),
        sql`${medicaoCampoFotos.deletedAt} IS NULL`,
      )).orderBy(asc(medicaoCampoFotos.id));
      const rotuloDe = new Map<number, string>(contornos.map((c: any) => [c.id, c.rotulo || c.servico || ""]));
      const linhas = contornos.map((c: any, i: number) => {
        const medida = num(c.quantidade) > 0 ? `${QTD(num(c.quantidade))} ${esc(c.unidade || "")}`
          : num(c.area) > 0 ? `${QTD(num(c.area))} m²`
          : num(c.perimetro) > 0 ? `${QTD(num(c.perimetro))} m`
          : c.contagem ? `${c.contagem} un` : "-";
        return `<tr style="background:${i % 2 ? "#fff" : "#fafbfc"}">
          <td class="mono">${esc(c.numero ?? i + 1)}</td>
          <td>${esc(c.rotulo || "-")}</td>
          <td>${esc(c.itemDescricao || c.servico || "-")}</td>
          <td class="c">${esc(c.tipo || "-")}</td>
          <td class="r b">${medida}</td>
          <td>${esc(c.observacoes || "")}</td>
        </tr>`;
      }).join("");
      const fotosHtml = fotosRows.map((f: any) => {
        const url = String(f.arquivoUrl || "");
        if (!url.startsWith("/uploads/")) return "";
        const key = decodeURIComponent(url.replace(/^\/uploads\//, ""));
        if (!key.startsWith(`medicao-campo/${companyId}/`)) return "";
        if (!/\.(jpe?g|png|webp)$/i.test(key)) return "";
        const legenda = f.legenda || rotuloDe.get(f.contornoId) || "Foto do levantamento";
        return `<figure style="margin:0;width:180px"><img src="${esc(url)}?w=512" style="width:180px;height:135px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb" loading="lazy"/><figcaption style="font-size:8.5px;color:#555;padding-top:2px">${esc(legenda)}</figcaption></figure>`;
      }).filter(Boolean).join("");
      const plantasHtml = await buildPlantasHtml(campo.id, contornos);
      blocos.push(`
        <div style="page-break-before:always;border-top:2px solid #1B3A5C;margin-top:18px;padding-top:8px">
        <h3 style="color:#1B3A5C;font-size:12px;margin:6px 0">MEMÓRIA DE CÁLCULO — LEVANTAMENTO Nº ${esc(String(campo.numero || "").padStart(3, "0"))}${campo.titulo ? ` — ${esc(campo.titulo)}` : ""}</h3>
        ${(campo as any).criadoPorNome ? `<p style="font-size:9px;color:#666;margin:0 0 6px">Levantado em campo por ${esc((campo as any).criadoPorNome)}.</p>` : ""}
        ${linhas ? `<table><thead><tr><th>Nº</th><th>Identificação</th><th>Serviço / Item</th><th class="c">Tipo</th><th class="r">Medida</th><th>Obs.</th></tr></thead><tbody>${linhas}</tbody></table>` : ""}
        ${plantasHtml}
        ${fotosHtml ? `<div style="margin-top:8px"><b style="font-size:9px;color:#1B3A5C">REGISTRO FOTOGRÁFICO</b><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${fotosHtml}</div></div>` : ""}
        </div>`);
    }
    if (blocos.length) memoriaHtml = blocos.join("");
  } catch (e: any) {
    console.warn("[boletimMedicaoHtml] levantamento indisponível:", e?.message);
  }

  // Bloco de assinaturas — campinho de rubrica + assinatura dos envolvidos.
  const assinaturasHtml = `
    <h3 style="color:#1B3A5C;font-size:12px;margin:18px 0 6px">ASSINATURAS</h3>
    <p style="font-size:9px;color:#666;margin:0 0 8px">Assinatura eletrônica via FCSign: cada envolvido assina digitalmente e informa a <b>rubrica</b>, que é carimbada em <b>todas as páginas</b> do documento final (PDF), junto de data/hora, IP e hash SHA-256.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${[
        `CONTRATADA — ${esc(empresa?.razaoSocial || empresa?.nomeFantasia || "Terceiro")}`,
        "CONTRATANTE — Elaborador / Gestor da Medição",
        "CONTRATANTE — Sócio Administrador (liberação final)",
      ].map((t) => `
        <div style="flex:1;min-width:200px;border:1px solid #cbd5e1;border-radius:6px;padding:10px">
          <div style="font-size:8.5px;color:#7a8699;text-transform:uppercase">${t}</div>
          <div style="margin-top:26px;border-top:1px solid #94a3b8;padding-top:3px;font-size:8.5px;color:#666">Assinatura</div>
          <div style="margin-top:16px;border-top:1px dashed #94a3b8;padding-top:3px;font-size:8.5px;color:#666">Rubrica (todas as páginas)</div>
        </div>`).join("")}
    </div>`;

  const html = `
<div class="boletim-medicao">
<style>
  @page { size: A4 landscape; margin: 12mm; }
  .boletim-medicao { font-family: Helvetica, Arial, sans-serif; color: #1a1a2e; font-size: 11px; }
  .boletim-medicao .hdr { background: #1B3A5C; color: #fff; border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .boletim-medicao .numbox { background: #fff; color: #1B3A5C; border-radius: 6px; padding: 6px 14px; text-align: center; }
  .boletim-medicao .info { background: #f4f6f9; border-radius: 6px; padding: 10px 14px; margin: 10px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; }
  .boletim-medicao .info b { display: block; color: #7a8699; font-size: 8.5px; text-transform: uppercase; }
  .boletim-medicao table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .boletim-medicao th { background: #1B3A5C; color: #fff; padding: 5px 4px; text-align: left; font-size: 8.5px; }
  .boletim-medicao th.hl { background: #2d5a8a; }
  .boletim-medicao td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
  .boletim-medicao .r { text-align: right; } .boletim-medicao .c { text-align: center; }
  .boletim-medicao .hl { background: #dbeafe; color: #1d4ed8; } .boletim-medicao .b { font-weight: bold; }
  .boletim-medicao .mono { font-family: monospace; font-size: 8.5px; color: #666; }
  .boletim-medicao tfoot td { background: #e2e8f0; font-weight: bold; border: none; }
  .boletim-medicao .resumo { border: 1.5px solid #1B3A5C; border-radius: 6px; padding: 10px 14px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .boletim-medicao .liq { background: #d1fae5; color: #065f46; border-radius: 6px; padding: 8px 16px; font-weight: bold; }
</style>
<div class="hdr">
  <div style="display:flex;align-items:center;gap:12px">${logoImg}
    <div><div style="font-size:16px;font-weight:bold">${esc(company?.name || "FC Engenharia")}</div>
    <div style="font-size:9px;color:#ccd6e0">${company?.cnpj ? `CNPJ: ${esc(company.cnpj)} · ` : ""}BOLETIM DE MEDIÇÃO — CONTRATO DE TERCEIROS</div></div>
  </div>
  <div class="numbox"><div style="font-size:8px">MEDIÇÃO · ${esc(medicao.periodo || "-")}</div><div style="font-size:18px;font-weight:bold">Nº ${numStr}${revNum > 0 ? ` · REV. ${revNum}` : ""}</div></div>
</div>
<div class="info">
  <div><b>Nº do Contrato</b>${esc((contrato as any).numeroContrato || `#${contrato.id}`)}</div>
  <div><b>Contrato</b>${esc(contrato.descricao || "-")}</div>
  <div><b>Terceiro (Contratada)</b>${esc(empresa?.razaoSocial || empresa?.nomeFantasia || "-")}</div>
  <div><b>CNPJ Terceiro</b>${esc(empresa?.cnpj || "-")}</div>
  <div><b>Obra</b>${esc(obraNome || "-")}</div>
  <div><b>Início do Contrato</b>${fmtBR((contrato as any).dataInicio)}</div>
  <div><b>Término do Contrato</b>${fmtBR((contrato as any).dataTermino)}</div>
  <div><b>Valor do Contrato</b>${BRL(num(contrato.valorTotal))}</div>
  <div><b>Período Medido</b>${fmtBR((medicao as any).dataInicio)} a ${fmtBR((medicao as any).dataFim)}</div>
  <div><b>Medido no Período</b>${BRL(totPeriodo)}</div>
  <div><b>Acumulado</b>${BRL(totAcum)} (${percAcumGlobal.toFixed(1)}%)</div>
  <div><b>Ritmo do Contrato</b>${ritmoHtml}</div>
</div>
<table>
  <thead><tr>
    <th>EAP</th><th>Atividade</th><th class="c">Unid.</th><th class="r">Qtd. Contr.</th><th class="r">V.Unit.</th><th class="r">V.Total Contr.</th>
    <th class="r">Ant.%</th><th class="r hl">Per.%</th><th class="r hl">Qtd. Período</th><th class="r hl">V.Período</th>
    <th class="r">Acum.%</th><th class="r">Qtd. Acum.</th><th class="r">V.Acum.</th>
  </tr></thead>
  <tbody>${trs}</tbody>
  <tfoot><tr><td colspan="5">TOTAL</td><td class="r">${BRL(totContrato)}</td><td colspan="3"></td><td class="r" style="color:#1d4ed8">${BRL(totPeriodo)}</td><td colspan="2"></td><td class="r">${BRL(totAcum)}</td></tr></tfoot>
</table>
<div class="resumo">
  <div><b style="color:#1B3A5C">RESUMO FINANCEIRO</b></div>
  <div>Valor Bruto do Período<br/><b>${BRL(totPeriodo)}</b></div>
  <div>Retenções<br/><b>- ${BRL(totalRet)}</b></div>
  <div>Descontos<br/><b>- ${BRL(descontos)}</b></div>
  ${fdTotal > 0 ? `<div>FD / Descontos lançados<br/><b>- ${BRL(fdTotal)}</b></div>` : ""}
  <div class="liq">VALOR LÍQUIDO A PAGAR<br/><span style="font-size:15px">${BRL(liquido)}</span></div>
</div>
${memoriaHtml}
${assinaturasHtml}
<p style="font-size:9px;color:#666;margin-top:10px">Documento validado por assinatura eletrônica via FCSign — contratante e contratada assinam digitalmente, com hash do documento e trilha de auditoria. Fluxo 100% sem papel.</p>
</div>`;

  return { html, titulo };
}
