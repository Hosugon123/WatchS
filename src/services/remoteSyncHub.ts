/**
 * 雲端 bundle 同步（VITE_STORAGE_MODE=remote）：啟動拉取、寫入後推送、狀態廣播。
 */
import {
  SHENGWATCH_EXPORT_STORAGE_KEYS,
  buildShengwatchDataBundleForPush,
  dispatchShengwatchStorageSyncEvents,
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
  | 'storage_error'
  | 'error'
  | 'version_conflict'
  | 'stale';

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
let refreshInFlight = false;
let listenersStarted = false;

const SESSION_KEY_PREFIX = 'shengwatch_session';

export function getRemoteSyncStatus(): RemoteSyncStatus {
  return lastStatus;
}

export function isRemoteSyncLocked(): boolean {
  return remoteSyncLocked;
}

export function unlockRemoteSync(): void {
  remoteSyncLocked = false;
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
  if (res.status === 503) return 'storage_error';
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

  const body = (await res.json()) as { ok?: boolean; bundle?: ShengwatchDataBundleV1 };
  if (body?.bundle) {
    noteRemoteBundleUpdatedAt(body.bundle);
  } else {
    noteRemoteBundleUpdatedAt(bundle);
  }
}

function applySyncFailureFromUnknown(e: unknown): void {
  if (isVersionConflictError(e)) return;
  if (e && typeof e === 'object' && 'syncStatus' in e) {
    const s = (e as { syncStatus?: RemoteSyncStatus }).syncStatus;
    if (s === 'auth_error' || s === 'storage_error' || s === 'error') {
      dispatchStatus(s);
      return;
    }
  }
  if (isNetworkishError(e)) dispatchStatus('offline');
  else dispatchStatus('error');
}

/** 從雲端重新載入（版本衝突後由使用者確認）。 */
export async function reloadFromRemoteAfterConflict(): Promise<void> {
  unlockRemoteSync();
  const bundle = await fetchRemoteBundle();
  if (!isRemoteBundleEffectivelyEmpty(bundle)) {
    const result = importShengwatchDataBundle(bundle);
    if (!result.ok) {
      dispatchStatus('error');
      return;
    }
  }
  noteRemoteBundleUpdatedAt(bundle);
  dispatchStatus('ok');
}

/** 若雲端比本機記憶的版本新，標記為 stale（不自動覆寫本機）。 */
export async function checkRemoteNewer(): Promise<void> {
  if (getStorageMode() !== 'remote' || remoteSyncLocked || refreshInFlight) return;
  refreshInFlight = true;
  try {
    const bundle = await fetchRemoteBundle();
    const remoteTs = bundle.updatedAt ?? 0;
    if (remoteTs > lastRemoteUpdatedAt && !isRemoteBundleEffectivelyEmpty(bundle)) {
      dispatchStatus('stale');
    } else if (lastStatus === 'stale') {
      dispatchStatus('ok');
    }
  } catch (e) {
    applySyncFailureFromUnknown(e);
  } finally {
    refreshInFlight = false;
  }
}

/** 載入雲端較新版本（stale 橫幅用）。 */
export async function applyRemoteIfNewer(): Promise<boolean> {
  if (getStorageMode() !== 'remote') return false;
  unlockRemoteSync();
  try {
    const bundle = await fetchRemoteBundle();
    const remoteTs = bundle.updatedAt ?? 0;
    if (remoteTs <= lastRemoteUpdatedAt || isRemoteBundleEffectivelyEmpty(bundle)) {
      dispatchStatus('ok');
      return false;
    }
    const result = importShengwatchDataBundle(bundle);
    if (!result.ok) {
      dispatchStatus('error');
      return false;
    }
    noteRemoteBundleUpdatedAt(bundle);
    dispatchStatus('ok');
    return true;
  } catch (e) {
    applySyncFailureFromUnknown(e);
    return false;
  }
}

export async function initRemoteSyncOnAppLoad(): Promise<void> {
  if (getStorageMode() !== 'remote') {
    dispatchStatus('idle');
    return;
  }

  if (!getApiSyncToken()) {
    dispatchStatus('auth_error');
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

export function startRemoteSyncListeners(): void {
  if (getStorageMode() !== 'remote' || listenersStarted) return;
  listenersStarted = true;

  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.startsWith(SESSION_KEY_PREFIX)) return;
    if (!SHENGWATCH_EXPORT_STORAGE_KEYS.includes(e.key as (typeof SHENGWATCH_EXPORT_STORAGE_KEYS)[number])) {
      return;
    }
    dispatchShengwatchStorageSyncEvents();
    if (lastStatus === 'stale' || lastStatus === 'version_conflict') return;
    dispatchStatus('ok');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkRemoteNewer();
    }
  });

  window.addEventListener('focus', () => {
    void checkRemoteNewer();
  });
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
