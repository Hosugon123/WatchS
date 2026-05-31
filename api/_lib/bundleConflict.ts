import type { ShengwatchDataBundleV1 } from './bundleTypes';
import { SHENGWATCH_APP_ID, SHENGWATCH_BUNDLE_FORMAT, SHENGWATCH_DATA_BUNDLE_VERSION } from './bundleTypes';

export const KV_BUNDLE_KEY = 'shengwatch:bundle:v1';

export function bundleUpdatedAt(bundle: ShengwatchDataBundleV1 | null | undefined): number {
  const ts = bundle?.updatedAt;
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0) return 0;
  return ts;
}

/** 客戶端推送時若雲端已有較新版本，拒絕覆寫（409）。 */
export function shouldRejectPush(
  serverBundle: ShengwatchDataBundleV1 | null | undefined,
  syncedFromUpdatedAt: number | null | undefined,
): boolean {
  const serverTs = bundleUpdatedAt(serverBundle);
  if (serverTs <= 0) return false;
  const clientBase =
    typeof syncedFromUpdatedAt === 'number' && Number.isFinite(syncedFromUpdatedAt)
      ? Math.max(0, syncedFromUpdatedAt)
      : 0;
  return serverTs > clientBase;
}

export function emptyRemoteBundle(): ShengwatchDataBundleV1 {
  return {
    bundleVersion: SHENGWATCH_DATA_BUNDLE_VERSION,
    app: SHENGWATCH_APP_ID,
    exportedAt: new Date(0).toISOString(),
    updatedAt: 0,
    format: SHENGWATCH_BUNDLE_FORMAT,
    keys: {},
  };
}

export function isValidBundle(b: unknown): b is ShengwatchDataBundleV1 {
  if (b == null || typeof b !== 'object') return false;
  const o = b as ShengwatchDataBundleV1;
  return o.app === SHENGWATCH_APP_ID && o.format === SHENGWATCH_BUNDLE_FORMAT && o.bundleVersion === 1;
}
