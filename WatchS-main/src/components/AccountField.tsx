import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal, { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '@/components/Modal';
import {
  loadCommonPaymentAccounts,
  resetCommonPaymentAccounts,
  saveCommonPaymentAccounts,
} from '@/lib/paymentAccountStorage';
import { PAYMENT_ACCOUNTS_UPDATED_EVENT } from '@/lib/paymentAccountStorage';
import { normalizePaymentAccount } from '@/types/accounts';

const CUSTOM_OPTION = '__custom__';

type AccountFieldProps = {
  value: string;
  onChange: (account: string) => void;
};

export default function AccountField({ value, onChange }: AccountFieldProps) {
  const [accounts, setAccounts] = useState(loadCommonPaymentAccounts);
  const [manageOpen, setManageOpen] = useState(false);

  const reload = useCallback(() => setAccounts(loadCommonPaymentAccounts()), []);

  useEffect(() => {
    window.addEventListener(PAYMENT_ACCOUNTS_UPDATED_EVENT, reload);
    return () => window.removeEventListener(PAYMENT_ACCOUNTS_UPDATED_EVENT, reload);
  }, [reload]);

  const inCommonList = accounts.includes(value);
  const [useCustom, setUseCustom] = useState(() => value !== '' && !inCommonList);

  useEffect(() => {
    if (value && !accounts.includes(value)) {
      setUseCustom(true);
    }
  }, [value, accounts]);

  const selectValue = useCustom ? CUSTOM_OPTION : value || accounts[0] || '';

  const handleSelectChange = (next: string) => {
    if (next === CUSTOM_OPTION) {
      setUseCustom(true);
      if (inCommonList) onChange('');
      return;
    }
    setUseCustom(false);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel required>流入帳戶</FieldLabel>
        <button
          type="button"
          className="text-xs font-medium text-amber-700 hover:text-amber-800"
          onClick={() => setManageOpen(true)}
        >
          管理常用帳戶
        </button>
      </div>

      <select
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      >
        {accounts.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        <option value={CUSTOM_OPTION}>自訂帳戶…</option>
      </select>

      {useCustom && (
        <div className="relative">
          <Pencil className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="輸入帳戶名稱，例如：中信銀行、Line Pay"
            className="pl-9"
          />
        </div>
      )}

      <ManageAccountsModal open={manageOpen} onClose={() => setManageOpen(false)} accounts={accounts} />
    </div>
  );
}

function ManageAccountsModal({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: string[];
}) {
  const [draft, setDraft] = useState<string[]>(accounts);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(accounts);
      setNewName('');
      setError(null);
    }
  }, [open, accounts]);

  const canSave = useMemo(() => draft.some((x) => normalizePaymentAccount(x)), [draft]);

  const save = () => {
    try {
      saveCommonPaymentAccounts(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    }
  };

  const addRow = () => {
    const n = normalizePaymentAccount(newName);
    if (!n) {
      setError('請輸入帳戶名稱');
      return;
    }
    if (draft.includes(n)) {
      setError('此帳戶已在清單中');
      return;
    }
    setDraft([...draft, n]);
    setNewName('');
    setError(null);
  };

  const removeAt = (idx: number) => {
    setDraft(draft.filter((_, i) => i !== idx));
  };

  const updateAt = (idx: number, name: string) => {
    setDraft(draft.map((x, i) => (i === idx ? name : x)));
  };

  return (
    <Modal open={open} title="管理常用帳戶" onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-500">
        編輯後的帳戶會出現在金流下拉選單；仍可在選單中選「自訂帳戶」填寫其他名稱。
      </p>

      <div className="space-y-2">
        {draft.map((name, idx) => (
          <div key={idx} className="flex gap-2">
            <TextInput value={name} onChange={(e) => updateAt(idx, e.target.value)} />
            <button
              type="button"
              disabled={draft.length <= 1}
              onClick={() => removeAt(idx)}
              className="shrink-0 rounded-lg border border-slate-200 p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
              title="刪除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <TextInput
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增常用帳戶"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addRow();
            }
          }}
        />
        <SecondaryButton type="button" onClick={addRow} className="inline-flex shrink-0 items-center gap-1">
          <Plus className="h-4 w-4" />
          新增
        </SecondaryButton>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <SecondaryButton
          type="button"
          onClick={() => {
            setDraft(resetCommonPaymentAccounts());
            setError(null);
          }}
        >
          還原預設
        </SecondaryButton>
        <div className="flex gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton type="button" onClick={save} disabled={!canSave}>
            儲存
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
