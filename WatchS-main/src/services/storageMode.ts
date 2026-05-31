/**
 * 儲存後端模式（建置時由 Vite 注入 import.meta.env）。
 */
export type StorageMode = 'localStorage' | 'remote';

export function getStorageMode(): StorageMode {
  const raw = import.meta.env.VITE_STORAGE_MODE;
  if (raw === 'remote') return 'remote';
  return 'localStorage';
}

export function getApiBaseUrl(): string {
  const raw = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (!raw) return '/api';
  return raw.replace(/\/$/, '');
}

export function getAsyncStorageDelayMs(): number {
  const n = Number(import.meta.env.VITE_ASYNC_STORAGE_DELAY_MS ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(2000, Math.floor(n));
}

export function getApiSyncToken(): string {
  return String(import.meta.env.VITE_API_SYNC_TOKEN ?? '').trim();
}
