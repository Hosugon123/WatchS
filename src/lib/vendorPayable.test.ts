import { describe, expect, it } from 'vitest';
import { calcTreasuryBalances, calcTransferNetForAccount } from './accountTreasury';
import { TREASURY_VENDOR_ACCOUNT } from './accountTreasury';
import {
  calcTotalVendorPayableBalance,
  calcVendorPayableSummaries,
  type VendorPayableEntry,
} from './vendorPayableStorage';

describe('vendorPayableStorage summaries', () => {
  const entries: VendorPayableEntry[] = [
    {
      id: '1',
      vendorName: '深圳錶行',
      kind: 'charge',
      amountTwd: 200_000,
      dateYmd: '2026-05-01',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: '2',
      vendorName: '深圳錶行',
      kind: 'payment',
      amountTwd: 50_000,
      fromAccount: 'Richart',
      dateYmd: '2026-05-15',
      createdAt: '2026-05-15T00:00:00.000Z',
    },
  ];

  it('計算廠商尚欠金額', () => {
    const summaries = calcVendorPayableSummaries(entries);
    expect(summaries[0]?.balanceTwd).toBe(150_000);
    expect(calcTotalVendorPayableBalance(entries)).toBe(150_000);
  });
});

describe('vendor payment treasury integration', () => {
  it('廠商還款從帳戶扣款', () => {
    const transfers = [
      {
        id: 'v1',
        kind: 'vendor_payment' as const,
        fromAccount: 'Richart',
        toAccount: TREASURY_VENDOR_ACCOUNT,
        amountTwd: 50_000,
        dateYmd: '2026-05-15',
        createdAt: '2026-05-15T00:00:00.000Z',
      },
    ];
    const balances = calcTreasuryBalances([], transfers, ['Richart'], { Richart: 300_000 });
    expect(balances.find((b) => b.account === 'Richart')?.balanceTwd).toBe(250_000);
    expect(calcTransferNetForAccount('Richart', transfers)).toBe(-50_000);
  });
});
