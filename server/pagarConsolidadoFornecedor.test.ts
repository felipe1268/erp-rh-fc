import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const clientSource = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/pages/financeiro/PagarConsolidadoDialog.tsx"),
  "utf8",
);
const serverSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/financial.ts"),
  "utf8",
);
const chequesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/cheques.ts"),
  "utf8",
);

const initEffectStart = clientSource.indexOf("useEffect(() => {\n    if (!open || !group) return;");
const initEffect = clientSource.slice(
  initEffectStart,
  clientSource.indexOf("useEffect(() => {", initEffectStart + 1),
);
const procedure = serverSource.slice(
  serverSource.indexOf("pagarConsolidadoFornecedor:"),
  serverSource.indexOf("// Rev. 4088", serverSource.indexOf("pagarConsolidadoFornecedor:")),
);
const conciliarLancamento = serverSource.slice(
  serverSource.indexOf("conciliarLancamento:"),
  serverSource.indexOf("conciliarGrupoLancamentos:", serverSource.indexOf("conciliarLancamento:")),
);
const conciliarGrupo = serverSource.slice(
  serverSource.indexOf("conciliarGrupoLancamentos:"),
  serverSource.indexOf("conciliarSugestoes:", serverSource.indexOf("conciliarGrupoLancamentos:")),
);
const conciliarSugestoes = serverSource.slice(
  serverSource.indexOf("conciliarSugestoes:"),
  serverSource.indexOf("conciliarSemContaComExtrato:", serverSource.indexOf("conciliarSugestoes:")),
);
const cancelarFechamento = serverSource.slice(
  serverSource.indexOf("cancelarFechamento:"),
  serverSource.indexOf("estornarFechamentoPago:", serverSource.indexOf("cancelarFechamento:")),
);
const estornarFechamentoPago = serverSource.slice(
  serverSource.indexOf("estornarFechamentoPago:"),
  serverSource.indexOf("estornarBaixaItem:", serverSource.indexOf("estornarFechamentoPago:")),
);
const conciliarChequeComLinha = serverSource.slice(
  serverSource.indexOf("conciliarChequeComLinha:"),
  serverSource.indexOf("conciliarGrupoLancamentos:", serverSource.indexOf("conciliarChequeComLinha:")),
);

