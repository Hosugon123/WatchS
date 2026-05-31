import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SALE_PRICE_BUCKETS,
  formRowsToBuckets,
  normalizeSalePriceBuckets,
} from './salePriceBucketStorage';
import { computeSalesStatsForDateRange } from './salesAnalytics';
import type { WatchOrder } from '@/types/watch';

describe('salePriceBucketStorage', () => {
  it('正規化後最後一檔為以上', () => {
    const buckets = normalizeSalePriceBuckets([
      { id: 'a', label: '低價', min: 0, max: 200_000 },
      { id: 'b', label: '高價', min: 200_000, max: 500_000 },
    ]);
    expect(buckets).toHaveLength(2);
    expect(buckets[1]!.max).toBeNull();
  });

  it('表單萬元轉台幣', () => {
    const buckets = formRowsToBuckets([
      { id: 'x', label: '自訂', minWan: '10', maxWan: '30' },
      { id: 'y', label: '頂規', minWan: '30', maxWan: '' },
    ]);
    expect(buckets[0]!.min).toBe(100_000);
    expect(buckets[0]!.max).toBe(300_000);
    expect(buckets[1]!.max).toBeNull();
  });
});

describe('computeSalesStatsForDateRange with custom buckets', () => {
  it('依自訂區間分類', () => {
    const buckets = [
      { id: 'low', label: '低價帶', min: 0, max: 150_000 },
      { id: 'high', label: '高價帶', min: 150_000, max: null },
    ];
    const orders: WatchOrder[] = [
      {
        id: 'o1',
        source: 'customer',
        orderStyle: { brand: 'A', model: 'b' },
        salePriceTwd: 100_000,
        payments: [],
        status: 'active',
        isCompleted: false,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
      {
        id: 'o2',
        source: 'customer',
        orderStyle: { brand: 'C', model: 'd' },
        salePriceTwd: 200_000,
        payments: [],
        status: 'active',
        isCompleted: false,
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ];
    const slice = computeSalesStatsForDateRange(orders, [], [], '2026-05-01', '2026-05-31', buckets);
    expect(slice.priceBuckets).toEqual([
      { bucketId: 'low', label: '低價帶', unitsSold: 1 },
      { bucketId: 'high', label: '高價帶', unitsSold: 1 },
    ]);
  });
});
