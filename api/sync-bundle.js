/**
 * 雲端 bundle 同步（與東山鴨頭相同：Vercel handler(req,res) + REDIS_URL）
 * 使用 Vercel Upstash 整合自動注入的 REDIS_URL，不依賴 @upstash/redis。
 */
import { createClient } from 'redis';

const KV_KEY = 'shengwatch:bundle:v1';
const REDIS_ENV_KEY = 'REDIS_URL';
const APP_ID = 'shengwatch';
const BUNDLE_FORMAT = 'shengwatch-localStorage-snapshot-v1';

/** @type {import('redis').RedisClientType | null} */
let redisClient = null;
let redisConnecting = null;

async function getRedis() {
  if (redisClient && redisClient.isOpen) return redisClient;
  if (redisConnecting) return redisConnecting;

  const url = String(process.env[REDIS_ENV_KEY] || '').trim();
  if (!url) {
    throw new Error(`Missing required environment variable ${REDIS_ENV_KEY}`);
  }

  const client = createClient({ url });
  client.on('error', () => {});

  redisConnecting = client.connect().then(() => {
    redisClient = client;
    return client;
  });

  try {
    return await redisConnecting;
  } finally {
    redisConnecting = null;
  }
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

function readBearer(req) {
  const raw = String(req.headers.authorization || '');
  if (!raw.startsWith('Bearer ')) return '';
  return raw.slice('Bearer '.length).trim();
}

function emptyBundle() {
  return {
    bundleVersion: 1,
    app: APP_ID,
    exportedAt: new Date(0).toISOString(),
    updatedAt: 0,
    format: BUNDLE_FORMAT,
    keys: {},
  };
}

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: message });
}

function internalError(res, e) {
  const message = e instanceof Error ? e.message : 'unknown error';
  return res.status(500).json({ ok: false, error: 'sync bundle failed', message });
}

function versionConflict(res, serverUpdatedAt) {
  return res.status(409).json({
    ok: false,
    code: 'VERSION_CONFLICT',
    serverUpdatedAt,
    message: '雲端已有更新的資料',
  });
}

function parseJsonBodyMaybe(body) {
  if (body == null) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (typeof body === 'object' && !Array.isArray(body)) return body;
  return null;
}

function readUpdatedAt(bundle) {
  const ts = bundle?.updatedAt;
  return typeof ts === 'number' && Number.isFinite(ts) ? ts : 0;
}

function isValidBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false;
  return bundle.app === APP_ID && bundle.format === BUNDLE_FORMAT && bundle.bundleVersion === 1;
}

function isCloudBundleEmpty(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return true;
  const keys = bundle.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return true;
  for (const value of Object.values(keys)) {
    if (value != null && String(value).length > 0) return false;
  }
  return true;
}

function shouldRejectPush(serverBundle, syncedFromUpdatedAt) {
  const serverTs = readUpdatedAt(serverBundle);
  if (serverTs <= 0) return false;
  const clientBase =
    typeof syncedFromUpdatedAt === 'number' && Number.isFinite(syncedFromUpdatedAt)
      ? Math.max(0, syncedFromUpdatedAt)
      : 0;
  return serverTs > clientBase;
}

export default async function handler(req, res) {
  try {
    const expected = String(process.env.API_SYNC_TOKEN || '').trim();
    const got = readBearer(req);
    if (!expected) {
      return res.status(503).json({ ok: false, error: '伺服器未設定 API_SYNC_TOKEN' });
    }
    if (!got || got !== expected) {
      return unauthorized(res);
    }

    const redis = await getRedis();

    if (req.method === 'GET') {
      const raw = await redis.get(KV_KEY);
      const stored = parseJsonBodyMaybe(raw);
      if (stored && typeof stored === 'object' && isValidBundle(stored)) {
        return res.status(200).json({ ok: true, bundle: stored });
      }
      return res.status(200).json({ ok: true, bundle: emptyBundle() });
    }

    if (req.method === 'PUT') {
      const body = parseJsonBodyMaybe(req.body);
      if (!body) return badRequest(res, 'invalid json body');

      const bundle = body.bundle;
      if (!isValidBundle(bundle)) {
        return badRequest(res, 'invalid bundle');
      }

      const rawCloud = await redis.get(KV_KEY);
      const cloudBundle = parseJsonBodyMaybe(rawCloud);
      const syncedFromUpdatedAt =
        typeof body.syncedFromUpdatedAt === 'number' && Number.isFinite(body.syncedFromUpdatedAt)
          ? body.syncedFromUpdatedAt
          : 0;

      if (shouldRejectPush(cloudBundle, syncedFromUpdatedAt)) {
        return versionConflict(res, readUpdatedAt(cloudBundle));
      }

      const storedBundle = {
        ...bundle,
        updatedAt: Date.now(),
      };

      await redis.set(KV_KEY, JSON.stringify(storedBundle));
      return res.status(200).json({ ok: true, bundle: storedBundle });
    }

    return res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (e) {
    return internalError(res, e);
  }
}
