import { Edit, KeyRound, Search, Shield, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { accounts } from '@/services/watchApiService';
import { useAuth } from '@/contexts/AuthContext';
import { useIsNarrowScreen } from '@/hooks/useIsNarrowScreen';
import { isPrimarySuperAdminUser, SYSTEM_USERS_UPDATED_EVENT, type SystemUser } from '@/lib/systemUsersStorage';
import { PERMISSION_GROUPS, type PermissionKey } from '@/types/permissions';
import { cn } from '@/lib/utils';

function avatarChar(name: string): string {
  const t = name.trim();
  return t ? ([...t][0] ?? '?') : '?';
}

function roleLabel(role: SystemUser['role']): string {
  return role === 'admin' ? 'BOSS' : '員工';
}

function PermissionChecklist({
  value,
  onChange,
  disabled,
}: {
  value: Partial<Record<PermissionKey, boolean>>;
  onChange: (next: Partial<Record<PermissionKey, boolean>>) => void;
  disabled?: boolean;
}) {
  const toggle = (key: PermissionKey, checked: boolean) => {
    onChange({ ...value, [key]: checked });
  };

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
          <div className="space-y-2">
            {group.keys.map(({ key, label, hint }) => (
              <label
                key={key}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={value[key] === true}
                  disabled={disabled}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                  {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserRowActions({
  onEdit,
  onResetPassword,
  compact,
}: {
  onEdit: () => void;
  onResetPassword: () => void;
  compact?: boolean;
}) {
  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800';
  return (
    <div className={cn('flex flex-wrap gap-2', compact ? '' : 'justify-end')}>
      <button type="button" className={btn} onClick={onEdit}>
        <Edit className="h-3.5 w-3.5" />
        編輯
      </button>
      <button type="button" className={btn} onClick={onResetPassword}>
        <KeyRound className="h-3.5 w-3.5" />
        重設密碼
      </button>
    </div>
  );
}

export default function UserPermissions() {
  const { isSuperAdmin, can } = useAuth();
  const canManage = can('manage_users');
  const narrow = useIsNarrowScreen();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [pwdFor, setPwdFor] = useState<SystemUser | null>(null);

  const [addName, setAddName] = useState('');
  const [addLoginId, setAddLoginId] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addPerms, setAddPerms] = useState<Partial<Record<PermissionKey, boolean>>>({
    view_dashboard: true,
    view_inventory: true,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [editName, setEditName] = useState('');
  const [editLoginId, setEditLoginId] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<SystemUser['status']>('active');
  const [editPerms, setEditPerms] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const [pwdNew, setPwdNew] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await accounts.listUsers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const on = () => void refresh();
    window.addEventListener(SYSTEM_USERS_UPDATED_EVENT, on);
    return () => window.removeEventListener(SYSTEM_USERS_UPDATED_EVENT, on);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.loginId ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const openEdit = (u: SystemUser) => {
    setEditing(u);
    setEditError(null);
    setEditName(u.name);
    setEditLoginId(u.loginId ?? '');
    setEditEmail(u.email);
    setEditPhone(u.phone);
    setEditStatus(u.status);
    setEditPerms({ ...u.permissions });
  };

  const openPasswordReset = (u: SystemUser) => {
    setPwdError(null);
    setPwdNew('');
    setPwdNew2('');
    setPwdFor(u);
  };

  const submitAdd = async () => {
    setAddError(null);
    setAddBusy(true);
    try {
      await accounts.createUser({
        name: addName,
        role: 'staff',
        email: addEmail,
        phone: addPhone,
        loginId: addLoginId,
        initialPassword: addPassword,
        permissions: addPerms,
      });
      setAddOpen(false);
      await refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '新增失敗');
    } finally {
      setAddBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setEditError(null);
    setEditBusy(true);
    try {
      await accounts.updateUser(editing.id, {
        name: editName,
        loginId: isPrimarySuperAdminUser(editing) ? editing.loginId : editLoginId,
        email: editEmail,
        phone: editPhone,
        status: isPrimarySuperAdminUser(editing) ? 'active' : editStatus,
        permissions: editing.role === 'staff' ? editPerms : undefined,
      });
      setEditing(null);
      await refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setEditBusy(false);
    }
  };

  const submitPwdReset = async () => {
    if (!pwdFor?.loginId) {
      setPwdError('此使用者尚未設定登入帳號。');
      return;
    }
    if (pwdNew.length < 4) {
      setPwdError('新密碼至少需 4 個字元。');
      return;
    }
    if (pwdNew !== pwdNew2) {
      setPwdError('兩次輸入的新密碼不一致。');
      return;
    }
    setPwdError(null);
    setPwdBusy(true);
    try {
      await accounts.setUserPassword(pwdFor.loginId, pwdNew);
      setPwdFor(null);
      setPwdNew('');
      setPwdNew2('');
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : '重設失敗');
    } finally {
      setPwdBusy(false);
    }
  };

  const removeUser = async () => {
    if (!editing || !isSuperAdmin) return;
    if (!window.confirm(`確定刪除「${editing.name}」？此操作無法復原。`)) return;
    setEditBusy(true);
    try {
      await accounts.removeUser(editing.id);
      setEditing(null);
      await refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setEditBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center text-amber-900">
        您沒有「帳號與權限設定」權限。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Shield className="h-6 w-6 text-amber-600" />
            帳號與權限
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            管理登入帳號，並以勾選方式下放各功能權限給員工帳號。
            {!isSuperAdmin && ' 新增／刪除帳號僅限主要管理員（sw001）。'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddName('');
              setAddLoginId('');
              setAddEmail('');
              setAddPhone('');
              setAddPassword('');
              setAddPerms({ view_dashboard: true, view_inventory: true });
              setAddOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            <UserPlus className="h-4 w-4" />
            新增員工帳號
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋名稱、登入帳號、信箱…"
          className="w-full rounded-full border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </div>

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">載入中…</p>
      ) : narrow ? (
        <div className="space-y-3">
          {filtered.map((u) => (
            <article
              key={u.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                  {avatarChar(u.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{u.name}</p>
                  <p className="mt-0.5 font-mono text-sm text-amber-800">{u.loginId ?? '—'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {roleLabel(u.role)}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        u.status === 'active' ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {u.status === 'active' ? '啟用' : '停權'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <UserRowActions
                  compact
                  onEdit={() => openEdit(u)}
                  onResetPassword={() => openPasswordReset(u)}
                />
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-400">
              沒有符合條件的使用者。
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">使用者</th>
                <th className="px-4 py-3 font-medium">登入帳號</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-slate-100 hover:bg-slate-50/50"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left hover:opacity-80"
                      onClick={() => openEdit(u)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                        {avatarChar(u.name)}
                      </span>
                      <span className="font-medium text-slate-900 underline-offset-2 hover:underline">
                        {u.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-800">{u.loginId ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        u.status === 'active' ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {u.status === 'active' ? '啟用' : '停權'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <UserRowActions
                      onEdit={() => openEdit(u)}
                      onResetPassword={() => openPasswordReset(u)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">沒有符合條件的使用者。</p>
          )}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-bold text-slate-900">新增員工帳號</h3>
              <button type="button" onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <label className="block text-sm">
                <span className="font-medium text-slate-700">使用者名稱</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">登入帳號</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
                  value={addLoginId}
                  onChange={(e) => setAddLoginId(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">初始密碼</span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">電子信箱</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">電話（選填）</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                />
              </label>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">功能權限</p>
                <PermissionChecklist value={addPerms} onChange={setAddPerms} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button
                type="button"
                disabled={addBusy}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                onClick={() => void submitAdd()}
              >
                {addBusy ? '儲存中…' : '建立帳號'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-bold text-slate-900">編輯帳號與權限</h3>
              <button type="button" onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <label className="block text-sm">
                <span className="font-medium text-slate-700">使用者名稱</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">登入帳號</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono disabled:bg-slate-100"
                  value={editLoginId}
                  disabled={isPrimarySuperAdminUser(editing)}
                  onChange={(e) => setEditLoginId(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">電子信箱</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">電話</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </label>
              {editing.role === 'staff' && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">帳號狀態</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as SystemUser['status'])}
                  >
                    <option value="active">啟用</option>
                    <option value="disabled">停權</option>
                  </select>
                </label>
              )}
              {editing.role === 'admin' ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  管理員（BOSS）擁有全部功能權限，無需個別勾選。
                </p>
              ) : (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">功能權限（勾選下放）</p>
                  <PermissionChecklist value={editPerms} onChange={setEditPerms} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-5 py-4">
              {isSuperAdmin && editing.role === 'staff' && (
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => void removeUser()}
                >
                  刪除此帳號
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setEditing(null)}>
                  取消
                </button>
                <button
                  type="button"
                  disabled={editBusy}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                  onClick={() => void submitEdit()}
                >
                  {editBusy ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pwdFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-bold text-slate-900">重設密碼 — {pwdFor.name}</h3>
            {pwdError && <p className="mt-2 text-sm text-red-600">{pwdError}</p>}
            <div className="mt-4 space-y-3">
              <input
                type="password"
                placeholder="新密碼"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
              />
              <input
                type="password"
                placeholder="再次輸入新密碼"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={pwdNew2}
                onChange={(e) => setPwdNew2(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100" onClick={() => setPwdFor(null)}>
                取消
              </button>
              <button
                type="button"
                disabled={pwdBusy}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void submitPwdReset()}
              >
                {pwdBusy ? '處理中…' : '確認重設'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
