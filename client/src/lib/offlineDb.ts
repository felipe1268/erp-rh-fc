// Rev. 2895 — Armazenamento local (IndexedDB) do Levantamento de Campo (PWA offline).
// Wrapper minúsculo SEM dependências externas. Guarda: snapshot do levantamento
// (getCampo + itens do orçamento), blobs de PDF/foto pré-baixados, e a fila de
// sincronização. Escopo EXCLUSIVO do módulo de Levantamento de Campo.

const DB_NAME = "erp-fc-levantamento";
const DB_VERSION = 1;

export const STORE_SNAPSHOTS = "campoSnapshots";
export const STORE_BLOBS = "blobs";
export const STORE_QUEUE = "syncQueue";

export type CampoSnapshot = {
  campoId: number;
  contratoId: number;
  orcamentoId: number;
  companyId: number;
  campo: any;            // resultado do getCampo (campo + pdfs + contornos + fotos)
  itensOrcamento: any[]; // itens do orçamento para consolidação offline
  savedAt: number;
};

export type BlobRecord = { key: string; blob: Blob; type: string; bytes: number; savedAt: number };

export type SyncStatus = "pending" | "syncing" | "error";

export type SyncOp = {
  clientOpId: string;
  campoId: number;
  contratoId: number;
  companyId: number;
  entity: "contorno" | "foto" | "pdf";
  action: "upsert" | "delete" | "calibrar";
  uuid?: string;
  id?: number;            // id do servidor quando conhecido (edição/exclusão de item já existente)
  medicaoCampoId?: number;
  atualizadoEm: string;   // ISO — momento da edição offline (base do last-write-wins)
  data?: any;
  blobKey?: string;       // p/ foto: chave do blob em STORE_BLOBS (base64 derivado no sync)
  contentType?: string;
  status: SyncStatus;
  error?: string;
  createdAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste navegador."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "campoId" });
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const q = db.createObjectStore(STORE_QUEUE, { keyPath: "clientOpId" });
        q.createIndex("byCampo", "campoId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Falha ao abrir IndexedDB."));
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

function getAll<T>(store: string, query?: IDBKeyRange, index?: string): Promise<T[]> {
  return openDb().then((db) => new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const src = index ? t.objectStore(store).index(index) : t.objectStore(store);
    const req = src.getAll(query);
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  }));
}

// ── Snapshots ────────────────────────────────────────────────────────────────
export const saveSnapshot = (snap: CampoSnapshot) => tx(STORE_SNAPSHOTS, "readwrite", (s) => s.put(snap));
export const getSnapshot = (campoId: number) =>
  tx<CampoSnapshot | undefined>(STORE_SNAPSHOTS, "readonly", (s) => s.get(campoId) as any);
export const listSnapshots = () => getAll<CampoSnapshot>(STORE_SNAPSHOTS);
export const deleteSnapshot = (campoId: number) => tx(STORE_SNAPSHOTS, "readwrite", (s) => s.delete(campoId));

// ── Blobs (PDF / fotos pré-baixados) ─────────────────────────────────────────
export const putBlob = (key: string, blob: Blob, type: string) =>
  tx(STORE_BLOBS, "readwrite", (s) => s.put({ key, blob, type, bytes: blob.size, savedAt: Date.now() } as BlobRecord));
export const getBlob = (key: string) => tx<BlobRecord | undefined>(STORE_BLOBS, "readonly", (s) => s.get(key) as any);
export const deleteBlob = (key: string) => tx(STORE_BLOBS, "readwrite", (s) => s.delete(key));
export const listBlobs = () => getAll<BlobRecord>(STORE_BLOBS);

// ── Fila de sincronização ────────────────────────────────────────────────────
export const enqueueOp = (op: SyncOp) => tx(STORE_QUEUE, "readwrite", (s) => s.put(op));
export const putOp = (op: SyncOp) => tx(STORE_QUEUE, "readwrite", (s) => s.put(op));
export const deleteOp = (clientOpId: string) => tx(STORE_QUEUE, "readwrite", (s) => s.delete(clientOpId));
export const listOps = () => getAll<SyncOp>(STORE_QUEUE);
export const listOpsForCampo = (campoId: number) =>
  getAll<SyncOp>(STORE_QUEUE, IDBKeyRange.only(campoId), "byCampo");

// ── Helpers ──────────────────────────────────────────────────────────────────
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export type StorageInfo = { usage: number; quota: number; blobsBytes: number; blobsCount: number };
export async function storageInfo(): Promise<StorageInfo> {
  let usage = 0, quota = 0;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      usage = est.usage || 0;
      quota = est.quota || 0;
    }
  } catch { /* ignore */ }
  const blobs = await listBlobs().catch(() => [] as BlobRecord[]);
  const blobsBytes = blobs.reduce((s, b) => s + (b.bytes || 0), 0);
  return { usage, quota, blobsBytes, blobsCount: blobs.length };
}
