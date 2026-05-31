import type { ShengwatchDataBundleV1 } from '../../src/lib/appDataBundle';

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
    bundleVersion: 1,
    app: 'shengwatch',
    exportedAt: new Date(0).toISOString(),
    updatedAt: 0,
    format: 'shengwatch-localStorage-snapshot-v1',
    keys: {},
  };
}
