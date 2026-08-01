// Rev. 2895 — Gerenciador de sincronização offline do Levantamento de Campo (PWA).
// Mantém a fila (IndexedDB), drena automaticamente ao voltar a conexão, expõe
// status por item (pendente/sincronizado/erro/conflito) via pub/sub e faz o
// pré-download de PDFs/fotos para uso offline. Escopo EXCLUSIVO do levantamento.

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import {
  type SyncOp, blobToBase64, getBlob, putBlob, listOps, putOp, deleteOp, enqueueOp,
} from "./offlineDb";

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      maxURLLength: 2048,
      fetch: (input, init) => globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }),
    }),
  ],
});

export type SyncSummary = {
  online: boolean;
  syncing: boolean;
  pending: number;
  errors: number;
  conflicts: number;
  lastSyncAt: number | null;
  lastError: string | null;
};

let lastSyncAt: number | null = null;
let lastError: string | null = null;
let syncing = false;

const listeners = new Set<(s: SyncSummary) => void>();

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function buildSummary(): Promise<SyncSummary> {
  const ops = await listOps().catch(() => [] as SyncOp[]);
  const conflicts = ops.filter((o) => o.status === "error" && (o.error || "").startsWith("Conflito")).length;
  const errors = ops.filter((o) => o.status === "error").length - conflicts;
  const pending = ops.filter((o) => o.status === "pending" || o.status === "syncing").length;
  return { online: isOnline(), syncing, pending, errors: Math.max(0, errors), conflicts, lastSyncAt, lastError };
}

async function notify() {
  const s = await buildSummary();
  listeners.forEach((cb) => cb(s));
}

export function subscribe(cb: (s: SyncSummary) => void): () => void {
  listeners.add(cb);
  buildSummary().then(cb);
  return () => { listeners.delete(cb); };
}

export async function getSummary(): Promise<SyncSummary> {
  return buildSummary();
}

// Cria e enfileira uma operação offline.
export async function queueOp(op: Omit<SyncOp, "status" | "createdAt">): Promise<void> {
  await enqueueOp({ ...op, status: "pending", createdAt: Date.now() });
  await notify();
  // tenta drenar de imediato (no-op se offline).
  void processQueue();
}

// Drena a fila: agrupa por contrato e chama o endpoint idempotente em lote.
export async function processQueue(): Promise<SyncSummary> {
  if (syncing || !isOnline()) return buildSummary();
  syncing = true;
  await notify();
  try {
    const all = await listOps();
    const pendentes = all.filter((o) => o.status === "pending" || o.status === "error");
    // agrupa por companyId|contratoId
    const grupos = new Map<string, SyncOp[]>();
    for (const op of pendentes) {
      const k = `${op.companyId}|${op.contratoId}`;
      (grupos.get(k) || grupos.set(k, []).get(k)!).push(op);
    }
    // O servidor aceita no máx. 500 ops por chamada → fatiamos cada grupo em
    // lotes de CHUNK p/ não estourar o limite quando há muitas ops offline.
    const CHUNK = 400;
    for (const [, opsGrupo] of grupos) {
      const { companyId, contratoId } = opsGrupo[0];
      for (let i = 0; i < opsGrupo.length; i += CHUNK) {
        const ops = opsGrupo.slice(i, i + CHUNK);
        // monta payload — fotos derivam base64 do blob salvo localmente
        const operations: any[] = [];
        for (const op of ops) {
          let base64: string | undefined;
          if (op.entity === "foto" && op.action === "upsert" && op.blobKey) {
            const rec = await getBlob(op.blobKey);
            if (rec) base64 = await blobToBase64(rec.blob);
          }
          operations.push({
            clientOpId: op.clientOpId,
            entity: op.entity,
            action: op.action,
            uuid: op.uuid,
            id: op.id,
            medicaoCampoId: op.medicaoCampoId,
            atualizadoEm: op.atualizadoEm,
            data: op.data,
            base64,
            contentType: op.contentType,
          });
        }
        try {
          const res = await client.medicao.sincronizarLote.mutate({ companyId, contratoId, operations });
          const byId = new Map(res.resultados.map((r) => [r.clientOpId, r]));
          for (const op of ops) {
            const r = byId.get(op.clientOpId);
            if (!r || r.status === "ok") {
              await deleteOp(op.clientOpId);
            } else if (r.status === "conflito") {
              // Rev. 4792 — servidor tem versão MAIS RECENTE → o servidor vence
              // (last-write-wins). Guardar a op eternamente só entupia a fila:
              // o chip ficava "N pend." pra sempre e nada parecia acontecer.
              await deleteOp(op.clientOpId);
            } else {
              await putOp({ ...op, status: "error", error: r.mensagem || "Falha ao sincronizar." });
            }
          }
          lastSyncAt = Date.now();
          lastError = null;
        } catch (e: any) {
          lastError = e?.message || "Falha de rede ao sincronizar.";
          // mantém ops como pending para nova tentativa
          for (const op of ops) {
            if (op.status === "error") continue;
            await putOp({ ...op, status: "pending" });
          }
        }
      }
    }
  } finally {
    syncing = false;
    await notify();
  }
  return buildSummary();
}

// Pré-baixa PDFs e fotos de um snapshot para uso offline.
export async function prefetchCampoBlobs(campo: any, onProgress?: (done: number, total: number) => void): Promise<void> {
  const tasks: { key: string; url: string }[] = [];
  for (const p of (campo?.pdfs ?? [])) if (p.arquivoUrl) tasks.push({ key: pdfBlobKey(p.id), url: p.arquivoUrl });
  for (const f of (campo?.fotos ?? [])) if (f.arquivoUrl) tasks.push({ key: fotoBlobKey(f.id), url: f.arquivoUrl });
  let done = 0;
  for (const t of tasks) {
    try {
      const existing = await getBlob(t.key);
      if (!existing) {
        const resp = await fetch(t.url, { credentials: "include" });
        if (resp.ok) {
          const blob = await resp.blob();
          await putBlob(t.key, blob, blob.type || "application/octet-stream");
        }
      }
    } catch { /* ignora falha individual */ }
    done += 1;
    onProgress?.(done, tasks.length);
  }
}

export const pdfBlobKey = (pdfId: number) => `pdf:${pdfId}`;
export const fotoBlobKey = (fotoId: number | string) => `foto:${fotoId}`;
export const fotoBlobKeyUuid = (uuid: string) => `foto:uuid:${uuid}`;

let wired = false;
export function wireConnectivity() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => { void processQueue(); });
  window.addEventListener("offline", () => { void notify(); });
}
