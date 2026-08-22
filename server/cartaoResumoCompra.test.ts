import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/cartao.ts"), "utf8");
const resumo = source.slice(source.indexOf("resumoParaCompra:"), source.indexOf("// ── Faturas"));

describe("Resumo de cartões para Compras", () => {
  it("inclui cartões ativos de todos os escopos cadastrados na empresa", () => {
    expect(resumo).toContain("WHERE c.company_id=$1 AND c.excluido_em IS NULL AND c.ativo=1");
    expect(resumo).not.toContain("COALESCE(c.escopo, 'fc') = 'fc'");
  });

  it("continua excluindo cartões cancelados, inativos ou removidos", () => {
    expect(resumo).toContain("c.excluido_em IS NULL");
    expect(resumo).toContain("c.ativo=1");
    expect(resumo).toContain("COALESCE(c.status, 'ativo') = 'ativo'");
  });
});