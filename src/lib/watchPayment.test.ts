import { describe, expect, it } from 'vitest';
import { calcProfitTwd, calcTotalTwdCost } from './watchCost';
import { checkOrderPaymentStatus, completeCustomerOrderIfPaid, completeOrderIfPaid, sumPaymentsTwd } from './watchPayment';
import type { WatchItem, WatchOrder, WatchOrderPayment } from '../types/watch';

function makePayment(overrides: Partial<WatchOrderPayment> & Pick<WatchOrderPayment, 'amountTwd' | 'account'>): WatchOrderPayment {
  return {
    id: 'p1',
    paymentType: 'deposit',
    dateYmd: '2026-05-01',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<WatchOrder>): WatchOrder {
  return {
    id: 'o1',
    source: 'inventory',
    watchItemId: 'w1',
    salePriceTwd: 100_000,
    payments: [],
    status: 'active',
    isCompleted: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<WatchItem> = {}): WatchItem {
  return {
    id: 'w1',
    style: { brand: 'Rolex', model: 'Submariner' },
    status: 'in_stock',
    rmbCost: 50_000,
    exchangeRate: 4.5,
    twdShippingFee: 2_000,
    totalTwdCost: calcTotalTwdCost(50_000, 4.5, 2_000),
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calcTotalTwdCost', () => {
  it('成本 = RMB × 匯率', () => {
    expect(calcTotalTwdCost(10_000, 4.6)).toBe(46_000);
  });

  it('運費計入成本', () => {
    expect(calcTotalTwdCost(10_000, 4.6, 1_500)).toBe(47_500);
  });

  it('無效值視為 0', () => {
    expect(calcTotalTwdCost(NaN, 4.5)).toBe(0);
  });
});

describe('checkOrderPaymentStatus', () => {
  it('金流未齊備時不可結案', () => {
    const order = makeOrder({
      payments: [makePayment({ amountTwd: 30_000, account: '國泰CUBE' })],
    });
    const check = checkOrderPaymentStatus(order);
    expect(check.canComplete).toBe(false);
    expect(check.remainingTwd).toBe(70_000);
  });

  it('金流加總等於售價時可結案', () => {
    const order = makeOrder({
      payments: [
        makePayment({ id: 'p1', amountTwd: 30_000, account: '國泰CUBE', paymentType: 'deposit' }),
        makePayment({ id: 'p2', amountTwd: 70_000, account: '富邦銀行', paymentType: 'balance' }),
      ],
    });
    const check = checkOrderPaymentStatus(order);
    expect(check.canComplete).toBe(true);
    expect(check.remainingTwd).toBe(0);
  });

  it('超收時不可結案', () => {
    const order = makeOrder({
      payments: [makePayment({ amountTwd: 120_000, account: '現金', paymentType: 'full' })],
    });
    const check = checkOrderPaymentStatus(order);
    expect(check.canComplete).toBe(false);
    expect(check.remainingTwd).toBe(-20_000);
  });

  it('空帳戶不可結案', () => {
    const order = makeOrder({
      payments: [makePayment({ amountTwd: 100_000, account: '  ' })],
    });
    const check = checkOrderPaymentStatus(order);
    expect(check.canComplete).toBe(false);
    expect(check.accountsValid).toBe(false);
  });

  it('自訂帳戶名稱可結案', () => {
    const order = makeOrder({
      payments: [makePayment({ amountTwd: 100_000, account: '中信銀行' })],
    });
    const check = checkOrderPaymentStatus(order);
    expect(check.canComplete).toBe(true);
    expect(check.accountsValid).toBe(true);
  });

  it('退款從總額扣除', () => {
    const payments = [
      makePayment({ id: 'p1', amountTwd: 100_000, account: 'Richart', paymentType: 'full' }),
      makePayment({ id: 'p2', amountTwd: 10_000, account: 'Richart', paymentType: 'refund' }),
    ];
    expect(sumPaymentsTwd(payments)).toBe(90_000);
  });
});

describe('completeOrderIfPaid', () => {
  it('金流齊備時更新 sold 與 profitTwd', () => {
    const order = makeOrder({
      payments: [makePayment({ amountTwd: 100_000, account: '國泰CUBE', paymentType: 'full' })],
    });
    const item = makeItem();
    const result = completeOrderIfPaid(order, item);

    expect(result.completed).toBe(true);
    expect(result.order.isCompleted).toBe(true);
    expect(result.order.status).toBe('completed');
    expect(result.watchItem!.status).toBe('sold');
    expect(result.order.profitTwd).toBe(calcProfitTwd(100_000, item.totalTwdCost));
    expect(result.watchItem!.profitTwd).toBe(result.order.profitTwd);
    expect(result.watchItem!.soldOrderId).toBe('o1');
  });

  it('金流不足時不變更', () => {
    const order = makeOrder({
      payments: [makePayment({ amountTwd: 50_000, account: '現金' })],
    });
    const item = makeItem();
    const result = completeOrderIfPaid(order, item);
    expect(result.completed).toBe(false);
    expect(result.order.isCompleted).toBe(false);
    expect(result.watchItem?.status).toBe('in_stock');
  });
});

describe('completeCustomerOrderIfPaid', () => {
  it('客戶下單有成本時結案計算利潤', () => {
    const order: WatchOrder = {
      id: 'o3',
      source: 'customer',
      orderStyle: { brand: 'Rolex', model: 'Daytona' },
      rmbCost: 100_000,
      exchangeRate: 4.5,
      twdShippingFee: 2_000,
      totalTwdCost: calcTotalTwdCost(100_000, 4.5, 2_000),
      salePriceTwd: 800_000,
      payments: [makePayment({ amountTwd: 800_000, account: '富邦銀行', paymentType: 'full' })],
      status: 'active',
      isCompleted: false,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    const result = completeCustomerOrderIfPaid(order);
    expect(result.completed).toBe(true);
    expect(result.order.profitTwd).toBe(calcProfitTwd(800_000, order.totalTwdCost!));
    expect(result.watchItem).toBeNull();
  });

  it('客戶下單金流齊備時可結案且不更新庫存', () => {
    const order: WatchOrder = {
      id: 'o2',
      source: 'customer',
      orderStyle: { brand: 'Rolex', model: 'Daytona' },
      salePriceTwd: 800_000,
      payments: [makePayment({ amountTwd: 800_000, account: '富邦銀行', paymentType: 'full' })],
      status: 'active',
      isCompleted: false,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    const result = completeCustomerOrderIfPaid(order);
    expect(result.completed).toBe(true);
    expect(result.order.isCompleted).toBe(true);
    expect(result.watchItem).toBeNull();
    expect(result.order.profitTwd).toBeUndefined();
  });
});
