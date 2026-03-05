import { CHANGELOG } from "../shared/changelog";
import { getLatestRevision, createRevision } from "./db";

/**
 * Sincroniza o changelog em código com o banco de dados.
 * Compara a última versão no banco com as entradas do CHANGELOG
 * e insere automaticamente as que faltam.
 * 
 * Chamado automaticamente no startup do servidor.
 */
export async function syncRevisions(): Promise<void> {
  try {
    const latest = await getLatestRevision();
    const maxVersionInDb = latest?.version ?? 0;

    const missing = CHANGELOG.filter(r => r.version > maxVersionInDb);

    if (missing.length === 0) {
      console.log(`[SyncRevisions] Banco atualizado (Rev. ${maxVersionInDb}). Nenhuma revisão nova.`);
      return;
    }

    // Inserir em ordem crescente de versão
    const sorted = [...missing].sort((a, b) => a.version - b.version);

    for (const rev of sorted) {
      await createRevision({
        version: rev.version,
        titulo: rev.titulo,
        descricao: rev.descricao,
        tipo: rev.tipo,
        modulos: rev.modulos,
        criadoPor: rev.criadoPor,
      });
    }

    console.log(`[SyncRevisions] ${sorted.length} revisão(ões) inserida(s): Rev. ${sorted[0].version} → Rev. ${sorted[sorted.length - 1].version}`);
  } catch (err) {
    console.error("[SyncRevisions] Erro ao sincronizar revisões:", err);
  }
}
