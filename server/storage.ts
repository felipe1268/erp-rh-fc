// Storage helpers — usa Forge API quando configurada, senão armazena localmente em server/uploads/
import { ENV } from './_core/env';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'server', 'uploads');

// Garante que o diretório local existe
function ensureLocalDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── ARMAZENAMENTO LOCAL ──────────────────────────────────────
async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(LOCAL_UPLOADS_DIR, key);
  ensureLocalDir(filePath);
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data as any);
  fs.writeFileSync(filePath, buf);
  const url = `/uploads/${key}`;
  return { key, url };
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/uploads/${key}` };
}

// ── FORGE / EXTERNAL STORAGE ────────────────────────────────
type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig | null {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL('v1/storage/upload', ensureTrailingSlash(baseUrl));
  url.searchParams.set('path', normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(baseUrl: string, relKey: string, apiKey: string): Promise<string> {
  const downloadApiUrl = new URL('v1/storage/downloadUrl', ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set('path', normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, { method: 'GET', headers: buildAuthHeaders(apiKey) });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, '');
}

function toFormData(data: Buffer | Uint8Array | string, contentType: string, fileName: string): FormData {
  const blob = typeof data === 'string'
    ? new Blob([data], { type: contentType })
    : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append('file', blob, fileName || 'file');
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ── API PÚBLICA ──────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const cfg = getStorageConfig();

  // Sem credenciais → armazena localmente
  if (!cfg) {
    return localPut(relKey, data);
  }

  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(cfg.baseUrl, key);
  const formData = toFormData(data, contentType, key.split('/').pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: buildAuthHeaders(cfg.apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    // Fallback para local se a API externa falhar
    console.warn(`[Storage] API externa falhou (${response.status}), usando armazenamento local.`);
    return localPut(relKey, data);
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const cfg = getStorageConfig();
  if (!cfg) return localGet(relKey);
  const key = normalizeKey(relKey);
  return { key, url: await buildDownloadUrl(cfg.baseUrl, key, cfg.apiKey) };
}
