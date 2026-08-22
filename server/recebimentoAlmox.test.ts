import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const result = JSON.parse(execFileSync(
  "pnpm",
  [
    "tsx",
    "-e",
    `
      import {
        erroEscolhaDestino,
        materiaisEquivalentes,
        mesmoDestinoEstoque,
      } from "./server/utils/recebimentoAlmox.ts";
      import { resolverDestinoRecebimentoLocacao } from "./server/utils/recebimentoLocacao.ts";
      console.log(JSON.stringify({
        semDecisao: erroEscolhaDestino({
          recebido: true,
          itemNome: "Cimento CP-II",
          unidade: "sc",
          categoria: "Cimento",
        }),
        existenteSemItem: erroEscolhaDestino({
          recebido: true,
          modoAlocacao: "existente",
          itemNome: "Cimento CP-II",
          unidade: "sc",
          categoria: "Cimento",
        }),
        variacaoSegura: materiaisEquivalentes(
          "Argamassa colante AC-III 20 kg",
          "unidade",
          "ARGAMASSA COLANTE AC III 20KG",
          "un",
        ),
        produtoDiferente: materiaisEquivalentes("Cimento CP II", "sc", "Cimento CP V", "sc"),
        unidadeDiferente: materiaisEquivalentes("Cimento CP II", "sc", "Cimento CP II", "kg"),
        mesmaObra: mesmoDestinoEstoque(10, 10),
        mesmaCentral: mesmoDestinoEstoque(null, undefined),
        obraCentral: mesmoDestinoEstoque(10, null),
        obrasDiferentes: mesmoDestinoEstoque(10, 11),
        locacaoObraAtual: resolverDestinoRecebimentoLocacao(15, {
          isLocacao: true,
          tipo: "compra",
          obraId: 15,
        }),
        locacaoObraLegada: resolverDestinoRecebimentoLocacao(undefined, {
          isLocacao: false,
          tipo: "locacao",
          obraId: 22,
        }),
        locacaoSemObra: resolverDestinoRecebimentoLocacao(undefined, {
          isLocacao: true,
          tipo: "locacao",
          obraId: null,
        }),
        locacaoObraConflitante: resolverDestinoRecebimentoLocacao(99, {
          isLocacao: true,
          tipo: "locacao",
          obraId: 15,
        }),
        locacaoSemObraConflitante: resolverDestinoRecebimentoLocacao(15, {
          isLocacao: false,
          tipo: "locacao",
          obraId: null,
        }),
      }));
    `,
  ],
  { cwd: process.cwd(), encoding: "utf8" },
));

const warehouseSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/warehouse.ts"),
  "utf8",
);
const registerSmartEntrySource = warehouseSource.slice(
  warehouseSource.indexOf("registerSmartEntry:"),
  warehouseSource.indexOf("listRecebimentos:", warehouseSource.indexOf("registerSmartEntry:")),
);
const returnLoanSource = warehouseSource.slice(
  warehouseSource.indexOf("returnLoanById:"),
  warehouseSource.indexOf("// Marcar como perdido", warehouseSource.indexOf("returnLoanById:")),
);
const equipamentosSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/equipamentos.ts"),
  "utf8",
);
const locadoCriarSource = equipamentosSource.slice(
  equipamentosSource.indexOf("locadoCriar:"),
  equipamentosSource.indexOf("locadoAtualizar:", equipamentosSource.indexOf("locadoCriar:")),
);

