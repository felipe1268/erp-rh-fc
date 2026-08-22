import assert from "node:assert/strict";
import { getDb, resetDbPool } from "../server/db";
import { rhDocumentos } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

const ROLLBACK = new Error("rollback de validação");
const base = {
  companyId: -9_190_001,
  employeeId: -9_190_001,
  conteudoHtml: "<p>Teste de unicidade</p>",
  status: "gerado",
  titulo: "Documento de teste",
};

async function emTransacaoReversivel(db: any, validar: (tx: any) => Promise<void>) {
  try {
    await db.transaction(async (tx: any) => {
      await validar(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para validar a unicidade de documentos.");

  // Duas conexões independentes reproduzem a corrida entre "Gerar" e "N/A".
  // A limpeza no finally remove somente os IDs negativos reservados ao teste.
  try {
    const resultados = await Promise.allSettled([
      db.insert(rhDocumentos).values({
        ...base,
        tipo: "termo_lgpd",
        titulo: "Termo LGPD — gerado",
      }),
      db.insert(rhDocumentos).values({
        ...base,
        tipo: "termo_lgpd",
        titulo: "Termo LGPD — N/A",
        status: "nao_aplicavel",
      }),
    ]);
    const sucessos = resultados.filter((resultado) => resultado.status === "fulfilled");
    const falha = resultados.find((resultado) => resultado.status === "rejected") as PromiseRejectedResult | undefined;
    assert.equal(sucessos.length, 1,
      "a corrida entre gerar e N/A deve persistir exatamente uma via ativa");
    assert.equal((falha?.reason as any)?.code ?? (falha?.reason as any)?.cause?.code, "23505",
      "a segunda tentativa deve ser bloqueada pelo índice único do checklist");
  } finally {
    await db.delete(rhDocumentos).where(and(
      eq(rhDocumentos.companyId, base.companyId),
      eq(rhDocumentos.employeeId, base.employeeId),
    ));
  }

  await emTransacaoReversivel(db, async (tx) => {
    const primeiro = await tx.insert(rhDocumentos).values({
      ...base,
      tipo: "recibo_folha",
      titulo: "Recibo de folha — 01/2026",
    }).returning({ id: rhDocumentos.id });
    const segundo = await tx.insert(rhDocumentos).values({
      ...base,
      tipo: "recibo_folha",
      titulo: "Recibo de folha — 02/2026",
    }).returning({ id: rhDocumentos.id });
    assert.equal(primeiro.length + segundo.length, 2,
      "documentos eventuais devem continuar aceitando emissões distintas");
  });

  console.log("OK: unicidade de documentos do checklist e multiemissão de eventos validadas.");
}

main()
  .catch((error) => {
    console.error("Falha na validação de unicidade dos documentos:", error);
    process.exitCode = 1;
  })
  .finally(() => resetDbPool());