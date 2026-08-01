/**
 * Rev. 4793 — HTML do Boletim de Medição de TERCEIROS para assinatura digital
 * no FCSign (fluxo sem papel). Gerado server-side a partir do banco para que o
 * documento assinado seja sempre fiel aos dados da medição no momento do envio.
 * Layout paisagem (@page landscape), mesmo conteúdo do PDF: identificação,
 * planilha com quantidades contratadas/medidas em números e resumo financeiro.
 */
import { eq, and, asc } from "drizzle-orm";
import {
  terceiroMedicoes, terceiroContratos, terceiroContratoItens, terceiroMedicaoItens,
  empresasTerceiras, companies, obras,
} from "../drizzle/schema";

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
  const liquido = totPeriodo - totalRet - descontos;

  const numStr = String(medicao.numero || 1).padStart(2, "0");
  const titulo = `Boletim de Medição Nº ${numStr} — ${contrato.descricao || `Contrato #${contrato.id}`} — ${medicao.periodo || ""}`;
  const logoUrl = (company as any)?.logoUrl || "";
  const logoImg = logoUrl && (logoUrl.startsWith("data:image") || logoUrl.startsWith("/uploads/"))
    ? `<img src="${esc(logoUrl)}" style="height:44px;border-radius:4px" />` : "";

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
  <div class="numbox"><div style="font-size:8px">MEDIÇÃO · ${esc(medicao.periodo || "-")}</div><div style="font-size:18px;font-weight:bold">Nº ${numStr}</div></div>
</div>
<div class="info">
  <div><b>Contrato</b>${esc(contrato.descricao || `#${contrato.id}`)}</div>
  <div><b>Terceiro (Contratada)</b>${esc(empresa?.razaoSocial || empresa?.nomeFantasia || "-")}</div>
  <div><b>CNPJ Terceiro</b>${esc(empresa?.cnpj || "-")}</div>
  <div><b>Obra</b>${esc(obraNome || "-")}</div>
  <div><b>Valor do Contrato</b>${BRL(num(contrato.valorTotal))}</div>
  <div><b>Período Medido</b>${esc((medicao as any).dataInicio || "-")} a ${esc((medicao as any).dataFim || "-")}</div>
  <div><b>Medido no Período</b>${BRL(totPeriodo)}</div>
  <div><b>Acumulado</b>${BRL(totAcum)} (${totContrato > 0 ? (totAcum / totContrato * 100).toFixed(1) : "0.0"}%)</div>
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
  <div class="liq">VALOR LÍQUIDO A PAGAR<br/><span style="font-size:15px">${BRL(liquido)}</span></div>
</div>
<p style="font-size:9px;color:#666;margin-top:10px">Documento validado por assinatura eletrônica via FCSign — contratante e contratada assinam digitalmente, com hash do documento e trilha de auditoria. Fluxo 100% sem papel.</p>
</div>`;

  return { html, titulo };
}
