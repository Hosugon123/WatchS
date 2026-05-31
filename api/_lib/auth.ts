export function readBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() ?? null;
}

export function assertSyncAuthorized(req: Request): Response | null {
  const expected = String(process.env.API_SYNC_TOKEN ?? '').trim();
  if (!expected) {
    return Response.json(
      { ok: false, error: '伺服器未設定 API_SYNC_TOKEN，無法同步。' },
      { status: 503 },
    );
  }
  const token = readBearerToken(req);
  if (!token || token !== expected) {
    return Response.json({ ok: false, error: '同步授權失敗' }, { status: 401 });
  }
  return null;
}
