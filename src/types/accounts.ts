/**
 * 金流歸戶帳戶：預設常用清單 + 可自訂填寫。
 */
export const DEFAULT_PAYMENT_ACCOUNTS = ['國泰CUBE', '富邦銀行', 'Richart', '現金'] as const;

/** @deprecated 改用 DEFAULT_PAYMENT_ACCOUNTS 或 loadCommonPaymentAccounts */
export const PAYMENT_ACCOUNT_WHITELIST = DEFAULT_PAYMENT_ACCOUNTS;

/** 流入帳戶（常用或自訂字串） */
export type PaymentAccount = string;

export function normalizePaymentAccount(value: string): string {
  return value.trim();
}

export function isPaymentAccount(value: string): boolean {
  return normalizePaymentAccount(value).length > 0;
}

export function assertPaymentAccount(value: string): PaymentAccount {
  const n = normalizePaymentAccount(value);
  if (!n) {
    throw new Error('請填寫流入帳戶');
  }
  if (n.length > 64) {
    throw new Error('帳戶名稱不可超過 64 字');
  }
  return n;
}

export function dedupePaymentAccounts(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = normalizePaymentAccount(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
