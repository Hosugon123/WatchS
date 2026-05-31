import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { getStorageMode } from '@/services/storageMode';
import {
  REMOTE_SYNC_STATUS_EVENT,
  applyRemoteIfNewer,
  getRemoteSyncStatus,
  reloadFromRemoteAfterConflict,
  type RemoteSyncStatus,
} from '@/services/remoteSyncHub';

function statusMessage(status: RemoteSyncStatus): string | null {
  switch (status) {
    case 'version_conflict':
      return '雲端資料已被其他裝置更新。為避免覆蓋他人修改，已暫停自動同步。請載入雲端最新資料後再繼續操作。';
    case 'stale':
      return '雲端有較新的資料。請先載入最新內容，以免儲存時發生衝突或資料回溯。';
    case 'offline':
      return '目前無法連線雲端，變更僅保存在此瀏覽器。恢復連線後請重新整理頁面。';
    case 'auth_error':
      return '雲端同步授權失敗，請確認 Vercel 環境變數 VITE_API_SYNC_TOKEN 與 API_SYNC_TOKEN 完全相同，並重新 Deploy。';
    case 'storage_error':
      return '雲端 Redis 未就緒（503）。請確認 Vercel 已安裝 Upstash 且存在 REDIS_URL、API_SYNC_TOKEN。';
    case 'error':
      return '雲端同步發生錯誤（500）。請到 Vercel → Deployments → Functions 查看 sync-bundle 日誌，並確認已 Redeploy 最新程式。';
    default:
      return null;
  }
}

export default function RemoteSyncBanner() {
  const [status, setStatus] = useState<RemoteSyncStatus>(() => getRemoteSyncStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getStorageMode() !== 'remote') return;
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<RemoteSyncStatus>).detail;
      if (detail) setStatus(detail);
      else setStatus(getRemoteSyncStatus());
    };
    window.addEventListener(REMOTE_SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(REMOTE_SYNC_STATUS_EVENT, onStatus);
  }, []);

  const message = statusMessage(status);
  const show =
    getStorageMode() === 'remote' &&
    (status === 'version_conflict' ||
      status === 'stale' ||
      status === 'offline' ||
      status === 'auth_error' ||
      status === 'storage_error' ||
      status === 'error');

  const onReload = useCallback(async () => {
    setBusy(true);
    try {
      if (status === 'version_conflict') {
        await reloadFromRemoteAfterConflict();
      } else {
        await applyRemoteIfNewer();
      }
      setStatus(getRemoteSyncStatus());
    } finally {
      setBusy(false);
    }
  }, [status]);

  if (!show || !message) return null;

  const isDanger = status === 'version_conflict' || status === 'auth_error' || status === 'storage_error';

  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm md:px-6 ${
        isDanger ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-sky-200 bg-sky-50 text-sky-950'
      }`}
      role="status"
    >
      {status === 'offline' ? (
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      )}
      <p className="min-w-0 flex-1">{message}</p>
      {(status === 'version_conflict' || status === 'stale') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onReload()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          {busy ? '載入中…' : '載入雲端最新'}
        </button>
      )}
    </div>
  );
}
