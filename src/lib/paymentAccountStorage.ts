/**
 * 常用金流帳戶（本機 localStorage，可編輯）
 */
import {
  DEFAULT_PAYMENT_ACCOUNTS,
  dedupePaymentAccounts,
  normalizePaymentAccount,
} from '../types/accounts';

const STORAGE_KEY = 'shengwatch_payment_accounts_v1';
export const PAYMENT_ACCOUNTS_UPDATED_EVENT = 'shengwatchPaymentAccountsUpdated';

type StoreV1 = {
  version: 1;
  accounts: string[];
};

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: 1, accounts: [...DEFAULT_PAYMENT_ACCOUNTS] };
    }
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.accounts)) {
      return { version: 1, accounts: [...DEFAULT_PAYMENT_ACCOUNTS] };
    }
    const accounts = dedupePaymentAccounts(parsed.accounts);
    return { version: 1, accounts: accounts.length > 0 ? accounts : [...DEFAULT_PAYMENT_ACCOUNTS] };
  } catch {
    return { version: 1, accounts: [...DEFAULT_PAYMENT_ACCOUNTS] };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(PAYMENT_ACCOUNTS_UPDATED_EVENT));
}

/** 讀取常用帳戶清單（下拉選單用） */
export function loadCommonPaymentAccounts(): string[] {
  return readStore().accounts.slice();
}

/** 覆寫整份常用帳戶清單 */
export function saveCommonPaymentAccounts(accounts: readonly string[]): string[] {
  const next = dedupePaymentAccounts(accounts);
  if (next.length === 0) {
    throw new Error('至少需保留一個常用帳戶');
  }
  writeStore({ version: 1, accounts: next });
  return next;
}

/** 新增一筆常用帳戶（若已存在則略過） */
export function addCommonPaymentAccount(name: string): string[] {
  const n = normalizePaymentAccount(name);
  if (!n) throw new Error('帳戶名稱不可為空');
  const current = readStore().accounts;
  if (current.includes(n)) return current;
  return saveCommonPaymentAccounts([...current, n]);
}

/** 重新命名常用帳戶 */
export function renameCommonPaymentAccount(oldName: string, newName: string): string[] {
  const oldN = normalizePaymentAccount(oldName);
  const newN = normalizePaymentAccount(newName);
  if (!oldN || !newN) throw new Error('帳戶名稱不可為空');
  if (newN.length > 64) throw new Error('帳戶名稱不可超過 64 字');
  if (oldN === newN) return readStore().accounts;

  const current = readStore().accounts;
  if (current.includes(newN)) throw new Error('此帳戶名稱已存在');

  const idx = current.indexOf(oldN);
  if (idx >= 0) {
    const next = current.slice();
    next[idx] = newN;
    return saveCommonPaymentAccounts(next);
  }
  return saveCommonPaymentAccounts([...current, newN]);
}

/** 還原為系統預設 */
export function resetCommonPaymentAccounts(): string[] {
  return saveCommonPaymentAccounts([...DEFAULT_PAYMENT_ACCOUNTS]);
}

export const PAYMENT_ACCOUNT_STORAGE_KEY = STORAGE_KEY;
