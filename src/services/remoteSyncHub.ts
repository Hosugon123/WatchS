/**
 * 雲端 bundle 同步（VITE_STORAGE_MODE=remote）：啟動拉取、寫入後推送、狀態廣播。
 */
import {
  SHENGWATCH_EXPORT_STORAGE_KEYS,
  buildShengwatchDataBundleForPush,
  importShengwatchDataBundle,
  parseBundleJson,
  serializeShengwatchDataBundle,
  type ShengwatchDataBundleV1,
} from '../lib/appDataBundle';
import { getApiBaseUrl, getApiSyncToken, getAsyncStorageDelayMs, getStorageMode } from './storageMode';

export const REMOTE_SYNC_STATUS_EVENT = 'shengwatchRemoteSyncStatus';
export const REMOTE_SYNC_VERSION_CONFLICT_EVENT = 'shengwatchRemoteSyncVersionConflict';

export type RemoteSyncStatus =
  | 'idle'
  | 'ok'
  | 'offline'
  | 'auth_error'
  | 'error'
  | 'version_conflict';

export class RemoteVersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT' as const;

  constructor(message = '雲端已有更新的資料') {
    super(message);
    this.name = 'RemoteVersionConflictError';
  }
}

let lastStatus: RemoteSyncStatus = 'idle';
let lastRemoteUpdatedAt = 0;
let remoteSyncLocked = false;

export function getRemoteSyncStatus(): RemoteSyncStatus {
  return lastStatus;
}

export function isRemoteSyncLocked(): boolean {
  return remoteSyncLocked;
}

function noteRemoteBundleUpdatedAt(bundle: ShengwatchDataBundleV1 | null | undefined): void {
  const ts = bundle?.updatedAt;
  if (typeof ts === 'number' && Number.isFinite(ts) && ts >= 0) {
    lastRemoteUpdatedAt = ts;
  }
}

function dispatchStatus(s: RemoteSyncStatus): void {
  lastStatus = s;
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_STATUS_EVENT, { detail: s }));
}

function handleVersionConflict(): void {
  remoteSyncLocked = true;
  dispatchStatus('version_conflict');
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_VERSION_CONFLICT_EVENT));
}

function isVersionConflictError(e: unknown): boolean {
  return e instanceof RemoteVersionConflictError;
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function isNetworkishError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('network request failed')
  );
}

function statusFromResponse(res: Response): RemoteSyncStatus {
  if (res.status === 401 || res.status === 403) return 'auth_error';
  return 'error';
}

function prepareBundleForPush(bundleText?: string): ShengwatchDataBundleV1 {
  if (bundleText) {
    const bundle = parseBundleJson(bundleText) as ShengwatchDataBundleV1;
    bundle.updatedAt = Date.now();
    return bundle;
  }
  return buildShengwatchDataBundleForPush();
}

export function isRemoteBundleEffectivelyEmpty(bundle: ShengwatchDataBundleV1 | null | undefined): boolean {
  if (bundle == null) return true;
  const keys = bundle.keys;
  if (keys == null || typeof keys !== 'object' || Array.isArray(keys)) return true;
  for (const [, v] of Object.entries(keys)) {
    if (v != null && String(v).length > 0) return false;
  }
  return true;
}

