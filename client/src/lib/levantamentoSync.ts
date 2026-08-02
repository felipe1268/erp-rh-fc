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
  // Rev. 4792 — progresso do envio (0..total) p/ barra de % no chip
  progress: { done: number; total: number } | null;
};

let lastSyncAt: number | null = null;
let lastError: string | null = null;
let syncing = false;
let progress: { done: number; total: number } | null = null;

const listeners = new Set<(s: SyncSummary) => void>();

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function buildSummary(): Promise<SyncSummary> {
  const ops = await listOps().catch(() => [] as SyncOp[]);
  const conflicts = ops.filter((o) => o.status === "error" && (o.error || "").startsWith("Conflito")).length;
  const errors = ops.filter((o) => o.status === "error").length - conflicts;
  const pending = ops.filter((o) => o.status === "pending" || o.status === "syncing").length;
  return { online: isOnline(), syncing, pending, errors: Math.max(0, errors), conflicts, lastSyncAt, lastError, progress };
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
    progress = pendentes.length > 0 ? { done: 0, total: pendentes.length } : null;
    await notify();
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
      // Rev. 4812 — ordem de DEPENDÊNCIA no lote: contornos antes das fotos
      // (a foto religa ao contorno pelo uuid no MESMO lote); exclusões por último.
      const peso = (o: SyncOp) =>
        o.action === "delete" ? 4 : o.entity === "contorno" ? 1 : o.entity === "pdf" ? 2 : 3;
      opsGrupo.sort((a, b) => peso(a) - peso(b) || a.createdAt - b.createdAt);
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
          // barra de % anda enquanto prepara/envia (fotos grandes demoram no base64)
          if (progress) { progress = { done: Math.min(progress.total - 1, progress.done + 1), total: progress.total }; await notify(); }
        }
        try {
          const res = await client.medicao.sincronizarLote.mutate({ companyId, contratoId, operations });
          const byId = new Map(res.resultados.map((r) => [r.clientOpId, r]));
          // Rev. 4812 — guard de CORRIDA: se a op foi EDITADA (merge de vínculo,
          // medida etc.) enquanto este lote viajava, o ack é do payload ANTIGO —
          // apagar a op descartaria a edição nova. Compara o atualizadoEm atual
          // com o enviado: mudou → mantém pendente p/ reenviar.
          const atuais = new Map((await listOps().catch(() => [] as SyncOp[])).map((o) => [o.clientOpId, o]));
          for (const op of ops) {
            const r = byId.get(op.clientOpId);
            const atual = atuais.get(op.clientOpId);
            const editadaDepois = !!atual && atual.atualizadoEm !== op.atualizadoEm;
            if (editadaDepois) {
              // qualquer que seja o desfecho do payload ANTIGO, a edição nova
              // vence: mantém a op ATUAL pendente p/ reenviar (nunca sobrescreve).
              await putOp({ ...atual!, status: "pending", error: undefined });
              continue;
            }
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
          // chunk confirmado no servidor → % espelha o que já foi de fato aceito
          if (progress) { progress = { done: Math.min(progress.total, i + ops.length), total: progress.total }; await notify(); }
        } catch (e: any) {
          lastError = e?.message || "Falha de rede ao sincronizar.";
          // mantém ops como pending para nova tentativa — Rev. 4812: sem
          // sobrescrever edições feitas ENQUANTO o lote viajava (usa a op ATUAL).
          const atuais = new Map((await listOps().catch(() => [] as SyncOp[])).map((o) => [o.clientOpId, o]));
          for (const op of ops) {
            const atual = atuais.get(op.clientOpId) ?? op;
            if (atual.status === "error") continue;
            await putOp({ ...atual, status: "pending" });
          }
        }
      }
    }
  } finally {
    syncing = false;
    progress = null;
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
