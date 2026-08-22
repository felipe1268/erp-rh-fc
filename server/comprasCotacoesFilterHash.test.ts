import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Task #195 — trava o contrato de privacidade da instrumentação de caminho
// lento da lista de Cotações + a forma das respostas dos 3 endpoints.
// Segue o padrão de comprasDashboardRegression.test.ts (varredura de fonte),
// porque importar server/routers/compras.ts direto no vitest quebra por SSR.
const comprasSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/compras.ts"),
  "utf8",
);
const cotacoesPageSource = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/pages/compras/Cotacoes.tsx"),
  "utf8",
);

function procedureBody(name: string): string {
  const marker = `${name}: protectedProcedure`;
  const start = comprasSource.indexOf(marker);
  if (start === -1) throw new Error(`procedure ${name} não encontrada`);
  // até a próxima "<algo>: protectedProcedure" (pula a marca da própria proc) ou fim
  const rest = comprasSource.slice(start + marker.length);
  const nextIdx = rest.indexOf(": protectedProcedure");
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

describe("instrumentação de caminho lento (privacidade)", () => {
  it("só loga quando lento (limiar) e nunca o termo de busca em claro", () => {
    // o helper de hash usa hasSearch (bool), nunca o texto digitado
    const hashFn = comprasSource.slice(
      comprasSource.indexOf("function hashCotacoesFiltros"),
      comprasSource.indexOf("function logCotacoesSlow"),
    );
    expect(hashFn).toContain("hasSearch");
    // o texto da busca não pode ir cru pro shape do hash
    expect(hashFn).not.toMatch(/search:\s*input\.search[^?]/);
    // log só dispara acima do limiar
    const logFn = comprasSource.slice(comprasSource.indexOf("function logCotacoesSlow"));
    expect(logFn.slice(0, 400)).toContain("if (totalMs < COTACOES_SLOW_MS) return");
  });
});

describe("listarCotacoes — caminho crítico enxuto", () => {
  const body = procedureBody("listarCotacoes");
  it("devolve hasMore/page/pageSize/serverMs/timings, sem totais/contagens/enriquecimento", () => {
    expect(body).toContain("hasMore");
    expect(body).toContain("timings");
    expect(body).toContain("input.pageSize + 1"); // hasMore sem count(*)
    // totais/contagens/a-entregar saíram do caminho crítico
    expect(body).not.toContain("statusCountsPromise");
    expect(body).not.toContain("aEntregarPromise");
    expect(body).not.toContain("todosStatus");
    // enriquecimento (melhor preço/meta) saiu do caminho crítico
    expect(body).not.toContain("melhorPorCot");
    expect(body).not.toContain("metaTotal:");
  });
  it("preserva campos da tabela e ordenação/autorização sem probes de entrega por linha", () => {
    expect(body).toContain("numeroCotacao");
    expect(body).toContain("obraNome");
    expect(body).toContain("fornecedorNome");
    expect(body).toContain("orderBy(...orderExpressions)");
    expect(body).toContain("getEffectiveAllowedObraIds");
    // Só o filtro explícito "a_entregar" conserva o EXISTS; a resposta da página
    // não faz três probes de OC/entrega por linha.
    expect(body).not.toContain("temOc:");
    expect(body).not.toContain("entregaPendente:");
    expect(body).not.toContain("entregaAtrasada:");
  });
});

describe("resumoCotacoes — totais e contagens globais", () => {
  const body = procedureBody("resumoCotacoes");
  it("mesma autorização e retorna total exato + contagens", () => {
    expect(body).toContain("_assertCompanyAccess");
    expect(body).toContain("getEffectiveAllowedObraIds");
    expect(body).toContain("count(*)::int");
    expect(body).toContain("porStatus");
    expect(body).toContain("aEntregar");
    expect(body).toContain("porTipo");
    expect(body).toContain("todosStatus");
  });
});

describe("enriquecerCotacoesLista — só linhas visíveis autorizadas", () => {
  const body = procedureBody("enriquecerCotacoesLista");
  it("cap 100 e deriva IDs permitidos no servidor (não confia nos recebidos)", () => {
    expect(body).toContain("max(100)");
    // reintersecta company + obras permitidas antes de ler dados sensíveis
    expect(body).toContain("getEffectiveAllowedObraIds");
    expect(body).toContain("permittedIds");
    expect(body).toContain("inArray(comprasCotacoes.id, uniqueIds)");
    // usa os IDs PERMITIDOS (não os recebidos) para buscar fornecedores/itens
    expect(body).toContain("inArray(comprasCotacaoFornecedores.cotacaoId, permittedIds)");
    expect(body).toContain("inArray(comprasCotacoesItens.cotacaoId, permittedIds)");
  });
  it("retorna items chaveado por id com metaTotal/melhorPreco", () => {
    expect(body).toContain("items: itemsOut");
    expect(body).toContain("metaTotal:");
    expect(body).toContain("melhorPreco:");
  });
});

describe("tela de Cotações — consistência após alterações", () => {
  it("atualiza o resumo e o enriquecimento quando a mesma página muda", () => {
    expect(cotacoesPageSource).toContain("const refetchListaDerivados");
    expect(cotacoesPageSource).toContain("refetchEnriquecimento();");
    for (const mutation of ["cancelarAprovacao", "reverterOS"]) {
      const start = cotacoesPageSource.indexOf(`const ${mutation} =`);
      expect(start, `${mutation} precisa existir`).toBeGreaterThan(-1);
      const body = cotacoesPageSource.slice(start, start + 1000);
      expect(body, `${mutation} precisa atualizar derivados`).toContain("refetchListaDerivados();");
    }
  });
});