describe("Recebimento explícito no almoxarifado", () => {
  it("não permite criar ou reutilizar item sem uma decisão explícita", () => {
    expect(result.semDecisao).toContain("Defina onde receber");
  });

  it("exige um item quando a escolha é receber em cadastro existente", () => {
    expect(result.existenteSemItem).toContain("Escolha o item de estoque");
  });

  it("considera variações seguras de nome e unidade como duplicidade", () => {
    expect(result.variacaoSegura).toBe(true);
    expect(result.produtoDiferente).toBe(false);
    expect(result.unidadeDiferente).toBe(false);
  });

  it("não permite receber em item de outra obra ou misturar obra com Central", () => {
    expect(result.mesmaObra).toBe(true);
    expect(result.mesmaCentral).toBe(true);
    expect(result.obraCentral).toBe(false);
    expect(result.obrasDiferentes).toBe(false);
  });

  it("faz o recebimento inteiro em uma transação e serializa as quantidades da OC", () => {
    expect(registerSmartEntrySource).toContain("rootDb.transaction(async");
    expect(registerSmartEntrySource).toContain("FOR UPDATE OF co");
    expect(registerSmartEntrySource).toContain("FROM compras_ordens_itens");
    expect(registerSmartEntrySource).toContain("SELECT id, company_id, obra_id, equipamento_vinculado_tipo");
    expect(registerSmartEntrySource).toContain("FROM almoxarifado_itens");
    expect(registerSmartEntrySource).toContain("COALESCE(${almoxarifadoItens.quantidadeAtual}, 0)::numeric");
    expect(registerSmartEntrySource.indexOf("rootDb.transaction(async")).toBeLessThan(
      registerSmartEntrySource.indexOf("insert(almoxarifadoRecebimentos)"),
    );
    expect(registerSmartEntrySource.indexOf("const txResult = await")).toBeLessThan(
      registerSmartEntrySource.indexOf("garantirEntryDaOC"),
    );
  });

  it("mantém OC e estoque consistentes sob recebimentos concorrentes reais", () => {
    const runner = path.resolve(process.cwd(), "server/recebimentoAlmox.integration.runner.ts");
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
      const falhas = relatorio?.resultados?.filter((resultado: any) => !resultado.ok) ?? [];
      throw new Error(
        `Runner de concorrência do recebimento falhou (exit=${proc.status}).\n` +
        `Falhas: ${JSON.stringify(falhas, null, 2)}\n` +
        `stderr (final): ${stderr.slice(-2000)}`,
      );
    }

    expect(relatorio.falhas).toBe(0);
    expect(relatorio.total).toBeGreaterThanOrEqual(19);
  }, 300_000);

  it("valida empresa e permissão da obra antes de gravar", () => {
    expect(registerSmartEntrySource).toContain("getCompaniesForUser(ctx.user.id, ctx.user.role)");
    expect(registerSmartEntrySource).toContain("getAlmoxAllowedObraIdSet(ctx.user.id, ctx.user.role, ctx.user.email)");
    expect(registerSmartEntrySource).toContain("Ordem de compra não encontrada nesta empresa");
    expect(registerSmartEntrySource).toContain("eq(obras.companyId, input.companyId)");
    expect(registerSmartEntrySource).toContain("A obra de destino não existe nesta empresa");
    expect(registerSmartEntrySource).toContain("isNull(almoxarifadoItens.equipamentoVinculadoTipo)");
  });

  it("devolve equipamento disponível na obra sem desativar seu espelho", () => {
    expect(returnLoanSource).toContain("ep.localizacao_atual_obra_id IS NULL");
    expect(returnLoanSource).toContain("COALESCE(ep.status, 'disponivel') IN ('manutencao', 'baixado')");
    expect(returnLoanSource).not.toContain("COALESCE(ep.status, 'disponivel') <> 'em_obra'");
  });
});

describe("Recebimento de equipamento locado pela OC", () => {
  it("aceita locação pelo flag atual ou pelo tipo legado e usa a obra da OC", () => {
    expect(result.locacaoObraAtual).toEqual({
      status: "ok",
      obraId: 15,
      deveNormalizarFlagLocacao: false,
    });

    expect(result.locacaoObraLegada).toEqual({
      status: "ok",
      obraId: 22,
      deveNormalizarFlagLocacao: true,
    });
  });

  it("rejeita uma obra enviada pelo cliente que diverge da obra da OC", () => {
    expect(result.locacaoObraConflitante).toEqual({ status: "obra-conflitante" });
    expect(locadoCriarSource).toContain('message: "O recebimento deve usar a obra de destino da OC."');
  });

  it("mantém OC sem obra desatribuída e não aceita adivinhar seu destino", () => {
    expect(result.locacaoSemObra).toEqual({
      status: "ok",
      obraId: null,
      deveNormalizarFlagLocacao: false,
    });
    expect(result.locacaoSemObraConflitante).toEqual({ status: "obra-conflitante" });
  });

  it("propaga a obra resolvida para o equipamento, evento e espelho do Almoxarifado", () => {
    expect(locadoCriarSource).toContain("resolverDestinoRecebimentoLocacao(input.obraId, oc)");
    expect((locadoCriarSource.match(/obraId: obraIdFinal/g) ?? [])).toHaveLength(3);
    expect(locadoCriarSource).toContain("if (obraIdFinal)");
    expect(locadoCriarSource).toContain("ensureAlmoxItemForEquipamento(db, {");
  });
});