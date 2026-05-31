import { describe, expect, it } from 'vitest';
import { computeSalesDashboardStats, computeSalesStatsForDateRange } from './salesAnalytics';
import type { WatchItem, WatchOrder } from '@/types/watch';

function order(
  partial: Partial<WatchOrder> & Pick<WatchOrder, 'id' | 'salePriceTwd' | 'createdAt'>,
): WatchOrder {
  return {
    source: 'inventory',
    watchItemId: 'w1',
    payments: [],
    status: 'active',
    isCompleted: false,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

const item: WatchItem = {
  id: 'w1',
  style: { brand: 'Rolex', model: 'Sub' },
  status: 'reserved',
  rmbCost: 1,
  exchangeRate: 1,
  twdShippingFee: 0,
  totalTwdCost: 300_000,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('computeSalesDashboardStats', () => {
  it('依建單日彙總，進行中訂單亦計入', () => {
    const ref = new Date('2026-05-31T12:00:00');
    const orders = [
      order({
        id: 'o1',
        salePriceTwd: 420_000,
        createdAt: '2026-05-30T10:00:00.000Z',
      }),
      order({
        id: 'o2',
        salePriceTwd: 150_000,
        status: 'completed',
        isCompleted: true,
        profitTwd: 30_000,
        completedAt: '2026-06-01T10:00:00.000Z',
        createdAt: '2026-05-01T10:00:00.000Z',
      }),
    ];
    const stats = computeSalesDashboardStats(orders, [item], [], ref);
    expect(stats.byPeriod.week.unitsSold).toBe(1);
    expect(stats.byPeriod.week.revenueTwd).toBe(420_000);
    expect(stats.byPeriod.week.grossProfitTwd).toBe(120_000);
    expect(stats.byPeriod.month.unitsSold).toBe(2);
  });

  it('自訂日期區間篩選', () => {
    const orders = [
      order({
        id: 'o1',
        salePriceTwd: 100_000,
        createdAt: '2026-05-10T10:00:00.000Z',
      }),
      order({
        id: 'o2',
        salePriceTwd: 200_000,
        createdAt: '2026-05-20T10:00:00.000Z',
      }),
    ];
    const slice = computeSalesStatsForDateRange(orders, [item], [], '2026-05-15', '2026-05-31');
    expect(slice.metrics.unitsSold).toBe(1);
    expect(slice.metrics.revenueTwd).toBe(200_000);
  });

  it('已取消訂單不計入', () => {
    const ref = new Date('2026-05-31T12:00:00');
    const orders = [
      order({
        id: 'o-cancel',
        salePriceTwd: 999_000,
        status: 'cancelled',
        createdAt: '2026-05-30T10:00:00.000Z',
      }),
    ];
    const stats = computeSalesDashboardStats(orders, [item], [], ref);
    expect(stats.byPeriod.month.unitsSold).toBe(0);
  });
});
