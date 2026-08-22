import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

describe("Gestão Interna — escopo sem obra ativa", () => {
  it("restringe o endpoint ao Admin Master e usa allowlist de obra em andamento", () => {
    const source = readFileSync(
      new URL("./routers/gestaoInterna.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('ctx.user.role !== "admin_master"');
    expect(source).toContain("= 'em_andamento'");
    expect(source).not.toContain("LOWER(COALESCE(status, '')) NOT IN");
  });

  it("mantém rota, menu e paleta da central alinhados ao modo TV", () => {
    const appSource = readFileSync(
      new URL("../client/src/App.tsx", import.meta.url),
      "utf8",
    );
    const layoutSource = readFileSync(
      new URL("../client/src/components/DashboardLayout.tsx", import.meta.url),
      "utf8",
    );
    const pageSource = readFileSync(
      new URL("../client/src/pages/gestao-interna/GestaoInterna.tsx", import.meta.url),
      "utf8",
    );

    expect(appSource).toContain('<AdminMasterRouteGuard component={GestaoInterna} />');
    expect(layoutSource).toContain('path: "/gestao-interna", adminMasterOnly: true');
    expect(pageSource).not.toMatch(/green|lime|teal|#0b6864|#b8d36b/i);
    expect(pageSource).not.toContain("âmbar = previsto");
    expect(pageSource).toContain('{ name: "Hoje", data: data.producao.hoje }');
  });

  it("encerra a execução antes de qualquer bloco de agregação", () => {
    const source = readFileSync(
      new URL("./routers/gestaoInterna.ts", import.meta.url),
      "utf8",
    );
    const guardAt = source.indexOf("if (obraIds.length === 0)");
    const returnAt = source.indexOf(
      "return emptyGestaoInternaDashboard(period)",
      guardAt,
    );
    const firstAggregateAt = source.indexOf("// ── Headline", guardAt);

    expect(guardAt).toBeGreaterThan(-1);
    expect(returnAt).toBeGreaterThan(guardAt);
    expect(firstAggregateAt).toBeGreaterThan(returnAt);
  });

  it("produz somente zeros quando não há obra ativa autorizada", () => {
    const script = `
      import { emptyGestaoInternaDashboard } from "./server/routers/gestaoInternaEmpty.ts";
      const data = emptyGestaoInternaDashboard({
        today: "2026-08-19",
        weekStart: "2026-08-17",
        weekEnd: "2026-08-19",
        previousWeekStart: "2026-08-10",
        previousWeekEnd: "2026-08-16",
        monthStart: "2026-08-01",
      });
      console.log(JSON.stringify(data));
    `;
    const data = JSON.parse(
      execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
        cwd: process.cwd(),
        encoding: "utf8",
      }),
    );

    expect(data.obras).toEqual([]);
    expect(data.radar).toEqual([]);
    expect(data.headline).toMatchObject({
      obrasAtivas: 0,
      colaboradoresAtivos: 0,
      comprasPendentes: 0,
      entregasAtrasadas: 0,
    });
    expect(data.pessoas.semana).toEqual({
      faltas: 0,
      atestados: 0,
      advertencias: 0,
      acidentes: 0,
      acidentesGraves: 0,
      admissoes: 0,
      demissoes: 0,
      movimentacoes: 0,
    });
    expect(data.producao.semanaAtual.total).toBe(0);
    expect(data.producao.hoje).toEqual({
      total: 0,
      validados: 0,
      pendentes: 0,
      glosados: 0,
    });
    expect(data.planejamento.obrasComPlanejamento).toBe(0);
    expect(data.compras).toMatchObject({
      solicitacoesAbertas: 0,
      cotacoesAbertas: 0,
      ordensAbertas: 0,
      entregasAtrasadas: 0,
      leadTime: { amostra: 0 },
    });
  });
});