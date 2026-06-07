import {
  getRegisteredRevisionVersions,
  createRevisionsBulk,
  tryRevisionSyncLock,
  releaseRevisionSyncLock,
} from "./db";
import { parseChangelogJsdoc } from "./changelogJsdoc";

const CHUNK = 100;

/**
 * Sincroniza o changelog (`shared/changelog.ts`) com o banco (`system_revisions`).
 *
 * Regra de ouro: TODA revisão fica registrada. A fonte é o conjunto de blocos JSDoc
 * `Rev. NNNN — ...` do próprio arquivo (auto-registro) — cobre da Rev. 246 à atual,
 * incluindo a faixa 1879→… que NUNCA chegava ao array estruturado legado e por isso
 * ficava de fora da tela "Controle de Revisões".
 *
 * Insere QUALQUER versão ainda ausente no banco (preenche lacunas, não só o topo),
 * em lotes pequenos para não estourar memória. Chamado no startup do servidor.
 *
 * Obs.: o array `CHANGELOG` legado (curado até a 1878) NÃO é mais importado aqui —
 * essas versões já estão registradas no banco e o módulo é pesado (~4.6MB).
 */
export async function syncRevisions(): Promise<void> {
  let locked = false;
  try {
    const parsed = parseChangelogJsdoc();
    if (parsed.length === 0) {
      console.warn("[SyncRevisions] Nenhum bloco JSDoc lido — sync ignorado nesta execução.");
      return;
    }

    // Serializa o backfill entre instâncias simultâneas (version não é UNIQUE).
    locked = await tryRevisionSyncLock();
    if (!locked) {
      console.log("[SyncRevisions] Outra instância está sincronizando — pulando nesta.");
      return;
    }

    const jaRegistradas = await getRegisteredRevisionVersions();
    const faltando = parsed
      .filter((r) => !jaRegistradas.has(r.version))
      .sort((a, b) => a.version - b.version)
      .map((r) => ({
        version: r.version,
        titulo: r.titulo,
        descricao: r.descricao,
        tipo: r.tipo,
        modulos: r.modulos,
        criadoPor: "main_agent",
        dataPublicacao: r.dataPublicacao,
      }));

    if (faltando.length === 0) {
      const max = Math.max(0, ...Array.from(jaRegistradas));
      console.log(`[SyncRevisions] Banco atualizado (Rev. ${max}). Nenhuma revisão nova.`);
      return;
    }

    let total = 0;
    for (let i = 0; i < faltando.length; i += CHUNK) {
      const lote = faltando.slice(i, i + CHUNK);
      total += await createRevisionsBulk(lote);
    }

    console.log(
      `[SyncRevisions] ${total} revisão(ões) registrada(s): Rev. ${faltando[0].version} → Rev. ${faltando[faltando.length - 1].version}.`,
    );
  } catch (err) {
    console.error("[SyncRevisions] Erro ao sincronizar revisões:", err);
  } finally {
    if (locked) await releaseRevisionSyncLock();
  }
}
