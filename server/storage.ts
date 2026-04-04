import { ENV } from './_core/env';
import * as fs from 'fs';
import * as path from 'path';
import { getDb } from './db';
import { sql } from 'drizzle-orm';

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'server', 'uploads');

function ensureLocalDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

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

async function dbPersist(key: string, data: Buffer | Uint8Array | string, contentType: string) {
  try {
    const db = await getDb();
    if (!db) return;
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data as any);
    const b64 = buf.toString('base64');
    await db.execute(sql`
      INSERT INTO uploaded_files (file_key, data_base64, content_type)
      VALUES (${key}, ${b64}, ${contentType})
      ON CONFLICT (file_key) DO UPDATE SET data_base64 = ${b64}, content_type = ${contentType}
    `);
  } catch (e: any) {
    console.warn(`[Storage] DB persist failed for ${key}: ${e.message}`);
  }
}

export async function dbRetrieve(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = ((await db.execute(sql`
      SELECT data_base64, content_type FROM uploaded_files WHERE file_key = ${key} LIMIT 1
    `)) as any).rows || [];
    if (rows.length === 0) return null;
    const buffer = Buffer.from(rows[0].data_base64, 'base64');
    return { buffer, contentType: rows[0].content_type || 'application/octet-stream' };
  } catch (e: any) {
    console.warn(`[Storage] DB retrieve failed for ${key}: ${e.message}`);
    return null;
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const cfg = getStorageConfig();
  const key = normalizeKey(relKey);

  let dbOk = false;
  try {
    await dbPersist(key, data, contentType);
    dbOk = true;
  } catch (e: any) {
    console.error(`[Storage] DB persist failed for "${key}" (will retry once): ${e.message}`);
    try { await dbPersist(key, data, contentType); dbOk = true; } catch (e2: any) {
      console.error(`[Storage] DB persist RETRY ALSO FAILED for "${key}": ${e2.message}`);
    }
  }
  if (!dbOk) {
    console.error(`[Storage] CRITICAL: file "${key}" NOT persisted to DB — will be lost on restart!`);
  }

  if (!cfg) {
    return localPut(relKey, data);
  }

  const uploadUrl = buildUploadUrl(cfg.baseUrl, key);
  const formData = toFormData(data, contentType, key.split('/').pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: buildAuthHeaders(cfg.apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
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