export function localExportStorageHasData(): boolean {
  for (const k of SHENGWATCH_EXPORT_STORAGE_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null && v !== '') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function storageTick(): Promise<void> {
  const ms = getAsyncStorageDelayMs();
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

export async function fetchRemoteBundle(): Promise<ShengwatchDataBundleV1> {
  const token = getApiSyncToken();
  if (!token) {
    throw new Error('遠端同步缺少 VITE_API_SYNC_TOKEN。');
  }
  const res = await fetch(buildApiUrl('/sync-bundle'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`GET ${res.status}`), { syncStatus: statusFromResponse(res) });
  }
  const body = (await res.json()) as { ok?: boolean; bundle?: ShengwatchDataBundleV1 };
  if (!body?.ok || !body.bundle) {
    throw new Error('遠端同步回應格式錯誤。');
  }
  noteRemoteBundleUpdatedAt(body.bundle);
  return body.bundle;
}

export async function pushRemoteBundle(bundleText?: string): Promise<void> {
  const token = getApiSyncToken();
  if (!token) {
    throw new Error('遠端同步缺少 VITE_API_SYNC_TOKEN。');
  }

  const bundle = prepareBundleForPush(bundleText);
  const res = await fetch(buildApiUrl('/sync-bundle'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      bundle,
      syncedFromUpdatedAt: lastRemoteUpdatedAt,
    }),
  });

  if (res.status === 409) {
    handleVersionConflict();
    throw new RemoteVersionConflictError();
  }

  if (!res.ok) {
    throw Object.assign(new Error(`PUT ${res.status}`), { syncStatus: statusFromResponse(res) });
  }

  noteRemoteBundleUpdatedAt(bundle);
}

function applySyncFailureFromUnknown(e: unknown): void {
  if (isVersionConflictError(e)) return;
  if (e && typeof e === 'object' && 'syncStatus' in e) {
    const s = (e as { syncStatus?: RemoteSyncStatus }).syncStatus;
    if (s === 'auth_error' || s === 'error') {
      dispatchStatus(s);
      return;
    }
  }
  if (isNetworkishError(e)) dispatchStatus('offline');
  else dispatchStatus('error');
}

export async function initRemoteSyncOnAppLoad(): Promise<void> {
  if (getStorageMode() !== 'remote') {
    dispatchStatus('idle');
    return;
  }

  remoteSyncLocked = false;
  dispatchStatus('idle');

  try {
    const bundle = await fetchRemoteBundle();

    if (!isRemoteBundleEffectivelyEmpty(bundle)) {
      const result = importShengwatchDataBundle(bundle);
      if (!result.ok) {
        dispatchStatus('error');
        return;
      }
      noteRemoteBundleUpdatedAt(bundle);
    } else if (localExportStorageHasData()) {
      await pushRemoteBundle();
    }

    dispatchStatus('ok');
  } catch (e) {
    applySyncFailureFromUnknown(e);
  }
}

export async function pushRemoteIfLocalBundleChangedSince(snapshot: string): Promise<void> {
  if (getStorageMode() !== 'remote' || remoteSyncLocked) return;
  const now = serializeShengwatchDataBundle(buildShengwatchDataBundleForPush());
  if (now === snapshot) return;
  try {
    await pushRemoteBundle(now);
    dispatchStatus('ok');
  } catch (e) {
    applySyncFailureFromUnknown(e);
  }
}

export async function syncRemoteAfterDirectLocalMutation(): Promise<void> {
  if (getStorageMode() !== 'remote' || remoteSyncLocked) return;
  try {
    await pushRemoteBundle();
    dispatchStatus('ok');
  } catch (e) {
    applySyncFailureFromUnknown(e);
  }
}

export async function withRemoteStorageRead<T>(fn: () => T | Promise<T>): Promise<T> {
  await storageTick();
  return await Promise.resolve(fn());
}

export async function withRemoteStorageWrite<T>(fn: () => T | Promise<T>): Promise<T> {
  await storageTick();
  if (getStorageMode() !== 'remote') {
    return await Promise.resolve(fn());
  }

  const before = serializeShengwatchDataBundle(buildShengwatchDataBundleForPush());
  const out = await Promise.resolve(fn());
  const after = serializeShengwatchDataBundle(buildShengwatchDataBundleForPush());

  if (after === before) {
    return out;
  }

  if (remoteSyncLocked) {
    handleVersionConflict();
    return out;
  }

  try {
    await pushRemoteBundle(after);
    dispatchStatus('ok');
  } catch (e) {
    if (isVersionConflictError(e)) {
      return out;
    }
    applySyncFailureFromUnknown(e);
  }

  return out;
}
