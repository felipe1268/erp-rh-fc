import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const script = `
  import {
    aggregatePurchaseHistory,
    calculateBudgetDeficit,
    purchaseBudgetKey,
  } from "./server/purchaseBudgetSummary.ts";

  const row = (overrides = {}) => ({
    ocItemId: 1,
    ocId: 10,
    ocNumero: "OC-10",
    ocStatus: "aprovada",
    cotacaoId: 20,
    scId: 30,
    scNumero: "SC-30",
    scStatus: "aprovada",
    scItemId: 40,
    orcamentoItemId: 50,
    insumoCodigo: "MAT-01",
    quantidade: "4",
    valor: "300.00",
    quantidadeSolicitada: "10",
    quantidadeAtendida: "4",
    statusItem: "parcial",
    ...overrides,
  });

  const key = purchaseBudgetKey({ orcamentoItemId: 50, insumoCodigo: "MAT-01" });
  const multiple = aggregatePurchaseHistory([
    row(),
    row({
      ocItemId: 2,
      ocId: 11,
      ocNumero: "OC-11",
      quantidade: "6",
      valor: "450.00",
      quantidadeAtendida: "10",
      statusItem: "atendido_total",
    }),
  ]).get(key);
  const duplicated = aggregatePurchaseHistory([row(), row()]).get(key);

  console.log(JSON.stringify({
    quantityOnly: calculateBudgetDeficit({
      metaOriginal: 817.51,
      comprasAnteriores: 0,
      cotacaoAtual: 513.61,
    }),
    realDeficit: calculateBudgetDeficit({
      metaOriginal: 817.51,
      comprasAnteriores: 500,
      cotacaoAtual: 400,
    }),
    multiple,
    duplicated,
    invalidStatuses: ["cancelada", "recusada", "devolvida", "estornada"].map(
      (ocStatus) => aggregatePurchaseHistory([row({ ocStatus })]).size,
    ),
    cancelledSc: aggregatePurchaseHistory([row({ scStatus: "cancelada" })], 99).size,
    ownQuotation: aggregatePurchaseHistory([row({ cotacaoId: 99 })], 99).size,
  }));
`;

const result = JSON.parse(
  execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  }),
);

describe("resumo financeiro de compras anteriores", () => {
  it("não transforma excesso de quantidade em déficit quando o valor cabe na meta", () => {
    expect(result.quantityOnly).toEqual({ saldo: 303.9, deficit: 0 });
  });

  it("calcula apenas o déficit financeiro real", () => {
    expect(result.realDeficit).toEqual({ saldo: -82.49, deficit: 82.49 });
  });

  it("agrega múltiplas OCs e identifica compra parcial e total", () => {
    expect(result.multiple).toMatchObject({ quantidade: 10, valor: 750 });
    expect(result.multiple.referencias.map((ref: any) => ref.atendimento))
      .toEqual(["parcial", "total"]);
  });

  it("não duplica o mesmo item de OC repetido por join", () => {
    expect(result.duplicated).toMatchObject({ quantidade: 4, valor: 300 });
  });

  it("ignora cancelamentos, recusas, devoluções, estornos e a própria cotação", () => {
    expect(result.invalidStatuses).toEqual([0, 0, 0, 0]);
    expect(result.cancelledSc).toBe(0);
    expect(result.ownQuotation).toBe(0);
  });
});