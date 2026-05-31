/**
 * 記帳收支依期間彙總（純函式）。
 */
import type { SalesPeriodId } from './salesAnalytics';
import { isYmdInPeriod, isYmdInRange } from './salesPeriod';
import { roundTwd } from './watchCost';
import type { LedgerEntry } from './ledgerStorage';

export type LedgerPeriodTotals = {
  incomeTwd: number;
  expenseTwd: number;
};

export function sumLedgerByPeriod(
  entries: readonly LedgerEntry[],
  refDate = new Date(),
): Record<SalesPeriodId, LedgerPeriodTotals> {
  const out: Record<SalesPeriodId, LedgerPeriodTotals> = {
    week: { incomeTwd: 0, expenseTwd: 0 },
    month: { incomeTwd: 0, expenseTwd: 0 },
    year: { incomeTwd: 0, expenseTwd: 0 },
  };

  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dateYmd)) continue;
    for (const period of ['week', 'month', 'year'] as const) {
      if (!isYmdInPeriod(e.dateYmd, period, refDate)) continue;
      const row = out[period];
      if (e.type === 'income') {
        row.incomeTwd = roundTwd(row.incomeTwd + e.amountTwd);
      } else {
        row.expenseTwd = roundTwd(row.expenseTwd + e.amountTwd);
      }
    }
  }

  return out;
}

export function sumLedgerForDateRange(
  entries: readonly LedgerEntry[],
  startYmd: string,
  endYmd: string,
): LedgerPeriodTotals {
  const out: LedgerPeriodTotals = { incomeTwd: 0, expenseTwd: 0 };
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dateYmd)) continue;
    if (!isYmdInRange(e.dateYmd, startYmd, endYmd)) continue;
    if (e.type === 'income') {
      out.incomeTwd = roundTwd(out.incomeTwd + e.amountTwd);
    } else {
      out.expenseTwd = roundTwd(out.expenseTwd + e.amountTwd);
    }
  }
  return out;
}
