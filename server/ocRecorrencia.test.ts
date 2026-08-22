import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";

// O transformador SSR do Vitest 2.1.9 deste projeto quebra imports diretos de
// alguns módulos compartilhados. Compilar o arquivo puro para CJS aqui testa o
// código real sem copiar a implementação para o teste.
const source = fs.readFileSync(path.resolve(process.cwd(), "shared/ocRecorrencia.ts"), "utf8");
const compiled = transformSync(source, { loader: "ts", format: "cjs", target: "node20" }).code;
const loaded: { exports: Record<string, any> } = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const {
  dataIsoReal,
  gerarVencimentosRecorrenciaMensal,
  planejarLimpezaReedicaoRecorrencia,
  planejarReconciliacaoRecorrencia,
} = loaded.exports;

describe("OC recorrente — calendário mensal", () => {
  it("mantém o dia inicial e ajusta meses curtos", () => {
    expect(gerarVencimentosRecorrenciaMensal("2026-01-31", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("só inclui vencimentos efetivamente dentro do período", () => {
    expect(gerarVencimentosRecorrenciaMensal("2026-01-31", "2026-02-01")).toEqual([
      "2026-01-31",
    ]);
  });

  it("rejeita datas normalizadas pelo Date mas inexistentes no calendário", () => {
    expect(dataIsoReal("2026-02-31")).toBe(false);
    expect(dataIsoReal("2024-02-29")).toBe(true);
  });
});

describe("OC recorrente — reconciliação financeira", () => {
  it("remove projeções abertas que saíram do período e reaproveita as retidas", () => {
    const plano = planejarReconciliacaoRecorrencia(
      ["2026-02-28", "2026-03-31"],
      [
        { id: 1, status: "previsto", dataVencimento: "2026-01-31" },
        { id: 2, status: "previsto", dataVencimento: "2026-02-28" },
        { id: 3, status: "previsto", dataVencimento: "2026-03-31" },
        { id: 4, status: "previsto", dataVencimento: "2026-04-30" },
      ],
    );
    expect(plano.competencias.map(c => c.existenteId)).toEqual([2, 3]);
    expect(plano.removerIds).toEqual([1, 4]);
  });

  it("preserva pagamento e baixa ativa mesmo fora do novo período", () => {
    const plano = planejarReconciliacaoRecorrencia(
      ["2026-03-31"],
      [
        { id: 10, status: "pago", dataVencimento: "2026-01-31" },
        { id: 11, status: "a_pagar", dataVencimento: "2026-02-28", temBaixaAtiva: true },
        { id: 12, status: "a_pagar", dataVencimento: "2026-03-31" },
        { id: 13, status: "a_pagar", dataVencimento: "2026-04-30" },
      ],
    );
    expect(plano.competencias[0].existenteId).toBe(12);
    expect(plano.removerIds).toEqual([13]);
  });

  it("não recria automaticamente uma competência cancelada", () => {
    const plano = planejarReconciliacaoRecorrencia(
      ["2026-02-28"],
      [{ id: 20, status: "cancelado", dataVencimento: "2026-02-28" }],
    );
    expect(plano.competencias[0]).toMatchObject({
      existenteId: 20,
      cancelado: true,
    });
    expect(plano.removerIds).toEqual([]);
  });

  it("ao reeditar remove só projeções abertas e identifica títulos protegidos", () => {
    const plano = planejarLimpezaReedicaoRecorrencia([
      { id: 30, status: "previsto", dataVencimento: "2026-01-31" },
      { id: 31, status: "pago", dataVencimento: "2026-02-28" },
      { id: 32, status: "a_pagar", dataVencimento: "2026-03-31", temBaixaAtiva: true },
      { id: 33, status: "cancelado", dataVencimento: "2026-04-30" },
    ]);
    expect(plano.removerIds).toEqual([30]);
    expect(plano.protegidosIds).toEqual([31, 32]);
  });
});