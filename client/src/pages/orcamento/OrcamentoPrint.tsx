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

export default function OrcamentoPrint() {
  const [, params] = useRoute("/orcamento/:id/print");
  const id = Number(params?.id ?? 0);

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

  const orc    = data as any;
  const obra   = orc.obra as any | null;   // dados da obra vinculada
  const itens  = (orc.itens ?? []) as any[];

  const totalCusto = n(orc.totalCusto);
  const totalVenda = n(orc.totalVenda);
  const bdiPct     = n(orc.bdiPercentual) * 100;

  const today = new Date().toLocaleDateString("pt-BR");

  // Campos do cabeçalho — obra tem prioridade, orçamento é fallback
  const hCliente = obra?.cliente || orc.cliente || "—";
  const hObra    = obra?.nome || `${orc.codigo}${orc.descricao ? ` — ${orc.descricao}` : ""}`;
  const hLocal   = obra
    ? [obra.cidade, obra.estado].filter(Boolean).join(" — ") || obra.endereco || orc.local || "—"
    : orc.local || "—";
  const hResponsavel = obra?.responsavel || null;

  // Prazo: manual (tempoObraMeses) ou calculado da obra (dataInicio → dataPrevisaoFim)
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

        /* ── Cabeçalho ── */
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

        .header-info {
          display: flex;
          border-top: none;
        }
        .info-left {
          flex: 1;
          border-right: 1px solid #333;
        }
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

        /* ── Tabela EAP ── */
        .eap-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 6.8pt;
        }
        .eap-table thead tr {
          background: #1a3a6b;
          color: #fff;
        }
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

        /* Níveis */
        .nivel-1 td { font-weight: bold; background: #e8ecf4 !important; font-size: 7pt; }
        .nivel-2 td { font-weight: 600; background: #f3f5fb !important; }
        .nivel-3 td { }

        .col-item { width: 52px; text-align: center; }
        .col-desc { text-align: left; }
        .col-un   { width: 26px; text-align: center; }
        .col-qtd  { width: 44px; text-align: right; }
        .col-num  { width: 60px; text-align: right; }
        .col-abc  { width: 22px; text-align: center; }

        .val-mat  { color: #1a5276; font-weight: 500; }
        .val-mdo  { color: #935116; font-weight: 500; }
        .val-tot  { color: #186a3b; font-weight: 600; }
        .val-vnd  { color: #1a5276; }

        /* Totalizador */
        .total-row td {
          font-weight: bold;
          background: #1a3a6b !important;
          color: #fff;
          font-size: 7.5pt;
        }

        /* Botão imprimir (não aparece na impressão) */
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
            <h1>FC Engenharia e Consultoria Ltda</h1>
            <p>Planilha Orçamentária Analítica</p>
            <p className="rev">{orc.revisao || "—"}</p>
          </div>
          <div className="header-logo">
            <div className="logo-circle">
              <span className="logo-fc">FC</span>
              <span className="logo-sub">ENGENHARIA</span>
            </div>
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
          </div>
        </div>
      </div>

      {/* ── TABELA EAP ── */}
      <table className="eap-table">
        <thead>
          <tr>
            <th className="col-item">Item</th>
            <th className="col-desc">Descrição</th>
            <th className="col-un">Un</th>
            <th className="col-qtd">Qtd</th>
            <th className="col-num">Preço Unit.<br/>Material</th>
            <th className="col-num">Preço Unit.<br/>MO</th>
            <th className="col-num">Preço Unit.<br/>Total</th>
            <th className="col-num">Preço Total<br/>Material</th>
            <th className="col-num">Preço Total<br/>MO</th>
            <th className="col-num">Custo Total</th>
            <th className="col-num">Venda Total<br/>(BDI {bdiPct.toFixed(2)}%)</th>
            <th className="col-abc">ABC</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it: any) => {
            const custoUnitTotal = n(it.custoUnitMat) + n(it.custoUnitMdo);
            const isN1 = it.nivel === 1;
            const isN2 = it.nivel === 2;
            const rowClass = isN1 ? "nivel-1" : isN2 ? "nivel-2" : it.nivel === 3 ? "nivel-3" : "";
            const showNum = it.tipo !== "grupo" || isN1;

            return (
              <tr key={it.id} className={rowClass}>
                <td className="col-item">{it.eapCodigo}</td>
                <td className="col-desc">
                  {padEap(it.eapCodigo)}{it.descricao}
                </td>
                <td className="col-un">{it.unidade}</td>
                <td className="col-qtd">{showNum && it.quantidade ? fNum(n(it.quantidade), 2) : ""}</td>
                <td className={`col-num val-mat`}>
                  {showNum && n(it.custoUnitMat) ? fBRL(n(it.custoUnitMat)) : ""}
                </td>
                <td className={`col-num val-mdo`}>
                  {showNum && n(it.custoUnitMdo) ? fBRL(n(it.custoUnitMdo)) : ""}
                </td>
                <td className={`col-num`}>
                  {showNum && custoUnitTotal ? fBRL(custoUnitTotal) : ""}
                </td>
                <td className={`col-num val-mat`}>
                  {n(it.custoTotalMat) ? fBRL(n(it.custoTotalMat)) : ""}
                </td>
                <td className={`col-num val-mdo`}>
                  {n(it.custoTotalMdo) ? fBRL(n(it.custoTotalMdo)) : ""}
                </td>
                <td className={`col-num val-tot`}>
                  {n(it.custoTotal) ? fBRL(n(it.custoTotal)) : ""}
                </td>
                <td className={`col-num val-vnd`}>
                  {n(it.vendaTotal) ? fBRL(n(it.vendaTotal)) : ""}
                </td>
                <td className="col-abc">{it.curvaAbc}</td>
              </tr>
            );
          })}

          {/* Linha de total */}
          <tr className="total-row">
            <td colSpan={9} style={{ textAlign: "right", paddingRight: 6 }}>TOTAL GERAL</td>
            <td className="col-num" style={{ textAlign: "right" }}>{fBRL(totalCusto)}</td>
            <td className="col-num" style={{ textAlign: "right" }}>{fBRL(totalVenda)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      {/* Rodapé */}
      <div style={{ marginTop: 6, fontSize: "6.5pt", color: "#666", borderTop: "0.5px solid #ccc", paddingTop: 3, display: "flex", justifyContent: "space-between" }}>
        <span>FC Engenharia e Consultoria Ltda — Orçamento {orc.codigo} {orc.revisao || ""}</span>
        <span>Impresso em {today}</span>
      </div>
    </>
  );
}
