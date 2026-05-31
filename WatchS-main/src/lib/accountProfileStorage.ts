/**
 * 帳戶屬性（本機 localStorage）
 */
import { normalizePaymentAccount } from '../types/accounts';

const STORAGE_KEY = 'shengwatch_account_profiles_v1';
export const ACCOUNT_PROFILES_UPDATED_EVENT = 'shengwatchAccountProfilesUpdated';

export const PAYMENT_ACCOUNT_OWNERSHIP_TYPES = ['own', 'proxy'] as const;
export type PaymentAccountOwnershipType = (typeof PAYMENT_ACCOUNT_OWNERSHIP_TYPES)[number];

export const PAYMENT_ACCOUNT_OWNERSHIP_LABELS: Record<PaymentAccountOwnershipType, string> = {
  own: '自有帳戶',
  proxy: '代收戶',
};

export type PaymentAccountProfile = {
  ownershipType: PaymentAccountOwnershipType;
  /** 代收戶備註，例如代收對象 */
  note?: string;
};

type StoreV1 = {
  version: 1;
  profiles: Record<string, PaymentAccountProfile>;
};

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, profiles: {} };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || typeof parsed.profiles !== 'object') {
      return { version: 1, profiles: {} };
    }
    return parsed;
  } catch {
    return { version: 1, profiles: {} };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(ACCOUNT_PROFILES_UPDATED_EVENT));
}

export function loadAccountProfiles(): Record<string, PaymentAccountProfile> {
  return { ...readStore().profiles };
}

export function getAccountProfile(account: string): PaymentAccountProfile {
  const p = readStore().profiles[account];
  return p ?? { ownershipType: 'own' };
}

export function saveAccountProfile(account: string, profile: PaymentAccountProfile): PaymentAccountProfile {
  const name = normalizePaymentAccount(account);
  if (!name) throw new Error('帳戶名稱不可為空');

  const next: PaymentAccountProfile = {
    ownershipType: profile.ownershipType === 'proxy' ? 'proxy' : 'own',
    note: profile.note?.trim() || undefined,
  };

  const store = readStore();
  store.profiles[name] = next;
  writeStore(store);
  return next;
}

export function renameAccountProfile(oldName: string, newName: string): void {
  const oldN = oldName.trim();
  const newN = newName.trim();
  if (!oldN || !newN || oldN === newN) return;

  const store = readStore();
  const profile = store.profiles[oldN];
  if (!profile) return;
  store.profiles[newN] = profile;
  delete store.profiles[oldN];
  writeStore(store);
}

export const ACCOUNT_PROFILE_STORAGE_KEY = STORAGE_KEY;
