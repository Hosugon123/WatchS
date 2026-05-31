import { assertSyncAuthorized } from './_lib/auth';
import { bundleUpdatedAt, isValidBundle, shouldRejectPush } from './_lib/bundleConflict';
import type { ShengwatchDataBundleV1 } from './_lib/bundleTypes';
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

function internalErrorResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : 'unknown error';
  return Response.json({ ok: false, error: 'sync bundle failed', message }, { status: 500 });
}

async function handleGet(req: Request): Promise<Response> {
  const authErr = assertSyncAuthorized(req);
  if (authErr) return authErr;

  if (!isRedisConfigured()) {
    return storageUnavailableResponse();
  }

  const stored = await loadServerBundle();
  return Response.json({ ok: true, bundle: getBundleForGet(stored) });
}

async function handlePut(req: Request): Promise<Response> {
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
    ...body.bundle!,
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

/** Vercel Web Handler（fetch 入口，相容 Vite 非 Next 專案） */
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method === 'GET') return await handleGet(request);
      if (request.method === 'PUT') return await handlePut(request);
      return Response.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
    } catch (e) {
      return internalErrorResponse(e);
    }
  },
};

/** 保留具名匯出，供部分執行環境使用 */
export async function GET(req: Request): Promise<Response> {
  try {
    return await handleGet(req);
  } catch (e) {
    return internalErrorResponse(e);
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    return await handlePut(req);
  } catch (e) {
    return internalErrorResponse(e);
  }
}
