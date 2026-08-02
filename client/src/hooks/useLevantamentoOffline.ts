// Rev. 2895 — Hook offline-first do Levantamento de Campo (PWA do tablet).
// Une: (1) dados do servidor (tRPC) quando online, (2) snapshot local (IndexedDB)
// quando offline, e (3) overlay otimista das operações ainda na fila de sync.
// TODAS as edições passam pela fila (idempotente): online drena na hora, offline
// fica pendente e sincroniza sozinho ao voltar a conexão.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  consolidarContornos, type ConsolidadoResultado,
} from "@shared/levantamentoConsolidado";
import {
  type CampoSnapshot, type SyncOp,
  getSnapshot, saveSnapshot, listOpsForCampo, deleteOp, putOp, getBlob, putBlob, deleteBlob,
  storageInfo, type StorageInfo,
} from "@/lib/offlineDb";
import {
  type SyncSummary, subscribe, processQueue, queueOp, prefetchCampoBlobs,
  pdfBlobKey, fotoBlobKey, fotoBlobKeyUuid, wireConnectivity, isOnline,
} from "@/lib/levantamentoSync";

function newUuid(): string {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function tempIdFromUuid(uuid: string): number {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) h = (h * 31 + uuid.charCodeAt(i)) | 0;
  return -Math.abs(h) - 1; // sempre negativo (não colide com ids reais positivos)
}
const matchContorno = (c: any, op: SyncOp) =>
  (op.uuid && c.uuid === op.uuid) || (op.id && op.id > 0 && c.id === op.id);

// Aplica a fila pendente sobre uma base (servidor OU snapshot) → estado de UI.
function applyOps(base: any, ops: SyncOp[]): any {
  if (!base) return null;
  const pdfs = (base.pdfs ?? []).map((p: any) => ({ ...p }));
  let contornos = (base.contornos ?? []).map((c: any) => ({ ...c }));
  let fotos = (base.fotos ?? []).map((f: any) => ({ ...f }));
  const ordered = [...ops].sort((a, b) => a.createdAt - b.createdAt);
  for (const op of ordered) {
    if (op.entity === "contorno") {
      if (op.action === "delete") {
        contornos = contornos.filter((c: any) => !matchContorno(c, op));
      } else {
        const idx = contornos.findIndex((c: any) => matchContorno(c, op));
        const tempId = op.uuid ? tempIdFromUuid(op.uuid) : -(op.createdAt);
        const base0 = idx >= 0 ? contornos[idx] : {};
        const merged = { ...base0, ...op.data, uuid: op.uuid, id: base0.id ?? tempId, __pending: true };
        if (idx >= 0) contornos[idx] = merged; else contornos.push(merged);
      }
    } else if (op.entity === "foto") {
      if (op.action === "delete") {
        fotos = fotos.filter((f: any) => !((op.uuid && f.uuid === op.uuid) || (op.id && op.id > 0 && f.id === op.id)));
      } else {
        const tempId = op.uuid ? tempIdFromUuid(op.uuid) : -(op.createdAt);
        fotos.push({
          id: tempId, uuid: op.uuid, __blobKey: op.blobKey, __pending: true,
          // Rev. 4823 — contentType junto p/ a UI saber se é vídeo antes da sync
          contentType: op.contentType ?? null,
          arquivoUrl: "", legenda: op.data?.legenda ?? null,
          pdfId: op.data?.pdfId ?? null, pagina: op.data?.pagina ?? null,
          contornoId: op.data?.contornoId ?? null,
          gpsLat: op.data?.gpsLat ?? null, gpsLng: op.data?.gpsLng ?? null,
          gpsPrecisao: op.data?.gpsPrecisao ?? null, capturadoEm: op.data?.capturadoEm ?? null,
        });
      }
    } else if (op.entity === "pdf") {
      const p = pdfs.find((x: any) => x.id === op.id);
      if (p) p.calibracaoJson = op.data?.calibracaoJson ?? null;
    }
  }
  return { ...base, pdfs, contornos, fotos };
}

