import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const result = JSON.parse(execFileSync(
  "./node_modules/.bin/tsx",
  [
    "-e",
    `
      import {
        filtrarLinhasAnaliseCustos as filtrar,
        normalizarBuscaAnaliseCustos as normalizar,
      } from "./shared/analiseCustosBusca.ts";

      const acentuado = [{ id: 1, fornecedorNome: "Depósito São José" }];
      const oc = { id: 2, descricao: "Compra de materiais", numeroOc: "OC-2026-1147" };
      const areia = { id: 10, descricao: "Areia", obraNome: "Obra Centro" };
      const cimento = { id: 11, descricao: "Cimento", obraNome: "Obra Norte" };
      const grupo = {
        id: "grp:fornecedor",
        agrupado: true,
        fornecedorNome: "Fornecedor A",
        itens: [areia, cimento],
      };

      console.log(JSON.stringify({
        acentoIds: filtrar(acentuado, "deposito sao jose").map((r) => r.id),
        ocIds: filtrar([oc], "oc-2026-1147").map((r) => r.id),
        grupoIds: filtrar([grupo], "obra norte").map((r) => r.id),
        vazioIds: filtrar([grupo], "  ").map((r) => r.id),
        normalizado: normalizar("Mão de Obra"),
      }));
    `,
  ],
  { cwd: process.cwd(), encoding: "utf8" },
));

describe("busca da Análise de Custos", () => {
  it("ignora acentos e diferenças entre maiúsculas e minúsculas", () => {
    expect(result.acentoIds).toEqual([1]);
  });

  it("encontra número estruturado da OC mesmo sem ele na descrição", () => {
    expect(result.ocIds).toEqual([2]);
  });

  it("expande um fechamento agrupado e retorna apenas o título correspondente", () => {
    expect(result.grupoIds).toEqual([11]);
  });

  it("mantém os grupos intactos quando a busca está vazia", () => {
    expect(result.vazioIds).toEqual(["grp:fornecedor"]);
    expect(result.normalizado).toBe("mao de obra");
  });
});