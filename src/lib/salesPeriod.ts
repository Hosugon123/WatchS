/**
 * 銷售／記帳共用的期間區間（本週週一～今日、本月、本年）。
 */
import type { SalesPeriodId } from './salesAnalytics';

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function periodStartYmd(period: SalesPeriodId, ref = new Date()): string {
  if (period === 'year') {
    return `${ref.getFullYear()}-01-01`;
  }
  if (period === 'month') {
    return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return toYmd(startOfWeekMonday(ref));
}

export function isYmdInPeriod(ymd: string, period: SalesPeriodId, ref = new Date()): boolean {
  const start = periodStartYmd(period, ref);
  const end = toYmd(ref);
  return isYmdInRange(ymd, start, end);
}

export function isYmdInRange(ymd: string, startYmd: string, endYmd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return ymd >= startYmd && ymd <= endYmd;
}

/** 正規化區間（起日不可晚於迄日） */
export function normalizeDateRange(startYmd: string, endYmd: string): { startYmd: string; endYmd: string } {
  if (!startYmd || !endYmd) {
    const today = toYmd(new Date());
    return { startYmd: today, endYmd: today };
  }
  if (startYmd <= endYmd) return { startYmd, endYmd };
  return { startYmd: endYmd, endYmd: startYmd };
}

export function formatDateRangeLabel(startYmd: string, endYmd: string): string {
  const { startYmd: s, endYmd: e } = normalizeDateRange(startYmd, endYmd);
  if (s === e) return s;
  return `${s}～${e}`;
}
