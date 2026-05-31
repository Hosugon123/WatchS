/**
 * 廠商代付應付（本機 localStorage）
 * 記錄廠商代付貨款產生的欠款，以及還款紀錄。
 */
import { roundTwd } from './watchCost';

const STORAGE_KEY = 'shengwatch_vendor_payables_v1';
export const VENDOR_PAYABLES_UPDATED_EVENT = 'shengwatchVendorPayablesUpdated';

export type VendorPayableEntryKind = 'charge' | 'payment';

export type VendorPayableEntry = {
  id: string;
  vendorName: string;
  kind: VendorPayableEntryKind;
  amountTwd: number;
  /** 還款時使用的付款帳戶 */
  fromAccount?: string;
  dateYmd: string;
  note?: string;
  /** 關聯訂單（建單代付時回填） */
  orderId?: string;
  createdAt: string;
};

export type VendorPayableSummary = {
  vendorName: string;
  chargeTotalTwd: number;
  paymentTotalTwd: number;
  /** 尚欠金額 */
  balanceTwd: number;
};

export const VENDOR_PAYABLE_KIND_LABELS: Record<VendorPayableEntryKind, string> = {
  charge: '代付欠款',
  payment: '還款',
};

type StoreV1 = {
  version: 1;
  entries: VendorPayableEntry[];
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
    if (!raw) return { version: 1, entries: [] };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(VENDOR_PAYABLES_UPDATED_EVENT));
}

export function listVendorPayableEntries(): VendorPayableEntry[] {
  return readStore().entries.slice().sort((a, b) => b.dateYmd.localeCompare(a.dateYmd) || b.createdAt.localeCompare(a.createdAt));
}

export function calcVendorPayableSummaries(entries: readonly VendorPayableEntry[]): VendorPayableSummary[] {
  const map = new Map<string, { charge: number; payment: number }>();
  for (const e of entries) {
    const name = e.vendorName.trim();
    if (!name) continue;
    const row = map.get(name) ?? { charge: 0, payment: 0 };
    if (e.kind === 'charge') {
      row.charge = roundTwd(row.charge + e.amountTwd);
    } else {
      row.payment = roundTwd(row.payment + e.amountTwd);
    }
    map.set(name, row);
  }

  return [...map.entries()]
    .map(([vendorName, { charge, payment }]) => ({
      vendorName,
      chargeTotalTwd: charge,
      paymentTotalTwd: payment,
      balanceTwd: roundTwd(charge - payment),
    }))
    .filter((s) => s.chargeTotalTwd > 0 || s.paymentTotalTwd > 0)
    .sort((a, b) => b.balanceTwd - a.balanceTwd || a.vendorName.localeCompare(b.vendorName, 'zh-TW'));
}

export function calcTotalVendorPayableBalance(entries: readonly VendorPayableEntry[]): number {
  return roundTwd(calcVendorPayableSummaries(entries).reduce((s, v) => s + v.balanceTwd, 0));
}

export type NewVendorChargeInput = {
  vendorName: string;
  amountTwd: number;
  dateYmd: string;
  note?: string;
  orderId?: string;
};

export type NewVendorPaymentInput = {
  vendorName: string;
  amountTwd: number;
  fromAccount: string;
  dateYmd: string;
  note?: string;
};

export function createVendorCharge(input: NewVendorChargeInput): VendorPayableEntry {
  const vendorName = input.vendorName.trim();
  if (!vendorName) throw new Error('請填寫廠商名稱');
  const amountTwd = roundTwd(input.amountTwd);
  if (amountTwd <= 0) throw new Error('欠款金額必須大於 0');

  const entry: VendorPayableEntry = {
    id: newId(),
    vendorName,
    kind: 'charge',
    amountTwd,
    dateYmd: input.dateYmd,
    note: input.note?.trim() || undefined,
    orderId: input.orderId,
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.entries.push(entry);
  writeStore(store);
  return entry;
}

export function createVendorPayment(input: NewVendorPaymentInput): VendorPayableEntry {
  const vendorName = input.vendorName.trim();
  if (!vendorName) throw new Error('請填寫廠商名稱');
  const fromAccount = input.fromAccount.trim();
  if (!fromAccount) throw new Error('請選擇付款帳戶');
  const amountTwd = roundTwd(input.amountTwd);
  if (amountTwd <= 0) throw new Error('還款金額必須大於 0');

  const entry: VendorPayableEntry = {
    id: newId(),
    vendorName,
    kind: 'payment',
    amountTwd,
    fromAccount,
    dateYmd: input.dateYmd,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.entries.push(entry);
  writeStore(store);
  return entry;
}

export const VENDOR_PAYABLE_STORAGE_KEY = STORAGE_KEY;
