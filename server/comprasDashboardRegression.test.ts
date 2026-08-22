import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const comprasSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/compras.ts"),
  "utf8",
);
const painelSource = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/pages/compras/Painel.tsx"),
  "utf8",
);

function procedureSource(name: string, nextName: string) {
  const start = comprasSource.indexOf(`${name}: protectedProcedure`);
  const end = comprasSource.indexOf(`${nextName}: protectedProcedure`, start);

  expect(start, `procedure ${name} não encontrada`).toBeGreaterThanOrEqual(0);
  expect(end, `procedure seguinte ${nextName} não encontrada`).toBeGreaterThan(start);
  return comprasSource.slice(start, end);
}

function querySource(name: string, nextName: string) {
  const start = painelSource.indexOf(`trpc.compras.${name}.useQuery`);
  const end = painelSource.indexOf(`trpc.compras.${nextName}.useQuery`, start);

  expect(start, `query ${name} não encontrada no Painel`).toBeGreaterThanOrEqual(0);
  expect(end, `query seguinte ${nextName} não encontrada no Painel`).toBeGreaterThan(start);
  return painelSource.slice(start, end);
}

function occurrences(source: string, fragment: string) {
  return source.split(fragment).length - 1;
}

describe("Painel de Compras — contrato contra cargas históricas", () => {
  const dashboard = procedureSource("getDashboardCompras", "getDashboardGerencial");
  const gerencial = procedureSource("getDashboardGerencial", "analisarEvolucaoCompras");
  const badges = procedureSource("getComprasBadgeCounts", "getAlertasCompras");
  const alertas = procedureSource("getAlertasCompras", "getDashboardPorObra");
  const porObra = procedureSource("getDashboardPorObra", "avaliarFornecedor");

  it.each([
    ["getDashboardCompras", dashboard],
    ["getDashboardGerencial", gerencial],
    ["getComprasBadgeCounts", badges],
    ["getAlertasCompras", alertas],
    ["getDashboardPorObra", porObra],
  ])("%s mantém o contrato multiempresa protegido", (_name, source) => {
    expect(source).toContain("companyIds: z.array(z.number()).min(1)");
    expect(source).toContain(
      "await Promise.all(ids.map(_cid => _assertCompanyAccess(ctx.user, _cid)))",
    );
  });

  it("mantém os totais do resumo em agregações exatas e limita as listas visíveis", () => {
    expect(dashboard).toContain("COUNT(*) FILTER");
    expect(dashboard).toContain("COALESCE(SUM(");
    expect(dashboard).toContain("COUNT(*)`.mapWith(Number)");
    expect(occurrences(dashboard, ".limit(8)")).toBe(5);
    expect(dashboard).toContain("alertasOCTotal: alertasOCCountRows[0]?.total ?? 0");
    expect(dashboard).toMatch(/ORDER BY 1 DESC\s+LIMIT 6/);
    expect(dashboard).toContain("GROUP BY co.obra_id");
  });

  it("calcula badges por COUNT no banco sem carregar linhas de histórico", () => {
    expect(badges).toContain("const badgeResult = await db.execute");
    expect(occurrences(badges, "SELECT COUNT(*)")).toBe(4);
    expect(badges).toContain("SELECT COUNT(DISTINCT sc.id)");
    expect(badges).toContain("SELECT LEAST(COUNT(*), 20)");
    expect(badges).not.toContain("db.select().from(");
  });

  it("preserva totais exatos dos alertas e limita somente suas listas de detalhe", () => {
    expect(alertas).toContain("quantidade: sql<number>`COUNT(*)`");
    expect(alertas).toContain("total: sql<number>`COALESCE(SUM(");
    expect(occurrences(alertas, ".limit(12)")).toBe(3);
    expect(occurrences(alertas, ".limit(10)")).toBe(3);
    expect(alertas).toContain(".limit(20)");
    expect(alertas).toContain("lt(purchaseAccountsPayable.dataVencimento, hoje)");
    expect(alertas).toContain("gte(purchaseAccountsPayable.dataVencimento, hoje)");
    expect(alertas).toContain("lt(comprasOrdens.dataEntregaPrevista, hoje)");
    expect(alertas).toContain("gte(comprasOrdens.dataEntregaPrevista, hoje)");

    expect(alertas).toContain("quantidadeVencidas: Number(pagSummary.vencidas ?? 0)");
    expect(alertas).toContain("quantidadeProximas: Number(pagSummary.proximas ?? 0)");
    expect(alertas).toContain("atrasadas: Number(ocsSummary.atrasadas ?? 0)");
    expect(alertas).toContain("proximas: Number(ocsSummary.proximas ?? 0)");
    expect(alertas).toContain("totalSemCobertura: Number(coberturaSummary.total ?? 0)");
    expect(alertas).toContain("listaAtrasadas: ocsAtrasadas.slice(0, 10)");
    expect(alertas).toContain("listaProximas: ocsProximas.slice(0, 10)");
    expect(alertas).toContain("scsSemCobertura: scsSemCobertura.slice(0, 10)");
  });

  it("agrega Por Obra no banco e devolve só seis meses e cinco fornecedores", () => {
    expect(porObra).toContain('SUM(CASE WHEN status <> \'cancelada\'');
    expect(porObra).toContain("COUNT(*) FILTER");
    expect(porObra).toContain(
      "ROW_NUMBER() OVER (PARTITION BY obra_id ORDER BY mes DESC)",
    );
    expect(porObra).toContain("WHERE rn <= 6");
    expect(porObra).toContain('ROW_NUMBER() OVER (PARTITION BY "obraId" ORDER BY "primeiraOcId")');
    expect(porObra).toContain("WHERE rn <= 5");
    expect(porObra).toContain("topFornPorObra[oid].length < 5");
    expect(porObra).not.toContain("db.select().from(comprasOrdens)");
    expect(porObra).not.toContain("db.select().from(comprasSolicitacoes)");
  });

  it("limita o Gerencial à janela necessária e recupera só vínculos usados no lead time", () => {
    expect(occurrences(gerencial, "gte(comprasSolicitacoes.criadoEm, loadFrom)")).toBe(1);
    expect(occurrences(gerencial, "gte(comprasCotacoes.criadoEm, loadFrom)")).toBe(1);
    expect(occurrences(gerencial, "gte(comprasOrdens.criadoEm, loadFrom)")).toBe(1);
    expect(gerencial).toContain("const referencedCotIds = Array.from(new Set(");
    expect(gerencial).toContain("ocsAll.map(o => o.cotacaoId)");
    expect(gerencial).toContain("inArray(comprasCotacoes.id, chunk)");
    expect(gerencial).toContain("const referencedScIds = Array.from(new Set(");
    expect(gerencial).toContain("inArray(comprasSolicitacoes.id, chunk)");
    expect(occurrences(gerencial, "i += 500")).toBeGreaterThanOrEqual(2);

    expect(gerencial).toContain("const scById = new Map(scsAll.map");
    expect(gerencial).toContain("const cotById = new Map(cotsAll.map");
    expect(gerencial).toContain("const sc = scById.get(cot.solicitacaoId)");
  });
});

describe("Painel de Compras — consultas sob demanda por aba", () => {
  const alertasQuery = querySource("getAlertasCompras", "getDashboardPorObra");
  const porObraQuery = painelSource.slice(
    painelSource.indexOf("trpc.compras.getDashboardPorObra.useQuery"),
    painelSource.indexOf("const totalAlertas"),
  );

  it("não consulta Alertas antes de abrir a aba Alertas", () => {
    expect(alertasQuery).toContain(
      'enabled: companyIds.length > 0 && abaAtiva === "alertas"',
    );
    expect(alertasQuery).toContain(
      'refetchInterval: abaAtiva === "alertas" ? 5 * 60_000 : false',
    );
  });

  it("não consulta Por Obra antes de abrir a aba Por Obra", () => {
    expect(porObraQuery).toContain(
      'enabled: companyIds.length > 0 && abaAtiva === "por_obra"',
    );
    expect(porObraQuery).toContain(
      'refetchInterval: abaAtiva === "por_obra" ? 5 * 60_000 : false',
    );
  });
});