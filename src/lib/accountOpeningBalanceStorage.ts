/**
 * 帳戶起始資金（本機 localStorage）
 * 用於已營運中、導入系統前的既有餘額。
 */
import { assertPaymentAccount } from '../types/accounts';
import { roundTwd } from './watchCost';

const STORAGE_KEY = 'shengwatch_account_opening_balances_v1';
export const ACCOUNT_OPENING_BALANCES_UPDATED_EVENT = 'shengwatchAccountOpeningBalancesUpdated';

type StoreV1 = {
  version: 1;
  /** 帳戶名稱 → 起始資金（台幣） */
  balances: Record<string, number>;
};

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, balances: {} };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || typeof parsed.balances !== 'object') {
      return { version: 1, balances: {} };
    }
    return parsed;
  } catch {
    return { version: 1, balances: {} };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(ACCOUNT_OPENING_BALANCES_UPDATED_EVENT));
}

export function loadOpeningBalances(): Record<string, number> {
  return { ...readStore().balances };
}

export function getOpeningBalance(account: string): number {
  const n = readStore().balances[account];
  return typeof n === 'number' && Number.isFinite(n) ? roundTwd(n) : 0;
}

export function setOpeningBalance(account: string, amountTwd: number): number {
  const name = assertPaymentAccount(account);
  const amount = roundTwd(amountTwd);
  if (amount < 0) {
    throw new Error('起始資金不可為負數');
  }
  const store = readStore();
  store.balances[name] = amount;
  writeStore(store);
  return amount;
}

export function removeOpeningBalance(account: string): void {
  const store = readStore();
  delete store.balances[account];
  writeStore(store);
}

export function renameOpeningBalanceAccount(oldName: string, newName: string): void {
  const oldN = oldName.trim();
  const newN = newName.trim();
  if (!oldN || !newN || oldN === newN) return;

  const store = readStore();
  if (store.balances[oldN] === undefined) return;
  store.balances[newN] = store.balances[oldN];
  delete store.balances[oldN];
  writeStore(store);
}

export const ACCOUNT_OPENING_BALANCE_STORAGE_KEY = STORAGE_KEY;
