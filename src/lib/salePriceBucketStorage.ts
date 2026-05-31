/**
 * 營運概況：售價區間定義（本機 localStorage，可自訂顯示名稱與上下限）
 */

export type SalePriceBucketDef = {
  id: string;
  /** 圖表顯示名稱 */
  label: string;
  /** 含下限（台幣） */
  min: number;
  /** 不含上限；最後一檔為 null 表示以上 */
  max: number | null;
};

export const DEFAULT_SALE_PRICE_BUCKETS: SalePriceBucketDef[] = [
  { id: 'b0', label: '10 萬以下', min: 0, max: 100_000 },
  { id: 'b1', label: '10 萬～30 萬', min: 100_000, max: 300_000 },
  { id: 'b2', label: '30 萬～50 萬', min: 300_000, max: 500_000 },
  { id: 'b3', label: '50 萬～100 萬', min: 500_000, max: 1_000_000 },
  { id: 'b4', label: '100 萬以上', min: 1_000_000, max: null },
];

const STORAGE_KEY = 'shengwatch_sale_price_buckets_v1';

export const SALE_PRICE_BUCKETS_UPDATED_EVENT = 'shengwatchSalePriceBucketsUpdated';

/** 與舊版 analytics 匯出相容 */
export const SALE_PRICE_BUCKETS = DEFAULT_SALE_PRICE_BUCKETS;

function dispatchUpdated(): void {
  window.dispatchEvent(new Event(SALE_PRICE_BUCKETS_UPDATED_EVENT));
}

function newBucketId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function formatBucketRangeHint(b: SalePriceBucketDef): string {
  const minWan = b.min / 10_000;
  if (b.max == null) {
    return `${minWan} 萬以上`;
  }
  const maxWan = b.max / 10_000;
  return `${minWan} 萬～${maxWan} 萬`;
}

export function normalizeSalePriceBuckets(input: readonly SalePriceBucketDef[]): SalePriceBucketDef[] {
  if (!input.length) return [...DEFAULT_SALE_PRICE_BUCKETS];

  const sorted = [...input]
    .map((b) => ({
      id: b.id?.trim() || newBucketId(),
      label: b.label?.trim() || formatBucketRangeHint(b),
      min: Math.max(0, Math.round(Number(b.min) || 0)),
      max: b.max == null ? null : Math.round(Number(b.max)),
    }))
    .sort((a, b) => a.min - b.min);

  const out: SalePriceBucketDef[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    let min = cur.min;
    if (i > 0) {
      const prev = out[i - 1]!;
      min = Math.max(min, prev.min);
      if (prev.max != null && min < prev.max) min = prev.max;
    }

    let max: number | null = cur.max;
    if (i < sorted.length - 1) {
      const nextMin = sorted[i + 1]!.min;
      if (max == null || max <= min) max = Math.max(min + 1, nextMin);
      else if (max > nextMin) max = nextMin;
    } else {
      max = null;
    }

    if (max != null && max <= min) {
      throw new Error(`區間「${cur.label}」上限須大於下限。`);
    }

    out.push({
      id: cur.id,
      label: cur.label || formatBucketRangeHint({ ...cur, min, max }),
      min,
      max,
    });
  }

  return out;
}

export function readSalePriceBuckets(): SalePriceBucketDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_SALE_PRICE_BUCKETS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_SALE_PRICE_BUCKETS];
    const rows: SalePriceBucketDef[] = [];
    for (const o of parsed) {
      if (o === null || typeof o !== 'object') continue;
      const bag = o as Record<string, unknown>;
      const id = typeof bag.id === 'string' ? bag.id : newBucketId();
      const label = typeof bag.label === 'string' ? bag.label : '';
      const min = typeof bag.min === 'number' ? bag.min : Number(bag.min);
      const maxRaw = bag.max;
      const max =
        maxRaw === null || maxRaw === undefined || maxRaw === ''
          ? null
          : typeof maxRaw === 'number'
            ? maxRaw
            : Number(maxRaw);
      if (!Number.isFinite(min)) continue;
      rows.push({
        id,
        label,
        min,
        max: max == null || !Number.isFinite(max) ? null : max,
      });
    }
    if (!rows.length) return [...DEFAULT_SALE_PRICE_BUCKETS];
    return normalizeSalePriceBuckets(rows);
  } catch {
    return [...DEFAULT_SALE_PRICE_BUCKETS];
  }
}

export function writeSalePriceBuckets(buckets: readonly SalePriceBucketDef[]): SalePriceBucketDef[] {
  const normalized = normalizeSalePriceBuckets(buckets);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  dispatchUpdated();
  return normalized;
}

export function resetSalePriceBuckets(): SalePriceBucketDef[] {
  localStorage.removeItem(STORAGE_KEY);
  dispatchUpdated();
  return [...DEFAULT_SALE_PRICE_BUCKETS];
}

/** 編輯表單用（萬元） */
export type SalePriceBucketFormRow = {
  id: string;
  label: string;
  minWan: string;
  maxWan: string;
};

export function bucketsToFormRows(buckets: readonly SalePriceBucketDef[]): SalePriceBucketFormRow[] {
  return buckets.map((b) => ({
    id: b.id,
    label: b.label,
    minWan: String(b.min / 10_000),
    maxWan: b.max == null ? '' : String(b.max / 10_000),
  }));
}

export function formRowsToBuckets(rows: readonly SalePriceBucketFormRow[]): SalePriceBucketDef[] {
  if (!rows.length) throw new Error('至少需一個價格區間。');
  const draft = rows.map((r, i) => {
    const label = r.label.trim();
    const minWan = Number(r.minWan);
    const maxWan = r.maxWan.trim() === '' ? null : Number(r.maxWan);
    if (!label) throw new Error(`第 ${i + 1} 列請填寫顯示名稱。`);
    if (!Number.isFinite(minWan) || minWan < 0) {
      throw new Error(`第 ${i + 1} 列下限（萬）請填寫有效數字。`);
    }
    if (maxWan != null && (!Number.isFinite(maxWan) || maxWan <= minWan)) {
      throw new Error(`第 ${i + 1} 列上限（萬）須大於下限，最後一列可留空表示「以上」。`);
    }
    return {
      id: r.id || newBucketId(),
      label,
      min: Math.round(minWan * 10_000),
      max: maxWan == null ? null : Math.round(maxWan * 10_000),
    };
  });
  return normalizeSalePriceBuckets(draft);
}
