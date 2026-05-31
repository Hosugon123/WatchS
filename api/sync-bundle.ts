import type { ShengwatchDataBundleV1 } from '../src/lib/appDataBundle';
import { assertSyncAuthorized } from './_lib/auth';
import { bundleUpdatedAt, shouldRejectPush } from './_lib/bundleConflict';
import {
  getBundleForGet,
  isRedisConfigured,
  loadServerBundle,
  saveServerBundle,
  storageUnavailableResponse,
} from './_lib/syncStore';

export const config = {
  runtime: 'nodejs',
};

type PutBody = {
  bundle?: ShengwatchDataBundleV1;
  syncedFromUpdatedAt?: number;
};

function isValidBundle(b: unknown): b is ShengwatchDataBundleV1 {
  if (b == null || typeof b !== 'object') return false;
  const o = b as ShengwatchDataBundleV1;
  return o.app === 'shengwatch' && o.format === 'shengwatch-localStorage-snapshot-v1' && o.bundleVersion === 1;
}

export async function GET(req: Request): Promise<Response> {
  const authErr = assertSyncAuthorized(req);
  if (authErr) return authErr;

  if (!isRedisConfigured()) {
    return storageUnavailableResponse();
  }

  const stored = await loadServerBundle();
  return Response.json({ ok: true, bundle: getBundleForGet(stored) });
}

export async function PUT(req: Request): Promise<Response> {
  const authErr = assertSyncAuthorized(req);
  if (authErr) return authErr;

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return Response.json({ ok: false, error: 'JSON 格式錯誤' }, { status: 400 });
  }

  if (!isValidBundle(body.bundle)) {
    return Response.json({ ok: false, error: 'bundle 格式不符' }, { status: 400 });
  }

  if (!isRedisConfigured()) {
    return storageUnavailableResponse();
  }

  const stored = await loadServerBundle();

  if (shouldRejectPush(stored, body.syncedFromUpdatedAt)) {
    return Response.json(
      {
        ok: false,
        code: 'VERSION_CONFLICT',
        serverUpdatedAt: bundleUpdatedAt(stored),
      },
      { status: 409 },
    );
  }

  const bundle: ShengwatchDataBundleV1 = {
    ...body.bundle,
    updatedAt: Date.now(),
  };

  try {
    await saveServerBundle(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '儲存失敗';
    if (msg === 'KV_NOT_CONFIGURED') return storageUnavailableResponse();
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }

  return Response.json({ ok: true, bundle });
}
