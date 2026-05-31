import { describe, expect, it } from 'vitest';
import { calcTreasuryBalances, calcTreasuryBalanceByOwnership, buildTreasuryMovements, calcTransferNetForAccount, isTreasuryMovementInflow } from './accountTreasury';
import type { WatchOrder } from '../types/watch';

describe('calcTreasuryBalances', () => {
  it('彙總訂單收款至各帳戶（含已結案）', () => {
    const orders: WatchOrder[] = [
      {
        id: 'o1',
        source: 'customer',
        salePriceTwd: 100_000,
        isCompleted: true,
        status: 'completed',
        payments: [
          {
            id: 'p1',
            paymentType: 'full',
            amountTwd: 100_000,
            account: '國泰CUBE',
            dateYmd: '2026-05-01',
            createdAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ];

    const balances = calcTreasuryBalances(orders, [], ['國泰CUBE', '富邦銀行']);
    const cube = balances.find((b) => b.account === '國泰CUBE');
    expect(cube?.orderInflowTwd).toBe(100_000);
    expect(cube?.openingBalanceTwd).toBe(0);
    expect(cube?.balanceTwd).toBe(100_000);
  });

  it('進行中訂單訂金即時計入金流管理', () => {
    const orders: WatchOrder[] = [
      {
        id: 'o2',
        source: 'customer',
        orderStyle: { brand: 'R', model: 'A', reference: '123' },
        salePriceTwd: 500_000,
        isCompleted: false,
        status: 'active',
        payments: [
          {
            id: 'p2',
            paymentType: 'deposit',
            amountTwd: 100_000,
            account: '阿信',
            dateYmd: '2026-05-31',
            createdAt: '2026-05-31T00:00:00.000Z',
          },
        ],
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z',
      },
    ];

    const balances = calcTreasuryBalances(orders, [], []);
    const axin = balances.find((b) => b.account === '阿信');
    expect(axin?.orderInflowTwd).toBe(100_000);
    expect(axin?.balanceTwd).toBe(100_000);

    const movements = buildTreasuryMovements([], orders);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.kind).toBe('payment');
    expect(movements[0]?.toAccount).toBe('阿信');
    expect(movements[0]?.note).toContain('進行中');
  });

  it('已取消訂單收款不計入金流', () => {
    const orders: WatchOrder[] = [
      {
        id: 'o3',
        source: 'customer',
        salePriceTwd: 100_000,
        isCompleted: false,
        status: 'cancelled',
        payments: [
          {
            id: 'p3',
            paymentType: 'deposit',
            amountTwd: 50_000,
            account: '國泰CUBE',
            dateYmd: '2026-05-01',
            createdAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ];
    const balances = calcTreasuryBalances(orders, [], ['國泰CUBE']);
    expect(balances.find((b) => b.account === '國泰CUBE')?.orderInflowTwd).toBe(0);
  });

  it('起始資金計入餘額', () => {
    const balances = calcTreasuryBalances([], [], ['國泰CUBE'], { 國泰CUBE: 500_000 });
    expect(balances[0]?.openingBalanceTwd).toBe(500_000);
    expect(balances[0]?.balanceTwd).toBe(500_000);
  });

  it('帳戶轉帳調整餘額', () => {
    const orders: WatchOrder[] = [
      {
        id: 'o1',
        source: 'customer',
        salePriceTwd: 50_000,
        isCompleted: true,
        status: 'completed',
        payments: [
          {
            id: 'p1',
            paymentType: 'full',
            amountTwd: 50_000,
            account: '國泰CUBE',
            dateYmd: '2026-05-01',
            createdAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ];

    const transfers = [
      {
        id: 't1',
        fromAccount: '國泰CUBE',
        toAccount: 'Richart',
        amountTwd: 20_000,
        dateYmd: '2026-05-02',
        createdAt: '2026-05-02T00:00:00.000Z',
      },
    ];

    const balances = calcTreasuryBalances(orders, transfers, ['國泰CUBE', 'Richart']);
    expect(balances.find((b) => b.account === '國泰CUBE')?.balanceTwd).toBe(30_000);
    expect(balances.find((b) => b.account === 'Richart')?.balanceTwd).toBe(20_000);
  });

  it('帳戶屬性與代收備註', () => {
    const balances = calcTreasuryBalances([], [], ['客戶代收戶'], {}, {
      客戶代收戶: { ownershipType: 'proxy', note: '王先生' },
    });
    expect(balances[0]?.ownershipType).toBe('proxy');
    expect(balances[0]?.profileNote).toBe('王先生');
  });

  it('依帳戶屬性加總餘額', () => {
    const balances = calcTreasuryBalances(
      [],
      [],
      ['國泰CUBE', '客戶代收戶'],
      { 國泰CUBE: 100_000, 客戶代收戶: 50_000 },
      { 客戶代收戶: { ownershipType: 'proxy' } },
    );
    expect(calcTreasuryBalanceByOwnership(balances, 'own')).toBe(100_000);
    expect(calcTreasuryBalanceByOwnership(balances, 'proxy')).toBe(50_000);
  });

  it('起始資金異動不計入轉帳淨額', () => {
    const transfers = [
      {
        id: 'o1',
        kind: 'opening' as const,
        fromAccount: '—',
        toAccount: '國泰CUBE',
        amountTwd: 100_000,
        dateYmd: '2026-05-01',
        createdAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 't1',
        fromAccount: '國泰CUBE',
        toAccount: 'Richart',
        amountTwd: 20_000,
        dateYmd: '2026-05-02',
        createdAt: '2026-05-02T00:00:00.000Z',
      },
    ];
    expect(calcTransferNetForAccount('國泰CUBE', transfers)).toBe(-20_000);
  });

  it('合併資金異動紀錄', () => {
    const orders: WatchOrder[] = [
      {
        id: 'o1',
        source: 'customer',
        salePriceTwd: 50_000,
        isCompleted: true,
        status: 'completed',
        payments: [
          {
            id: 'p1',
            paymentType: 'full',
            amountTwd: 50_000,
            account: '國泰CUBE',
            dateYmd: '2026-05-03',
            createdAt: '2026-05-03T00:00:00.000Z',
          },
        ],
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
    ];
    const transfers = [
      {
        id: 'op1',
        kind: 'opening' as const,
        fromAccount: '—',
        toAccount: '國泰CUBE',
        amountTwd: 100_000,
        dateYmd: '2026-05-01',
        note: '起始資金注入',
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ];
    const movements = buildTreasuryMovements(transfers, orders);
    expect(movements).toHaveLength(2);
    expect(movements.find((m) => m.kind === 'opening')?.amountTwd).toBe(100_000);
    expect(movements.find((m) => m.kind === 'payment')?.amountTwd).toBe(50_000);
  });

  it('判斷入帳與出帳', () => {
    expect(isTreasuryMovementInflow({ fromAccount: '—', toAccount: '國泰CUBE' })).toBe(true);
    expect(isTreasuryMovementInflow({ fromAccount: '訂單收款', toAccount: '阿信' })).toBe(true);
    expect(isTreasuryMovementInflow({ fromAccount: '國泰CUBE', toAccount: 'Richart' })).toBe(false);
    expect(isTreasuryMovementInflow({ fromAccount: '國泰CUBE', toAccount: '—' })).toBe(false);
  });
});
