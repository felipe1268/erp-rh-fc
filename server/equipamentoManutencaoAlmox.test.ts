import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/equipamentos.ts"),
  "utf8",
);
const syncSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/lib/almoxEquipamentoSync.ts"),
  "utf8",
);

const atualizar = routerSource.slice(
  routerSource.indexOf("proprioAtualizar:"),
  routerSource.indexOf("// Rev. 2511", routerSource.indexOf("proprioAtualizar:")),
);

describe("Equipamento próprio em manutenção", () => {
  it("preserva a obra e o ID do item, mas o torna indisponível", () => {
    expect(atualizar).not.toContain('statusFinal !== "em_obra" && statusFinal !== "manutencao"');
    expect(atualizar).toContain('if (obraFinal && statusFinal !== "manutencao" && statusFinal !== "baixado")');
    expect(atualizar).toContain("disableAlmoxItemForEquipamento(tx");
    expect(atualizar).toContain("failOnError: true");
  });

  it("sincroniza equipamento e almoxarifado na mesma transação", () => {
    expect(atualizar).toContain("db.transaction(async (tx: any)");
    expect(atualizar).toContain("tx.update(equipamentosProprios)");
    expect(atualizar).toContain("ensureAlmoxItemForEquipamento(tx");
  });

  it("backfill e limpeza mantêm disponível apenas equipamento em obra", () => {
    expect(syncSource).toContain("COALESCE(ep.status, 'disponivel') NOT IN ('manutencao', 'baixado')");
    expect(syncSource).toContain("ep.localizacao_atual_obra_id IS NULL");
    expect(syncSource).toContain("COALESCE(ep.status, 'disponivel') IN ('manutencao', 'baixado')");
    expect(syncSource).toContain("SET ativo = false");
    expect(syncSource).toContain("quantidade_atual = 0");
  });

  it("serializa a criação antes de consultar o vínculo existente", () => {
    const ensure = syncSource.slice(
      syncSource.indexOf("export async function ensureAlmoxItemForEquipamento"),
      syncSource.indexOf("export async function backfillAlmoxFromEquipamentos"),
    );
    expect(ensure.indexOf("pg_advisory_xact_lock")).toBeLessThan(ensure.indexOf("SELECT id, obra_id"));
    expect(ensure).toContain("FOR UPDATE");
    expect(ensure).toContain("db.transaction(async");
  });

  it("cadastro inicial em obra cria o espelho no mesmo commit", () => {
    const criar = routerSource.slice(
      routerSource.indexOf("proprioCriar:"),
      routerSource.indexOf("proprioAtualizar:", routerSource.indexOf("proprioCriar:")),
    );
    expect(criar).toContain("db.transaction(async");
    expect(criar).toContain("ensureAlmoxItemForEquipamento(tx");
    expect(criar).toContain("connectionIsTransaction: true");
    expect(criar).toContain("failOnError: true");
  });
});