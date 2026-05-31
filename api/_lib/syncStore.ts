import { Redis } from '@upstash/redis';
import type { ShengwatchDataBundleV1 } from './bundleTypes';
import { KV_BUNDLE_KEY, emptyRemoteBundle } from './bundleConflict';

function redisClient(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    '';
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

export async function loadServerBundle(): Promise<ShengwatchDataBundleV1 | null> {
  const redis = redisClient();
  if (!redis) return null;
  try {
    const v = await redis.get<ShengwatchDataBundleV1>(KV_BUNDLE_KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveServerBundle(bundle: ShengwatchDataBundleV1): Promise<void> {
  const redis = redisClient();
  if (!redis) {
    throw new Error('KV_NOT_CONFIGURED');
  }
  await redis.set(KV_BUNDLE_KEY, bundle);
}

export function storageUnavailableResponse(): Response {
  return Response.json(
    {
      ok: false,
      error:
        '雲端儲存未設定。請在 Vercel 專案安裝 Upstash Redis，並確認已注入 UPSTASH_REDIS_REST_* 或 KV_REST_API_*。',
    },
    { status: 503 },
  );
}

export function getBundleForGet(stored: ShengwatchDataBundleV1 | null): ShengwatchDataBundleV1 {
  return stored ?? emptyRemoteBundle();
}

export function isRedisConfigured(): boolean {
  return redisClient() != null;
}
