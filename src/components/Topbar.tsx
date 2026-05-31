import { useState } from 'react';
import { Bell, KeyRound, LogOut, Search } from 'lucide-react';
import { MobileMenuButton } from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { accounts } from '@/services/watchApiService';
import Modal, { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '@/components/Modal';

type TopbarProps = {
  title: string;
  onMenuClick: () => void;
  onLogout: () => void;
};

function avatarChar(name: string): string {
  const t = name.trim();
  return t ? ([...t][0] ?? '?') : '?';
}

export default function Topbar({ title, onMenuClick, onLogout }: TopbarProps) {
  const { user, session } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const displayName = user?.name ?? session?.loginId ?? '';
  const roleLabel = user?.role === 'admin' ? 'BOSS' : '員工';

  const submitPassword = async () => {
    if (!session?.loginId) return;
    if (newPwd.length < 4) {
      setPwdErr('新密碼至少需 4 個字元。');
      return;
    }
    if (newPwd !== newPwd2) {
      setPwdErr('兩次輸入的新密碼不一致。');
      return;
    }
    setPwdErr(null);
    setPwdBusy(true);
    try {
      await accounts.changeOwnPassword(session.loginId, curPwd, newPwd);
      setPwdOpen(false);
      setCurPwd('');
      setNewPwd('');
      setNewPwd2('');
      alert('密碼已更新。');
    } catch (e) {
      setPwdErr(e instanceof Error ? e.message : '變更失敗');
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur md:px-6">
        <MobileMenuButton onClick={onMenuClick} />

        <h1 className="hidden text-base font-semibold text-slate-800 md:block">{title}</h1>

        <div className="mx-auto hidden max-w-md flex-1 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="搜尋品牌、型號、客戶…"
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="通知">
            <Bell className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="變更密碼"
            onClick={() => {
              setPwdErr(null);
              setCurPwd('');
              setNewPwd('');
              setNewPwd2('');
              setPwdOpen(true);
            }}
          >
            <KeyRound className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="登出"
            onClick={() => {
              if (window.confirm('確定要登出？')) onLogout();
            }}
          >
            <LogOut className="h-5 w-5" />
          </button>
          <div className="ml-1 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-bold text-white">
              {avatarChar(displayName)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold text-slate-800">{displayName}</p>
              <p className="text-[10px] text-amber-700">{roleLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <Modal open={pwdOpen} title="變更登入密碼" onClose={() => setPwdOpen(false)}>
        {pwdErr && <p className="mb-3 text-sm text-red-600">{pwdErr}</p>}
        <div className="space-y-3">
          <div>
            <FieldLabel>目前密碼</FieldLabel>
            <TextInput type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <FieldLabel>新密碼</FieldLabel>
            <TextInput type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <FieldLabel>再次輸入新密碼</FieldLabel>
            <TextInput type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <SecondaryButton onClick={() => setPwdOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitPassword()} disabled={pwdBusy}>
            {pwdBusy ? '儲存中…' : '確認變更'}
          </PrimaryButton>
        </div>
      </Modal>
    </>
  );
}
