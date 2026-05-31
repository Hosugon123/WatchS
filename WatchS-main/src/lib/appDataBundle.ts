/**
 * 全站本機資料匯出／匯入（標準 JSON），供備份與雲端 bundle 同步。
 */

export const SHENGWATCH_DATA_BUNDLE_VERSION = 1;
export const SHENGWATCH_APP_ID = 'shengwatch';

export const SHENGWATCH_EXPORT_STORAGE_KEYS = [
  'shengwatch_items_v1',
  'shengwatch_orders_v1',
  'shengwatch_payment_accounts_v1',
  'shengwatch_account_transfers_v1',
  'shengwatch_account_opening_balances_v1',
  'shengwatch_account_profiles_v1',
  'shengwatch_vendor_payables_v1',
  'shengwatch_ledger_entries_v1',
  'shengwatch_system_users_v1',
  'shengwatch_login_credentials_v1',
  'shengwatch_brand_logo_v1',
  'shengwatch_sale_price_buckets_v1',
] as const;

export type ShengwatchStorageKey = (typeof SHENGWATCH_EXPORT_STORAGE_KEYS)[number];

export type ShengwatchDataBundleV1 = {
  bundleVersion: typeof SHENGWATCH_DATA_BUNDLE_VERSION;
  app: typeof SHENGWATCH_APP_ID;
  exportedAt: string;
  updatedAt?: number;
  format: 'shengwatch-localStorage-snapshot-v1';
  keys: Partial<Record<ShengwatchStorageKey, string | null>>;
};

export const SHENGWATCH_DATA_BUNDLE_IMPORTED_EVENT = 'shengwatchDataBundleImported';

export function dispatchShengwatchStorageSyncEvents(): void {
  window.dispatchEvent(new Event('shengwatchItemsUpdated'));
  window.dispatchEvent(new Event('shengwatchOrdersUpdated'));
  window.dispatchEvent(new Event('shengwatchPaymentAccountsUpdated'));
  window.dispatchEvent(new Event('shengwatchAccountTransfersUpdated'));
  window.dispatchEvent(new Event('shengwatchAccountOpeningBalancesUpdated'));
  window.dispatchEvent(new Event('shengwatchAccountProfilesUpdated'));
  window.dispatchEvent(new Event('shengwatchVendorPayablesUpdated'));
  window.dispatchEvent(new Event('shengwatchLedgerEntriesUpdated'));
  window.dispatchEvent(new Event(SHENGWATCH_DATA_BUNDLE_IMPORTED_EVENT));
}

export function buildShengwatchDataBundle(options?: { updatedAt?: number }): ShengwatchDataBundleV1 {
  const keys: Partial<Record<ShengwatchStorageKey, string | null>> = {};
  for (const k of SHENGWATCH_EXPORT_STORAGE_KEYS) {
    try {
      keys[k] = localStorage.getItem(k);
    } catch {
      keys[k] = null;
    }
  }
  const bundle: ShengwatchDataBundleV1 = {
    bundleVersion: SHENGWATCH_DATA_BUNDLE_VERSION,
    app: SHENGWATCH_APP_ID,
    exportedAt: new Date().toISOString(),
    format: 'shengwatch-localStorage-snapshot-v1',
    keys,
  };
  if (options?.updatedAt != null) {
    bundle.updatedAt = options.updatedAt;
  }
  return bundle;
}

export function buildShengwatchDataBundleForPush(): ShengwatchDataBundleV1 {
  return buildShengwatchDataBundle({ updatedAt: Date.now() });
}

export function serializeShengwatchDataBundle(bundle: ShengwatchDataBundleV1): string {
  return JSON.stringify(bundle, null, 2);
}

export type ImportBundleResult = {
  ok: boolean;
  importedKeys: ShengwatchStorageKey[];
  error?: string;
};

export function importShengwatchDataBundle(bundle: ShengwatchDataBundleV1): ImportBundleResult {
  if (bundle.app !== SHENGWATCH_APP_ID || bundle.bundleVersion !== SHENGWATCH_DATA_BUNDLE_VERSION) {
    return { ok: false, importedKeys: [], error: 'bundle 格式或 app 不符' };
  }

  const importedKeys: ShengwatchStorageKey[] = [];
  for (const k of SHENGWATCH_EXPORT_STORAGE_KEYS) {
    const v = bundle.keys[k];
    if (v === undefined) continue;
    try {
      if (v === null) {
        localStorage.removeItem(k);
      } else {
        localStorage.setItem(k, v);
      }
      importedKeys.push(k);
    } catch {
      return { ok: false, importedKeys, error: `寫入 ${k} 失敗` };
    }
  }

  dispatchShengwatchStorageSyncEvents();
  return { ok: true, importedKeys };
}

export function parseBundleJson(raw: string): ShengwatchDataBundleV1 | null {
  try {
    const parsed = JSON.parse(raw) as ShengwatchDataBundleV1;
    if (parsed?.format !== 'shengwatch-localStorage-snapshot-v1') return null;
    return parsed;
  } catch {
    return null;
  }
}
