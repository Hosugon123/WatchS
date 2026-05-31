import type { ShengwatchDataBundleV1 } from './bundleTypes';
import { KV_BUNDLE_KEY, emptyRemoteBundle } from './bundleConflict';

type RedisClient = import('@upstash/redis').Redis;

let redisModule: typeof import('@upstash/redis') | null = null;

async function loadRedisModule(): Promise<typeof import('@upstash/redis') | null> {
  if (redisModule) return redisModule;
  try {
    redisModule = await import('@upstash/redis');
    return redisModule;
  } catch {
    return null;
  }
}

function readRedisEnv(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    '';
  if (!url || !token) return null;
  return { url, token };
}

async function redisClient(): Promise<RedisClient | null> {
  const env = readRedisEnv();
  if (!env) return null;
  const mod = await loadRedisModule();
  if (!mod) return null;
  try {
    return new mod.Redis({ url: env.url, token: env.token });
  } catch {
    return null;
  }
}

export async function loadServerBundle(): Promise<ShengwatchDataBundleV1 | null> {
  const redis = await redisClient();
  if (!redis) return null;
  try {
    const v = await redis.get<ShengwatchDataBundleV1>(KV_BUNDLE_KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveServerBundle(bundle: ShengwatchDataBundleV1): Promise<void> {
  const redis = await redisClient();
  if (!redis) {
    throw new Error('KV_NOT_CONFIGURED');
  }
  await redis.set(KV_BUNDLE_KEY, bundle);
}

export function storageUnavailableResponse(): Response {
  const env = readRedisEnv();
  const hint = env
    ? 'Redis 連線參數已存在，但 @upstash/redis 模組無法載入。'
    : '缺少 UPSTASH_REDIS_REST_* 或 KV_REST_API_URL / KV_REST_API_TOKEN。';
  return Response.json(
    {
      ok: false,
      error: `雲端儲存未設定。${hint}`,
    },
    { status: 503 },
  );
}

export function getBundleForGet(stored: ShengwatchDataBundleV1 | null): ShengwatchDataBundleV1 {
  return stored ?? emptyRemoteBundle();
}

export async function isRedisConfigured(): Promise<boolean> {
  return (await redisClient()) != null;
}
