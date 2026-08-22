import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const agrupamento = JSON.parse(
  execFileSync(
    "pnpm",
    [
      "tsx",
      "-e",
      `
      import { agruparImportacoesEpiParaEstorno } from "./server/utils/ocEpiEstorno.ts";
      console.log(JSON.stringify(agruparImportacoesEpiParaEstorno([
        { epiId: 41, obraId: 7, quantidade: "3", recebidoEm: "2026-08-22T10:00:00.000Z" },
        { epiId: 41, obraId: 7, quantidade: 5, recebidoEm: "2026-08-22T10:00:00.000Z" },
        { epiId: 41, obraId: 8, quantidade: 2, recebidoEm: "2026-08-22T10:00:00.000Z" },
      ])));
    `,
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  )
);

const comprasSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/compras.ts"),
  "utf8"
);
const episSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/epis.ts"),
  "utf8"
);

const estornoSource = comprasSource.slice(
  comprasSource.indexOf("estornarRecebimentoOC:"),
  comprasSource.indexOf(
    "excluirOrdem:",
    comprasSource.indexOf("estornarRecebimentoOC:")
  )
);
const createDeliverySource = episSource.slice(
  episSource.indexOf("createDelivery:"),
  episSource.indexOf("deleteDelivery:", episSource.indexOf("createDelivery:"))
);

describe("Estorno de recebimento de OC EPI", () => {
  it("consolida duas linhas da mesma OC no mesmo EPI/obra em uma única reversão", () => {
    expect(agrupamento).toEqual([
      {
        epiId: 41,
        obraId: 7,
        quantidade: 8,
        recebidoEm: "2026-08-22T10:00:00.000Z",
      },
      {
        epiId: 41,
        obraId: 8,
        quantidade: 2,
        recebidoEm: "2026-08-22T10:00:00.000Z",
      },
    ]);
    expect(estornoSource).toContain(
      "agruparImportacoesEpiParaEstorno(importacoes)"
    );
    expect(estornoSource).toContain(
      "quantidade: sql`${epiEstoqueObra.quantidade} - ${movimento.quantidade}`"
    );
  });

  it("serializa entrega e estorno pela mesma linha de saldo", () => {
    const estornoLocks = estornoSource.match(/FOR UPDATE/g) ?? [];
    const deliveryLock = createDeliverySource.match(
      /SELECT id FROM \$\{epiEstoqueObra\}[\s\S]*?FOR UPDATE/
    )?.[0];

    expect(estornoSource).toContain(
      "pg_advisory_xact_lock(478011, ${movimento.epiId})"
    );
    expect(estornoLocks.length).toBeGreaterThanOrEqual(2);
    expect(deliveryLock).toContain("epi_id = ${input.epiId}");
    expect(deliveryLock).toContain("obra_id = ${input.obraId}");
    expect(deliveryLock).toContain("FOR UPDATE");

    const deliveryLockPosition = createDeliverySource.indexOf("FOR UPDATE");
    const deliveryWritePosition = createDeliverySource.indexOf(
      "tx.update(epiEstoqueObra)"
    );
    expect(deliveryLockPosition).toBeGreaterThanOrEqual(0);
    expect(deliveryLockPosition).toBeLessThan(deliveryWritePosition);
    expect(estornoSource).toContain(
      "gt(epiDeliveries.createdAt, movimento.recebidoEm)"
    );
  });

  it("bloqueia estorno após entrega, transferência de saída ou ajuste", () => {
    expect(estornoSource).toContain("const saidaPorEntrega = await tx.select");
    expect(estornoSource).toContain(
      "const saidaPorTransferencia = await tx.select"
    );
    expect(estornoSource).toContain(
      "const ajusteCentral = movimento.obraId ? []"
    );
    expect(estornoSource).toContain(
      "const ajusteObraPosterior = movimento.obraId ?"
    );

    expect(estornoSource).toContain(
      "gt(epiDeliveries.createdAt, movimento.recebidoEm)"
    );
    expect(estornoSource).toContain(
      "gt(epiTransferencias.createdAt, movimento.recebidoEm)"
    );
    expect(estornoSource).toContain(
      "gt(epiEstoqueAjustes.createdAt, movimento.recebidoEm)"
    );
    expect(estornoSource).toContain(
      "gt(epiEstoqueObra.updatedAt, movimento.recebidoEm)"
    );
    expect(estornoSource).toContain(
      "Houve movimentação posterior deste EPI no mesmo estoque"
    );
    expect(estornoSource).toContain('code: "CONFLICT"');
  });
});
