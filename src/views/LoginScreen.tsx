import { useState, type FormEvent } from 'react';
import { Lock, User, Watch } from 'lucide-react';
import { tryLogin } from '@/lib/authSession';

type LoginScreenProps = {
  onSuccess: () => void;
};

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = tryLogin(loginId, password);
    setBusy(false);
    if (r.ok) onSuccess();
    else setError(r.message);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-900 px-4 py-10 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-lg">
            <Watch className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">職人手錶進銷存</h1>
          <p className="mt-1 text-sm text-slate-400">請使用管理員核發的帳號登入</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">登入帳號</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900/80 py-2.5 pl-10 pr-4 text-slate-50 outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900/80 py-2.5 pl-10 pr-4 text-slate-50 outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-amber-600 py-3 text-sm font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? '登入中…' : '登入系統'}
          </button>

          <p className="text-center text-xs text-slate-500">
            首次安裝預設管理員：<span className="font-mono text-amber-400/90">sw001</span>／密碼{' '}
            <span className="font-mono text-amber-400/90">1234</span>（請登入後立即變更）
          </p>
        </form>
      </div>
    </div>
  );
}