export type UseLevantamentoOffline = {
  campo: any | null;
  consolidado: ConsolidadoResultado;
  itensOrcamento: any[];
  loading: boolean;
  online: boolean;
  cached: boolean;
  sync: SyncSummary;
  storage: StorageInfo | null;
  prefetching: boolean;
  prefetchProgress: { done: number; total: number } | null;
  // ops offline-aware
  saveContorno: (input: any) => Promise<void>;
  excluirContorno: (c: any) => Promise<void>;
  calibrarPdf: (pdf: any, calibracaoJson: string) => Promise<void>;
  saveFoto: (file: File, meta: { pdfId?: number | null; pagina?: number | null; contornoId?: number | null; contornoUuid?: string | null }) => Promise<void>;
  excluirFoto: (f: any) => Promise<void>;
  // utilidades
  processNow: () => Promise<void>;
  prefetch: () => Promise<void>;
  refreshStorage: () => Promise<void>;
  pdfFileFor: (pdf: any) => string | undefined;
  fotoSrcFor: (f: any) => string | undefined;
};

export function useLevantamentoOffline(args: {
  campoId: number; companyId: number; contratoId: number; orcamentoId: number;
  // Rev. 3102 — Medição de TERCEIROS não tem orçamento de obra: os itens vêm do
  // próprio contrato (terceiro_contrato_itens). Quando fornecido, este override
  // substitui a query de orçamento como fonte dos itens vinculáveis/consolidação.
  // `undefined` = caminho normal (cliente/obra); `null` = override carregando;
  // array = itens resolvidos (já no formato consolidável).
  itensOverride?: any[] | null;
  // Rev. 4780 — catálogo de serviços do levantamento (vínculo EAP por serviço +
  // derivados chapisco/emboço/reboco na consolidação local).
  servicos?: any[];
  // Rev. 4822 — contornos das medições ANTERIORES do contrato: a numeração
  // otimista continua da sequência do contrato (não recomeça do 1).
  refContornos?: any[];
}): UseLevantamentoOffline {
  const { campoId, companyId, contratoId, orcamentoId, itensOverride, servicos, refContornos } = args;
  const overriding = itensOverride !== undefined;
  const utils = trpc.useUtils();

  const [snapshot, setSnapshot] = useState<CampoSnapshot | null>(null);
  const [ops, setOps] = useState<SyncOp[]>([]);
  const [sync, setSync] = useState<SyncSummary>({ online: isOnline(), syncing: false, pending: 0, errors: 0, conflicts: 0, lastSyncAt: null, lastError: null });
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [prefetching, setPrefetching] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState<{ done: number; total: number } | null>(null);
  const objectUrlsRef = useRef<Record<string, string>>({});

  // ── queries do servidor (rodam quando online) ──
  const campoQ = trpc.medicao.getCampo.useQuery(
    { id: campoId, companyId },
    { enabled: campoId > 0 && companyId > 0, retry: false },
  );
  const itensQ = trpc.medicao.getItensOrcamento.useQuery(
    { orcamentoId },
    { enabled: orcamentoId > 0 && !overriding, retry: false },
  );

  // Itens resolvidos: override (terceiros) > query de orçamento (cliente/obra).
  const itensResolved: any[] | undefined = overriding
    ? (itensOverride ?? undefined)
    : ((itensQ.data as any[]) ?? undefined);

  const reloadOps = useCallback(async () => {
    setOps(await listOpsForCampo(campoId).catch(() => []));
  }, [campoId]);

  // wiring inicial: conectividade + snapshot + fila
  useEffect(() => {
    wireConnectivity();
    getSnapshot(campoId).then((s) => { if (s) setSnapshot(s); }).catch(() => {});
    reloadOps();
  }, [campoId, reloadOps]);

  // assina o resumo da sincronização
  useEffect(() => {
    const unsub = subscribe((s) => {
      setSync(s);
      reloadOps();
      // ao terminar uma sync com sucesso, busca a base fresca do servidor
      if (s.online && !s.syncing && s.pending === 0) {
        utils.medicao.getCampo.invalidate({ id: campoId, companyId }).catch(() => {});
      }
    });
    return unsub;
  }, [campoId, companyId, reloadOps, utils]);

  // Rev. 4792 — ONLINE = sync automática: se há pendências e não está
  // sincronizando, drena a fila sozinho (a cada 15s). O botão manual some.
  useEffect(() => {
    const t = setInterval(() => {
      if (isOnline() && !sync.syncing && sync.pending > 0) void processQueue();
    }, 15000);
    return () => clearInterval(t);
  }, [sync.syncing, sync.pending]);

  // persiste snapshot sempre que o servidor traz dados frescos (base p/ offline)
  useEffect(() => {
    if (campoQ.data && itensResolved) {
      const snap: CampoSnapshot = {
        campoId, contratoId, orcamentoId, companyId,
        campo: campoQ.data, itensOrcamento: itensResolved, savedAt: Date.now(),
      };
      setSnapshot(snap);
      saveSnapshot(snap).catch(() => {});
    }
  }, [campoQ.data, itensResolved, campoId, contratoId, orcamentoId, companyId]);

  // base: servidor (online + carregado) senão snapshot local
  const base = (campoQ.data as any) ?? snapshot?.campo ?? null;
  const itensOrcamento = itensResolved ?? snapshot?.itensOrcamento ?? [];
  const cached = !!snapshot;

  const campo = useMemo(() => applyOps(base, ops), [base, ops]);

  const consolidado = useMemo(() => {
    const cs = (campo?.contornos ?? []).filter((c: any) => !c.deletedAt);
    return consolidarContornos(cs as any, itensOrcamento as any, servicos as any);
  }, [campo, itensOrcamento, servicos]);

  // ── resolução de blob URLs (PDF/foto offline) ──
  const ensureBlobUrl = useCallback(async (key: string) => {
    if (objectUrlsRef.current[key]) return;
    const rec = await getBlob(key).catch(() => undefined);
    if (rec) {
      const url = URL.createObjectURL(rec.blob);
      objectUrlsRef.current[key] = url;
      setBlobUrls((m) => ({ ...m, [key]: url }));
    }
  }, []);

  useEffect(() => {
    // tenta resolver blobs locais para PDFs e fotos exibidos
    for (const p of (campo?.pdfs ?? [])) ensureBlobUrl(pdfBlobKey(p.id));
    for (const f of (campo?.fotos ?? [])) {
      if (f.__blobKey) ensureBlobUrl(f.__blobKey);
      else if (f.id > 0) ensureBlobUrl(fotoBlobKey(f.id));
    }
  }, [campo, ensureBlobUrl]);

  useEffect(() => () => {
    // revoga object URLs ao desmontar
    Object.values(objectUrlsRef.current).forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* */ } });
    objectUrlsRef.current = {};
  }, []);

  const refreshStorage = useCallback(async () => {
    setStorage(await storageInfo().catch(() => null));
  }, []);
  useEffect(() => { refreshStorage(); }, [refreshStorage, ops, blobUrls]);

  // ───────────────────────────── OPS ─────────────────────────────
  const saveContorno = useCallback(async (input: any) => {
    const uuid: string = input.uuid || newUuid();
    const existingId: number | undefined = input.id && input.id > 0 ? input.id : undefined;
    // numero otimista p/ novos — Rev. 4792: sequência POR CATEGORIA (serviço);
    // cada categoria conta a sua (Contrapiso 1,2,3… / Forro 1,2,3…).
    const catKey = String(input.servico ?? input.tipo ?? "");
    const maxLocal = (campo?.contornos ?? [])
      .filter((c: any) => !c.deletedAt && String(c.servico ?? c.tipo ?? "") === catKey)
      .reduce((m: number, c: any) => Math.max(m, c.numero || 0), 0);
    // Rev. 4822 — sequência do CONTRATO: continua do maior nº das medições anteriores
    const maxRef = (refContornos ?? [])
      .filter((c: any) => String(c.servico ?? c.tipo ?? "") === catKey)
      .reduce((m: number, c: any) => Math.max(m, c.numero || 0), 0);
    const numero = input.numero ?? (Math.max(maxLocal, maxRef) + 1);
    const data = { ...input, uuid: undefined, id: undefined, numero, medicaoCampoId: campoId };
    delete data.companyId;
    // dedupe: se já há op upsert pendente p/ este uuid, mescla
    const existingOp = ops.find((o) => o.entity === "contorno" && o.action === "upsert" && ((o.uuid && o.uuid === uuid) || (existingId && o.id === existingId)));
    if (existingOp) {
      await putOp({ ...existingOp, data: { ...existingOp.data, ...data }, atualizadoEm: new Date().toISOString(), status: "pending", error: undefined });
      await reloadOps();
      void processQueue();
      return;
    }
    await queueOp({
      clientOpId: newUuid(), campoId, contratoId, companyId,
      entity: "contorno", action: "upsert", uuid, id: existingId, medicaoCampoId: campoId,
      atualizadoEm: new Date().toISOString(), data,
    });
    await reloadOps();
  }, [campo, ops, campoId, contratoId, companyId, reloadOps]);

  const excluirContorno = useCallback(async (c: any) => {
    const uuid: string | undefined = c.uuid;
    const id: number | undefined = c.id && c.id > 0 ? c.id : undefined;
    // se é um contorno criado offline e ainda NÃO sincronizado → cancela a op de criação
    if (!id && uuid) {
      const pendingUpsert = ops.find((o) => o.entity === "contorno" && o.action === "upsert" && o.uuid === uuid);
      if (pendingUpsert) {
        await deleteOp(pendingUpsert.clientOpId);
        await reloadOps();
        return;
      }
    }
    await queueOp({
      clientOpId: newUuid(), campoId, contratoId, companyId,
      entity: "contorno", action: "delete", uuid, id,
      atualizadoEm: new Date().toISOString(),
    });
    await reloadOps();
  }, [ops, campoId, contratoId, companyId, reloadOps]);

  const calibrarPdf = useCallback(async (pdf: any, calibracaoJson: string) => {
    const existingOp = ops.find((o) => o.entity === "pdf" && o.id === pdf.id);
    if (existingOp) {
      await putOp({ ...existingOp, data: { calibracaoJson }, atualizadoEm: new Date().toISOString(), status: "pending", error: undefined });
      await reloadOps();
      void processQueue();
      return;
    }
    await queueOp({
      clientOpId: newUuid(), campoId, contratoId, companyId,
      entity: "pdf", action: "calibrar", id: pdf.id,
      atualizadoEm: new Date().toISOString(), data: { calibracaoJson },
    });
    await reloadOps();
  }, [ops, campoId, contratoId, companyId, reloadOps]);

  const saveFoto = useCallback(async (file: File, meta: { pdfId?: number | null; pagina?: number | null; contornoId?: number | null; contornoUuid?: string | null; gpsLat?: number | null; gpsLng?: number | null; gpsPrecisao?: number | null; capturadoEm?: string | null }) => {
    const uuid = newUuid();
    const blobKey = fotoBlobKeyUuid(uuid);
    await putBlob(blobKey, file, file.type || "image/jpeg");
    await queueOp({
      clientOpId: newUuid(), campoId, contratoId, companyId,
      entity: "foto", action: "upsert", uuid, medicaoCampoId: campoId,
      atualizadoEm: new Date().toISOString(),
      blobKey, contentType: file.type || "image/jpeg",
      // Rev. 4812 — contornoUuid junto: se o contorno ainda tem id temporário
      // (negativo, offline), o servidor religa a foto pelo uuid na sync.
      data: { pdfId: meta.pdfId ?? null, pagina: meta.pagina ?? null, contornoId: meta.contornoId ?? null, contornoUuid: meta.contornoUuid ?? null, gpsLat: meta.gpsLat ?? null, gpsLng: meta.gpsLng ?? null, gpsPrecisao: meta.gpsPrecisao ?? null, capturadoEm: meta.capturadoEm ?? null },
    });
    await reloadOps();
  }, [campoId, contratoId, companyId, reloadOps]);

  const excluirFoto = useCallback(async (f: any) => {
    const uuid: string | undefined = f.uuid;
    const id: number | undefined = f.id && f.id > 0 ? f.id : undefined;
    if (!id && uuid) {
      const pendingUpsert = ops.find((o) => o.entity === "foto" && o.action === "upsert" && o.uuid === uuid);
      if (pendingUpsert) {
        await deleteOp(pendingUpsert.clientOpId);
        if (pendingUpsert.blobKey) await deleteBlob(pendingUpsert.blobKey).catch(() => {});
        await reloadOps();
        return;
      }
    }
    await queueOp({
      clientOpId: newUuid(), campoId, contratoId, companyId,
      entity: "foto", action: "delete", uuid, id,
      atualizadoEm: new Date().toISOString(),
    });
    await reloadOps();
  }, [ops, campoId, contratoId, companyId, reloadOps]);

  const processNow = useCallback(async () => { await processQueue(); await reloadOps(); }, [reloadOps]);

  const prefetch = useCallback(async () => {
    if (!campo) return;
    setPrefetching(true);
    setPrefetchProgress({ done: 0, total: 0 });
    try {
      await prefetchCampoBlobs(campo, (done, total) => setPrefetchProgress({ done, total }));
      // garante snapshot salvo
      if (base && itensOrcamento) {
        const snap: CampoSnapshot = { campoId, contratoId, orcamentoId, companyId, campo: base, itensOrcamento, savedAt: Date.now() };
        await saveSnapshot(snap);
        setSnapshot(snap);
      }
      // re-resolve blob urls
      for (const p of (campo?.pdfs ?? [])) ensureBlobUrl(pdfBlobKey(p.id));
      for (const f of (campo?.fotos ?? [])) if (f.id > 0) ensureBlobUrl(fotoBlobKey(f.id));
      await refreshStorage();
    } finally {
      setPrefetching(false);
    }
  }, [campo, base, itensOrcamento, campoId, contratoId, orcamentoId, companyId, ensureBlobUrl, refreshStorage]);

  const pdfFileFor = useCallback((pdf: any): string | undefined => {
    if (!pdf) return undefined;
    const local = blobUrls[pdfBlobKey(pdf.id)];
    if (local) return local;
    return pdf.arquivoUrl || undefined; // remoto (exige conexão)
  }, [blobUrls]);

  const fotoSrcFor = useCallback((f: any): string | undefined => {
    if (!f) return undefined;
    if (f.__blobKey && blobUrls[f.__blobKey]) return blobUrls[f.__blobKey];
    if (f.id > 0 && blobUrls[fotoBlobKey(f.id)]) return blobUrls[fotoBlobKey(f.id)];
    return f.arquivoUrl || undefined;
  }, [blobUrls]);

  return {
    campo,
    consolidado,
    itensOrcamento,
    loading: campoQ.isLoading && !snapshot,
    online: sync.online,
    cached,
    sync,
    storage,
    prefetching,
    prefetchProgress,
    saveContorno,
    excluirContorno,
    calibrarPdf,
    saveFoto,
    excluirFoto,
    processNow,
    prefetch,
    refreshStorage,
    pdfFileFor,
    fotoSrcFor,
  };
}
