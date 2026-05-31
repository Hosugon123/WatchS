/**
 * 帳戶間轉帳紀錄（本機 localStorage）
 */
import { assertPaymentAccount } from '../types/accounts';
import type { AccountTransfer, NewAccountTransferInput } from './accountTreasury';
import { TREASURY_EXTERNAL_ACCOUNT, TREASURY_VENDOR_ACCOUNT } from './accountTreasury';
import { todayYmd } from './format';
import { roundTwd } from './watchCost';

const STORAGE_KEY = 'shengwatch_account_transfers_v1';
export const ACCOUNT_TRANSFERS_UPDATED_EVENT = 'shengwatchAccountTransfersUpdated';

type StoreV1 = {
  version: 1;
  transfers: AccountTransfer[];
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, transfers: [] };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.transfers)) {
      return { version: 1, transfers: [] };
    }
    return parsed;
  } catch {
    return { version: 1, transfers: [] };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(ACCOUNT_TRANSFERS_UPDATED_EVENT));
}

export function listAccountTransfers(): AccountTransfer[] {
  return readStore().transfers.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createAccountTransfer(input: NewAccountTransferInput): AccountTransfer {
  const fromAccount = assertPaymentAccount(input.fromAccount);
  const toAccount = assertPaymentAccount(input.toAccount);
  const amountTwd = roundTwd(input.amountTwd);

  if (fromAccount === toAccount) {
    throw new Error('轉出與轉入帳戶不可相同');
  }
  if (amountTwd <= 0) {
    throw new Error('轉帳金額必須大於 0');
  }

  const transfer: AccountTransfer = {
    id: newId(),
    kind: 'transfer',
    fromAccount,
    toAccount,
    amountTwd,
    dateYmd: input.dateYmd,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.transfers.push(transfer);
  writeStore(store);
  return transfer;
}

/** 記錄起始資金注入或調減（僅供異動紀錄，不計入轉帳淨額） */
export function createOpeningBalanceMovement(
  account: string,
  deltaTwd: number,
  dateYmd: string = todayYmd(),
): AccountTransfer {
  const name = assertPaymentAccount(account);
  const delta = roundTwd(deltaTwd);
  if (delta === 0) {
    throw new Error('起始資金異動金額不可為 0');
  }

  const transfer: AccountTransfer = {
    id: newId(),
    kind: 'opening',
    fromAccount: delta > 0 ? TREASURY_EXTERNAL_ACCOUNT : name,
    toAccount: delta > 0 ? name : TREASURY_EXTERNAL_ACCOUNT,
    amountTwd: Math.abs(delta),
    dateYmd,
    note: delta > 0 ? '起始資金注入' : '起始資金調減',
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.transfers.push(transfer);
  writeStore(store);
  return transfer;
}

export function createVendorPaymentTransfer(
  fromAccount: string,
  amountTwd: number,
  dateYmd: string,
  note?: string,
): AccountTransfer {
  const from = assertPaymentAccount(fromAccount);
  const amount = roundTwd(amountTwd);
  if (amount <= 0) throw new Error('還款金額必須大於 0');

  const transfer: AccountTransfer = {
    id: newId(),
    kind: 'vendor_payment',
    fromAccount: from,
    toAccount: TREASURY_VENDOR_ACCOUNT,
    amountTwd: amount,
    dateYmd,
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.transfers.push(transfer);
  writeStore(store);
  return transfer;
}

export function removeAccountTransfer(id: string): boolean {
  const store = readStore();
  const before = store.transfers.length;
  store.transfers = store.transfers.filter((t) => t.id !== id);
  if (store.transfers.length === before) return false;
  writeStore(store);
  return true;
}

export function renameAccountInTransfers(oldName: string, newName: string): void {
  const oldN = oldName.trim();
  const newN = newName.trim();
  if (!oldN || !newN || oldN === newN) return;

  const store = readStore();
  let changed = false;
  for (const t of store.transfers) {
    if (t.fromAccount === oldN) {
      t.fromAccount = newN;
      changed = true;
    }
    if (t.toAccount === oldN) {
      t.toAccount = newN;
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

export const ACCOUNT_TRANSFER_STORAGE_KEY = STORAGE_KEY;
