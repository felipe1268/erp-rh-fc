import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Fluxo de Caixa não trata crédito do extrato como faturamento", () => {
  const server = fs.readFileSync("server/routers/financial.ts", "utf8");
  const client = fs.readFileSync("client/src/pages/financeiro/FinanceiroFluxoCaixa.tsx", "utf8");

  it("identifica no servidor títulos copiados do extrato e sem NFS-e", () => {
    expect(server).toContain('AS "receitaExtratoSemFatura"');
    expect(server).toContain("bsl.entry_id = financial_entries.id");
    expect(server).toContain("bsl.excluido_em IS NULL");
    expect(server).toContain("bsl.desconsiderado_em IS NULL");
    expect(server).toContain("nfv.entry_id = financial_entries.id");
  });

  it("mantém esses créditos nas movimentações bancárias, não no faturamento", () => {
    expect(server).toMatch(
      /e\.tipo = 'receita'[\s\S]*e\.origem_modulo = 'manual_receber'[\s\S]*financial_nfse_vinculos/,
    );
    expect(server).toContain("AND e.company_id = l.company_id");
    expect(client).toContain("if (c.receitaExtratoSemFatura) continue;");
  });
});