describe("Pagamento consolidado por fornecedor", () => {
  it("abre sem selecionar OCs automaticamente", () => {
    expect(initEffect).toContain("setSelected(persistent");
    expect(initEffect).toContain(": []);");
    expect(initEffect).toContain("setChequesTerceiroSel([])");
  });

  it("envia somente as OCs escolhidas e identifica o fechamento", () => {
    expect(clientSource).toContain("itensIds: exactIds");
    expect(clientSource).toContain("grupoId: String(group.id)");
    expect(clientSource).toContain("disabled={busy || !exactIds.length}");
  });

  it("revalida fornecedor, janela e status sob lock antes de baixar", () => {
    expect(procedure).toContain("janelaAtual !== lockedFechamento.janela");
    expect(procedure).toContain("mudou de fornecedor");
    expect(procedure).toContain("await _lockEntryBaixas(tx, input.companyId, id)");
    expect(procedure).toContain("FOR UPDATE OF e");
    expect(procedure).toContain("lockedEntries.some");
    expect(procedure).toContain("valoresEsperadosCentavos.get(Number(e.id))");
    expect(procedure).toContain("Number(e.conciliado) === 1");
    expect(procedure).toContain("mudou de situação");
  });

  it("permite escolher de um a cento e vinte cheques", () => {
    expect(clientSource).toContain("Quantidade de cheques");
    expect(clientSource).toContain("max={120}");
    expect(procedure).toContain(")).min(1).max(120).optional()");
  });

  it("impede conciliar isoladamente uma OC que pertence a fechamento pago", () => {
    expect(serverSource).toContain("async function _assertNotInPaidSupplierClosing");
    expect(conciliarLancamento).toContain("FOR UPDATE");
    expect(conciliarLancamento).toContain("await _assertNotInPaidSupplierClosing(tx");
    expect(conciliarGrupo).toContain("lockedGenericEntries");
    expect(conciliarGrupo).toContain("await _assertNotInPaidSupplierClosing(tx");
    expect(conciliarSugestoes).toContain("fp.estornado_em IS NULL");
    expect(procedure).toContain("Number(e.conciliado) === 1");
  });

  it("valida todos os cheques de terceiro e o total antes de alocar", () => {
    expect(procedure).toContain("new Set((input.chequesTerceiroIds ?? []).map(Number))");
    expect(procedure).toContain("status='disponivel' AND excluido_em IS NULL");
    expect(procedure).toContain("FOR UPDATE");
    expect(procedure).toContain("chequesDisponiveis.length !== chequesTerceiroIds.length");
    expect(procedure).toContain("Math.abs(totalChequesTerceiro - totalGrupoCentavos) > 5");
    expect(procedure).toContain("RETURNING id");
    expect(procedure).toContain("chequesAlocados !== chequesTerceiroIds.length");
  });

  it("faz as baixas somarem o total do boleto com ajustes", () => {
    expect(procedure).toContain("distribuirTotalFechamentoCentavos");
    expect(procedure).toContain("totalBaixasCentavos !== Math.round(totalGrupo * 100)");
    expect(procedure).toContain("descontoRateado");
    expect(procedure).toContain("acrescimoRateado");
    expect(procedure).toContain("fechamento_fornecedor_pagamentos");
  });

  it("serializa cancelamento contra pagamento antes de liberar os itens", () => {
    expect(cancelarFechamento).toContain("FOR UPDATE");
    expect(cancelarFechamento).toContain("status IN ('rascunho','conferido')");
    expect(cancelarFechamento).toContain("RETURNING id");
    expect(cancelarFechamento.indexOf("UPDATE fechamento_fornecedor\n")).toBeLessThan(
      cancelarFechamento.indexOf("UPDATE fechamento_fornecedor_itens"),
    );
  });

  it("persiste os lotes de cheque junto dos vínculos de pagamento", () => {
    expect(procedure).toContain("cheque_proprio_lote_id");
    expect(procedure).toContain("cheque_terceiro_grupo_id");
    expect(procedure).toContain("const loteId = chequeProprioLoteId!");
    expect(procedure).toContain("const pagamentoGrupoId = chequeTerceiroGrupoId!");
  });

  it("estorno cancela cheques próprios e libera cheques de terceiro sob lock", () => {
    expect(estornarFechamentoPago).toContain("FROM financial_cheques");
    expect(estornarFechamentoPago).toContain("FROM financial_cheques_recebidos");
    expect(estornarFechamentoPago).toContain("FOR UPDATE");
    expect(estornarFechamentoPago).toContain("SET status='cancelado'");
    expect(estornarFechamentoPago).toContain("SET status='disponivel'");
    expect(estornarFechamentoPago).toContain("pagamento_grupo_id=NULL");
    expect(estornarFechamentoPago).toContain("compensado_em IS NULL");
    expect(estornarFechamentoPago.indexOf("SET status='cancelado'")).toBeLessThan(
      estornarFechamentoPago.indexOf("Soft-estorna cada baixa vinculada"),
    );
    expect(estornarFechamentoPago.indexOf("SET status='disponivel'")).toBeLessThan(
      estornarFechamentoPago.indexOf("Soft-estorna cada baixa vinculada"),
    );
  });

  it("nenhuma compensação consegue reaproveitar cheque cancelado pelo estorno", () => {
    expect(conciliarChequeComLinha).toContain(
      "status='pendente' AND COALESCE(conciliado,0)=0 AND lancamento_id IS NULL",
    );
    expect(conciliarLancamento).toContain("status='pendente' AND COALESCE(conciliado,0)=0");
    expect(chequesSource).toContain("AND f.status='compensado' AND COALESCE(f.conciliado,0)<>1");
    expect(chequesSource).toContain(
      "AND f.status='pendente' AND COALESCE(f.conciliado,0)=0 AND f.excluido_em IS NULL",
    );
  });
});