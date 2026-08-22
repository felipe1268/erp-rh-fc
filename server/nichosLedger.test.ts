// Rev. — Contagem de nichos (Mapa de Vãos) — guardas do ledger pago-1x.
// Vãos (porta/janela) e nichos compartilham o ledger requadro_* dos pins;
// estes testes garantem que a LIBERAÇÃO de carimbos de um contorno nunca
// cruza o tipo de pin (senão um nicho pago poderia ser recontado — dupla
// cobrança) e que os dois modos não se misturam.
import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

const src = fs.readFileSync(path.resolve(__dirname, "./routers/medicaoCriterios.ts"), "utf-8");

describe("Nichos — ledger pago-1x (anti-duplicidade cruzada com vãos)", () => {
  it("define predicados de tipo de pin para as liberações do ledger", () => {
    expect(src).toContain("const soPinsVao = sql`");
    expect(src).toContain("const soPinsNicho = sql`");
    expect(src).toContain("NOT IN (SELECT id FROM obra_esquadria_tipologias WHERE tipo = 'nicho')");
    expect(src).toContain("IN (SELECT id FROM obra_esquadria_tipologias WHERE tipo = 'nicho')");
  });

  it("TODA liberação de carimbo por contorno é restrita ao tipo de pin do modo", () => {
    // Cada UPDATE que solta carimbos por requadroPagoContornoId deve carregar
    // soPinsVao ou soPinsNicho — nenhum solto sem predicado de tipo.
    const releases = src.split("\n").filter(l => l.includes("requadroPagoContornoId, cont.id"));
    expect(releases.length).toBeGreaterThanOrEqual(4);
    for (const l of releases) {
      expect(/soPinsVao|soPinsNicho/.test(l), `liberação sem predicado de tipo: ${l.trim()}`).toBe(true);
    }
    // 2 liberações de cada modo (aplicar re-aplicando + remover)
    expect(releases.filter(l => l.includes("soPinsVao")).length).toBe(2);
    expect(releases.filter(l => l.includes("soPinsNicho")).length).toBe(2);
  });

  it("aplicarVaosContorno rejeita pins de nicho na seleção", () => {
    expect(src).toContain('r.tipTipo === "nicho"');
    expect(src).toContain("Pins de nicho não entram no desconto de vãos");
  });

  it("aplicarNichosContorno rejeita pins que não sejam nicho e exige contorno de contagem", () => {
    expect(src).toContain('r.tipTipo !== "nicho"');
    expect(src).toContain("Somente pins de NICHO entram na contagem");
    expect(src).toContain('cont.tipo !== "contagem"');
  });

  it("os dois modos não se sobrescrevem no mesmo contorno (vaosJson.modo)", () => {
    // Reaplicar vãos sobre contagem de nichos (e vice-versa) deve falhar antes de liberar carimbos.
    expect(src).toContain("Este contorno tem contagem de nichos aplicada — remova-a antes de descontar vãos.");
    expect(src).toContain("Este contorno tem desconto de vãos aplicado — remova-o antes de contar nichos.");
  });

  it("carimbo do nicho é atômico (WHERE requadro_pago_em IS NULL)", () => {
    // O carimbo condicional é a garantia pago-1x — deve existir nos dois motores.
    const stamps = src.split("isNull(obraEsquadrias.requadroPagoEm)").length - 1;
    expect(stamps).toBeGreaterThanOrEqual(2);
  });

  it("remover contagem de nichos restaura a quantidade original", () => {
    expect(src).toContain("quantidadeRestaurada");
    expect(src).toContain('prevJson?.modo === "nichos"');
  });
});
