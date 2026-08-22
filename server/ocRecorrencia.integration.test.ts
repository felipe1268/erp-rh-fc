import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Teste de integração CONCORRENTE da OC recorrente (aprovação/entrega ×
// cancelamento e edição × aprovação) contra um PostgreSQL 16 DESCARTÁVEL.
//
// O cenário roda em processo filho via tsx (o mesmo loader do servidor de
// produção) porque o transformador SSR do Vitest 2.1.9 deste projeto não
// carrega drizzle/schema.ts diretamente (Vite 7 — mesmo motivo do workaround
// esbuild em server/ocRecorrencia.test.ts). O runner sobe o banco temporário
// em socket Unix, executa as mutações reais do router de Compras em paralelo
// (sem mock nenhum — inclusive o getDb() de produção) e reporta JSON.
// Nenhum dado real do Neon é lido ou escrito.
describe("OC recorrente — concorrência aprovação/entrega/edição × cancelamento", () => {
  it("estado terminal sempre vence e total da OC nunca diverge dos títulos", () => {
    const runner = path.resolve(process.cwd(), "server/ocRecorrencia.integration.runner.ts");
    expect(fs.existsSync(runner)).toBe(true);

    const proc = spawnSync("npx", ["tsx", runner], {
      encoding: "utf8",
      timeout: 240_000,
      env: { ...process.env, NODE_ENV: "test" },
    });

    const stdout = proc.stdout ?? "";
    const stderr = proc.stderr ?? "";
    const jsonLine = stdout.split("\n").reverse().find(line => line.trim().startsWith("{"));
    const relatorio = jsonLine ? JSON.parse(jsonLine) : null;

    if (proc.status !== 0 || !relatorio || relatorio.falhas > 0) {
      const falhas = relatorio?.resultados?.filter((r: any) => !r.ok) ?? [];
      throw new Error(
        `Runner de concorrência falhou (exit=${proc.status}).\n` +
        `Falhas: ${JSON.stringify(falhas, null, 2)}\n` +
        `stderr (final): ${stderr.slice(-2000)}`,
      );
    }

    expect(relatorio.falhas).toBe(0);
    expect(relatorio.total).toBeGreaterThanOrEqual(15);
  }, 300_000);
});
