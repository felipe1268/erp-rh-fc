import { useEffect } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

function n(v: string | null | undefined) { return parseFloat(v || "0"); }

function fBRL(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fNum(v: number, dec = 2) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function padEap(cod: string) {
  return "\u00a0".repeat((cod.split(".").length - 1) * 2);
}

function r2(v: number) { return Math.round(v * 100) / 100; }

export default function OrcamentoPrint() {
  const [, params] = useRoute("/orcamento/:id/print");
  const id = Number(params?.id ?? 0);

  const qs     = new URLSearchParams(window.location.search);
  const versao = (qs.get("v") || "custo") as "custo" | "meta" | "venda";
  const mpParam = parseFloat(qs.get("mp") || "20");
  const metaPercUrl = isNaN(mpParam) ? 20 : mpParam;

  const { data, isLoading } = trpc.orcamento.getById.useQuery(
    { id },
    { enabled: id > 0 }
  );

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, [data]);

  if (isLoading || !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif" }}>
        <p>Preparando impressão...</p>
      </div>
    );
  }

  const orc     = data as any;
  const obra    = orc.obra    as any | null;
  const empresa = orc.empresa as any | null;
  const itens   = (orc.itens ?? []) as any[];

  const bdiPct  = n(orc.bdiPercentual) * 100;
  const metaPerc = metaPercUrl;
  const metaFactor = 1 - metaPerc / 100;

  const nivel1     = itens.filter((i: any) => i.nivel === 1);
  const calcCusto  = nivel1.reduce((s: number, i: any) => s + n(i.custoTotal), 0);
  const calcVenda  = nivel1.reduce((s: number, i: any) => s + n(i.vendaTotal), 0);
  const calcMeta   = nivel1.reduce((s: number, i: any) => s + n(i.metaTotal), 0);
  const totalCusto = n(orc.totalCusto) || calcCusto;
  const totalVenda = n(orc.totalVenda) || calcVenda;
  const totalMetaDb = n(orc.totalMeta)  || r2(totalCusto * metaFactor);
  const totalMetaDisp = r2(totalCusto * metaFactor);

  const today = new Date().toLocaleDateString("pt-BR");

  const hCliente = obra?.cliente || orc.cliente || "—";
  const hObra    = obra?.nome || `${orc.codigo}${orc.descricao ? ` — ${orc.descricao}` : ""}`;
  const hLocal   = obra
    ? [obra.cidade, obra.estado].filter(Boolean).join(" — ") || obra.endereco || orc.local || "—"
    : orc.local || "—";
  const hResponsavel = obra?.responsavel || null;

  let hPrazo = "—";
  if (orc.tempoObraMeses) {
    hPrazo = `${orc.tempoObraMeses} meses`;
  } else if (obra?.dataInicio && obra?.dataPrevisaoFim) {
    const ini = new Date(obra.dataInicio);
    const fim = new Date(obra.dataPrevisaoFim);
    const meses = Math.round((fim.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    hPrazo = `${meses} meses`;
  }

  const hArea = orc.areaIntervencao
    ? `${fNum(n(orc.areaIntervencao))} m²`
    : "—";

  const hDataBase = orc.dataBase
    ? new Date(orc.dataBase + "T12:00:00").toLocaleDateString("pt-BR")
    : today;

  const versaoLabel = versao === "meta"  ? `META (−${fNum(metaPerc, 2)}%)`
                    : versao === "venda" ? `VENDA (BDI ${fNum(bdiPct, 2)}%)`
                    :                     "CUSTO";

  const totalGeral = versao === "meta"  ? totalMetaDisp
                   : versao === "venda" ? totalVenda
                   :                     totalCusto;

  function getItemValues(it: any) {
    const cuMat   = n(it.custoUnitMat);
    const cuMdo   = n(it.custoUnitMdo);
    const cuTot   = cuMat + cuMdo;
    const ctMat   = n(it.custoTotalMat);
    const ctMdo   = n(it.custoTotalMdo);
    const ctFull  = n(it.custoTotal);
    const vendaTot = n(it.vendaTotal);

    if (versao === "meta") {
      const uMat = r2(cuMat * metaFactor);
      const uMdo = r2(cuMdo * metaFactor);
      const tMat = r2(ctMat * metaFactor);
      const tMdo = r2(ctMdo * metaFactor);
      const tTot = r2(ctFull * metaFactor);
      return { uMat, uMdo, uTot: r2(cuTot * metaFactor), tMat, tMdo, tTot };
    } else if (versao === "venda") {
      const bdiDiv = bdiPct > 0 ? (1 - bdiPct / 100) : 1;
      const vFactor = bdiDiv < 1 ? 1 / bdiDiv : 1;
      const uMat = r2(cuMat * vFactor);
      const uMdo = r2(cuMdo * vFactor);
      const tTot = vendaTot || r2(ctFull * vFactor);
      return { uMat, uMdo, uTot: r2(cuTot * vFactor), tMat: r2(ctMat * vFactor), tMdo: r2(ctMdo * vFactor), tTot };
    } else {
      return { uMat: cuMat, uMdo: cuMdo, uTot: cuTot, tMat: ctMat, tMdo: ctMdo, tTot: ctFull };
    }
  }

  const colTotLabel = versao === "meta"  ? `Meta (−${fNum(metaPerc, 1)}%)`
                    : versao === "venda" ? `Venda (BDI ${fNum(bdiPct, 1)}%)`
                    :                     "Custo Total";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #000; background: #fff; }

        @page {
          size: A4 landscape;
          margin: 8mm 8mm 10mm 8mm;
        }
        @media print {
          html, body { width: 100%; height: 100%; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }

        .header-wrap {
          border: 1.5px solid #333;
          margin-bottom: 2px;
        }
        .header-top {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid #333;
        }
        .header-title {
          flex: 1;
          text-align: center;
          padding: 4px 8px;
          border-right: 1px solid #333;
        }
        .header-title h1 {
          font-size: 11pt;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .header-title p { font-size: 8pt; margin-top: 1px; }
        .header-title .rev { font-size: 8pt; font-weight: bold; margin-top: 1px; }
        .header-title .versao-badge {
          display: inline-block;
          font-size: 7.5pt;
          font-weight: bold;
          padding: 1px 6px;
          border-radius: 3px;
          margin-top: 2px;
        }
        .badge-custo  { background: #e8ecf4; color: #1a3a6b; border: 1px solid #1a3a6b; }
        .badge-meta   { background: #f3e8ff; color: #6b21a8; border: 1px solid #9333ea; }
        .badge-venda  { background: #e8f4ec; color: #166534; border: 1px solid #16a34a; }

        .header-logo {
          width: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }
        .logo-circle {
          width: 56px; height: 56px;
          border: 2.5px solid #1a3a6b;
          border-radius: 50%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .logo-fc { font-size: 18pt; font-weight: 900; color: #1a3a6b; line-height: 1; }
        .logo-sub { font-size: 4pt; color: #1a3a6b; font-weight: bold; letter-spacing: 0.5px; }

        .header-info { display: flex; border-top: none; }
        .info-left  { flex: 1; border-right: 1px solid #333; }
        .info-right { flex: 1; }
        .info-row {
          display: flex;
          border-bottom: 1px solid #ccc;
          min-height: 16px;
        }
        .info-row:last-child { border-bottom: none; }
        .info-label {
          width: 120px;
          font-weight: bold;
          font-size: 7pt;
          padding: 2px 4px;
          background: #f0f0f0;
          border-right: 1px solid #ccc;
          display: flex;
          align-items: center;
        }
        .info-value {
          flex: 1;
          padding: 2px 4px;
          font-size: 7.5pt;
          display: flex;
          align-items: center;
        }

        .eap-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 6.8pt;
        }
        .eap-table thead tr { background: #1a3a6b; color: #fff; }
        .eap-table thead.meta-head tr { background: #6b21a8; }
        .eap-table thead.venda-head tr { background: #166534; }
        .eap-table th {
          padding: 3px 2px;
          border: 0.5px solid #555;
          font-weight: bold;
          text-align: center;
          font-size: 6.5pt;
          white-space: nowrap;
        }
        .eap-table td {
          padding: 1.5px 2px;
          border: 0.3px solid #ccc;
          vertical-align: middle;
        }
        .eap-table tr:nth-child(even) td { background: #f7f8fa; }

        .nivel-1 td { font-weight: bold; background: #e8ecf4 !important; font-size: 7pt; }
        .nivel-2 td { font-weight: 600; background: #f3f5fb !important; }

        .col-item { width: 52px; text-align: center; }
        .col-desc { width: 220px; max-width: 220px; text-align: left; overflow: hidden; }
        .col-un   { width: 26px; text-align: center; }
        .col-qtd  { width: 44px; text-align: right; }
        .col-num  { width: 62px; text-align: right; }

        .val-mat  { color: #1a5276; font-weight: 500; }
        .val-mdo  { color: #935116; font-weight: 500; }
        .val-tot  { color: #186a3b; font-weight: 600; }
        .val-meta { color: #6b21a8; font-weight: 600; }
        .val-vnd  { color: #166534; font-weight: 600; }

        .total-row td {
          font-weight: bold;
          font-size: 7.5pt;
        }
        .total-row.custo-total  td { background: #1a3a6b !important; color: #fff; }
        .total-row.meta-total   td { background: #6b21a8 !important; color: #fff; }
        .total-row.venda-total  td { background: #166534 !important; color: #fff; }

        .print-btn {
          position: fixed; top: 12px; right: 16px; z-index: 999;
          padding: 6px 14px; background: #1a3a6b; color: #fff;
          border: none; border-radius: 4px; cursor: pointer;
          font-size: 9pt; font-weight: bold;
        }
        .print-btn:hover { background: #2e5d9f; }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>
        🖨 Imprimir / Salvar PDF
      </button>

      {/* ── CABEÇALHO ── */}
      <div className="header-wrap">
        <div className="header-top">
          <div className="header-title">
            <h1>{empresa?.razaoSocial || empresa?.nomeFantasia || "FC Engenharia e Consultoria Ltda"}</h1>
            <p>Planilha Orçamentária Analítica</p>
            <p className="rev">{orc.revisao || "—"}</p>
            <span className={`versao-badge ${versao === "meta" ? "badge-meta" : versao === "venda" ? "badge-venda" : "badge-custo"}`}>
              {versaoLabel}
            </span>
          </div>
          <div className="header-logo">
            {empresa?.logoUrl ? (
              <img src={empresa.logoUrl} alt="Logo"
                style={{ maxWidth: 68, maxHeight: 56, objectFit: "contain" }} />
            ) : (
              <div className="logo-circle">
                <span className="logo-fc">
                  {(empresa?.razaoSocial || "FC").substring(0, 2).toUpperCase()}
                </span>
                <span className="logo-sub">ENGENHARIA</span>
              </div>
            )}
          </div>
        </div>

        <div className="header-info">
          <div className="info-left">
            <div className="info-row">
              <span className="info-label">CLIENTE</span>
              <span className="info-value">{hCliente}</span>
            </div>
            <div className="info-row">
              <span className="info-label">OBRA</span>
              <span className="info-value">{hObra}</span>
            </div>
            <div className="info-row">
              <span className="info-label">LOCAL</span>
              <span className="info-value">{hLocal}</span>
            </div>
            {hResponsavel && (
              <div className="info-row">
                <span className="info-label">RESPONSÁVEL</span>
                <span className="info-value">{hResponsavel}</span>
              </div>
            )}
          </div>
          <div className="info-right">
            <div className="info-row">
              <span className="info-label">TEMPO DE OBRA</span>
              <span className="info-value">{hPrazo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">ÁREA DE INTERVENÇÃO</span>
              <span className="info-value">{hArea}</span>
            </div>
            <div className="info-row">
              <span className="info-label">DATA BASE</span>
              <span className="info-value">{hDataBase}</span>
            </div>
            <div className="info-row">
              <span className="info-label">VISÃO</span>
              <span className="info-value" style={{ fontWeight: "bold" }}>{versaoLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABELA EAP ── */}
      <table className="eap-table">
        <thead className={versao === "meta" ? "meta-head" : versao === "venda" ? "venda-head" : ""}>
          <tr>
            <th className="col-item">Item</th>
            <th className="col-desc">Descrição</th>
            <th className="col-un">Un</th>
            <th className="col-qtd">Qtd</th>
            <th className="col-num">Preço Unit.<br/>Material</th>
            <th className="col-num">Preço Unit.<br/>MO</th>
            <th className="col-num">Preço Total<br/>Material</th>
            <th className="col-num">Preço Total<br/>MO</th>
            <th className="col-num">{colTotLabel}</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it: any) => {
            const isN1 = it.nivel === 1;
            const isN2 = it.nivel === 2;
            const rowClass = isN1 ? "nivel-1" : isN2 ? "nivel-2" : "";
            const showNum = it.tipo !== "grupo" || isN1;
            const v = getItemValues(it);
            const totClass = versao === "meta" ? "val-meta" : versao === "venda" ? "val-vnd" : "val-tot";

            return (
              <tr key={it.id} className={rowClass}>
                <td className="col-item">{it.eapCodigo}</td>
                <td className="col-desc">{padEap(it.eapCodigo)}{it.descricao}</td>
                <td className="col-un">{it.unidade}</td>
                <td className="col-qtd">{showNum && it.quantidade ? fNum(n(it.quantidade), 2) : ""}</td>
                <td className="col-num val-mat">
                  {showNum && v.uMat ? fBRL(v.uMat) : ""}
                </td>
                <td className="col-num val-mdo">
                  {showNum && v.uMdo ? fBRL(v.uMdo) : ""}
                </td>
                <td className="col-num val-mat">
                  {v.tMat ? fBRL(v.tMat) : ""}
                </td>
                <td className="col-num val-mdo">
                  {v.tMdo ? fBRL(v.tMdo) : ""}
                </td>
                <td className={`col-num ${totClass}`}>
                  {v.tTot ? fBRL(v.tTot) : ""}
                </td>
              </tr>
            );
          })}

          {/* ── Linha de total geral ── */}
          <tr className={`total-row ${versao === "meta" ? "meta-total" : versao === "venda" ? "venda-total" : "custo-total"}`}>
            <td colSpan={8} style={{ textAlign: "right", paddingRight: 8 }}>
              TOTAL GERAL — {versaoLabel}
            </td>
            <td className="col-num" style={{ textAlign: "right" }}>
              {fBRL(totalGeral)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Rodapé */}
      <div style={{ marginTop: 6, fontSize: "6.5pt", color: "#666", borderTop: "0.5px solid #ccc", paddingTop: 3, display: "flex", justifyContent: "space-between" }}>
        <span>{empresa?.razaoSocial || "FC Engenharia e Consultoria Ltda"} — Orçamento {orc.codigo} {orc.revisao || ""} — Visão: {versaoLabel}</span>
        <span>Impresso em {today}</span>
      </div>
    </>
  );
}
