/**
 * 營運概況：訂單成立即計入的銷售統計（純函式，不含已取消）。
 */
import type { LedgerEntry } from './ledgerStorage';
import { sumLedgerByPeriod, sumLedgerForDateRange } from './ledgerAnalytics';
import { isYmdInPeriod, isYmdInRange, normalizeDateRange } from './salesPeriod';
import { sumPaymentsTwd } from './watchPayment';
import { calcProfitTwd, roundTwd } from './watchCost';
import {
  DEFAULT_SALE_PRICE_BUCKETS,
  readSalePriceBuckets,
  type SalePriceBucketDef,
} from './salePriceBucketStorage';
import type { WatchItem, WatchOrder, WatchStyle } from '@/types/watch';

export type SalesPeriodId = 'week' | 'month' | 'year';

export const SALES_PERIOD_LABELS: Record<SalesPeriodId, string> = {
  week: '本週',
  month: '本月',
  year: '本年',
};

export type { SalePriceBucketDef } from './salePriceBucketStorage';
export { DEFAULT_SALE_PRICE_BUCKETS, readSalePriceBuckets, SALE_PRICE_BUCKETS } from './salePriceBucketStorage';

export type SalesPeriodMetrics = {
  unitsSold: number;
  /** 成立訂單售價合計 */
  revenueTwd: number;
  /** 成立訂單估計毛利 */
  grossProfitTwd: number;
  /** 成立訂單估計淨利（含退款調整） */
  salesNetProfitTwd: number;
  /** 記帳收入 */
  ledgerIncomeTwd: number;
  /** 記帳支出 */
  ledgerExpenseTwd: number;
  /** 營業收入 = 銷售額 + 記帳收入 */
  operatingRevenueTwd: number;
  /** 綜合淨利 = 銷售淨利 + 記帳收入 − 記帳支出 */
  netProfitTwd: number;
};

export type ProductSalesRow = {
  key: string;
  label: string;
  unitsSold: number;
  revenueTwd: number;
};

export type PriceBucketRow = {
  bucketId: string;
  label: string;
  unitsSold: number;
};

export type SalesDashboardStats = {
  byPeriod: Record<SalesPeriodId, SalesPeriodMetrics>;
  productsByPeriod: Record<SalesPeriodId, ProductSalesRow[]>;
  priceBucketsByPeriod: Record<SalesPeriodId, PriceBucketRow[]>;
};

export type SalesRangeSlice = {
  metrics: SalesPeriodMetrics;
  products: ProductSalesRow[];
  priceBuckets: PriceBucketRow[];
};

/** 訂單成立日（建單日）；已取消不計入 */
function orderEstablishedYmd(order: WatchOrder): string | null {
  if (order.status === 'cancelled') return null;
  const raw = order.createdAt;
  if (!raw) return null;
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function orderCostTwd(order: WatchOrder, itemsById: Map<string, WatchItem>): number {
  if (order.totalTwdCost != null && Number.isFinite(order.totalTwdCost)) {
    return roundTwd(order.totalTwdCost);
  }
  if (order.watchItemId) {
    const item = itemsById.get(order.watchItemId);
    if (item) return roundTwd(item.totalTwdCost);
  }
  if (
    order.rmbCost != null &&
    order.exchangeRate != null &&
    order.twdShippingFee != null
  ) {
    return roundTwd(order.rmbCost * order.exchangeRate + order.twdShippingFee);
  }
  return 0;
}

function orderGrossProfit(order: WatchOrder, itemsById: Map<string, WatchItem>): number {
  if (order.profitTwd != null && Number.isFinite(order.profitTwd)) {
    return roundTwd(order.profitTwd);
  }
  return calcProfitTwd(order.salePriceTwd, orderCostTwd(order, itemsById));
}

function orderRefundTwd(order: WatchOrder): number {
  let refund = 0;
  for (const p of order.payments) {
    if (p.paymentType === 'refund') {
      refund += roundTwd(Math.abs(p.amountTwd));
    }
  }
  return refund;
}

/** 淨利：毛利 − 該單退款金額（若無成本資料則以實收 − 成本估算） */
function orderNetProfit(order: WatchOrder, itemsById: Map<string, WatchItem>): number {
  const gross = orderGrossProfit(order, itemsById);
  const refunds = orderRefundTwd(order);
  if (refunds > 0) {
    return roundTwd(gross - refunds);
  }
  const cost = orderCostTwd(order, itemsById);
  if (cost > 0 && order.isCompleted) {
    return roundTwd(sumPaymentsTwd(order.payments) - cost);
  }
  return gross;
}

function styleLabel(style: WatchStyle): string {
  const parts = [style.brand?.trim(), style.model?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '未命名款式';
}

function productKeyForOrder(order: WatchOrder, itemsById: Map<string, WatchItem>): string {
  if (order.watchItemId) {
    const item = itemsById.get(order.watchItemId);
    if (item) return `item:${styleLabel(item.style)}`;
  }
  if (order.orderStyle) return `order:${styleLabel(order.orderStyle)}`;
  return 'unknown:未指定款式';
}

function productLabelFromKey(key: string): string {
  const i = key.indexOf(':');
  return i >= 0 ? key.slice(i + 1) : key;
}

function bucketIdForPrice(salePriceTwd: number, buckets: readonly SalePriceBucketDef[]): string {
  const price = roundTwd(salePriceTwd);
  for (const b of buckets) {
    if (b.max == null) {
      if (price >= b.min) return b.id;
    } else if (price >= b.min && price < b.max) {
      return b.id;
    }
  }
  return buckets[0]?.id ?? 'default';
}

function emptyMetrics(): SalesPeriodMetrics {
  return {
    unitsSold: 0,
    revenueTwd: 0,
    grossProfitTwd: 0,
    salesNetProfitTwd: 0,
    ledgerIncomeTwd: 0,
    ledgerExpenseTwd: 0,
    operatingRevenueTwd: 0,
    netProfitTwd: 0,
  };
}

function finalizePeriodMetrics(m: SalesPeriodMetrics): void {
  m.operatingRevenueTwd = roundTwd(m.revenueTwd + m.ledgerIncomeTwd);
  m.netProfitTwd = roundTwd(m.salesNetProfitTwd + m.ledgerIncomeTwd - m.ledgerExpenseTwd);
}

function buildProductRows(map: Map<string, { unitsSold: number; revenueTwd: number }>): ProductSalesRow[] {
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: productLabelFromKey(key),
      unitsSold: v.unitsSold,
      revenueTwd: v.revenueTwd,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenueTwd - a.revenueTwd);
}

function buildPriceBuckets(
  map: Map<string, number>,
  buckets: readonly SalePriceBucketDef[],
): PriceBucketRow[] {
  return buckets.map((b) => ({
    bucketId: b.id,
    label: b.label,
    unitsSold: map.get(b.id) ?? 0,
  }));
}

function emptyBucketMap(buckets: readonly SalePriceBucketDef[]): Map<string, number> {
  return new Map(buckets.map((b) => [b.id, 0]));
}

export function computeSalesStatsForDateRange(
  orders: readonly WatchOrder[],
  items: readonly WatchItem[],
  ledgerEntries: readonly LedgerEntry[],
  startYmd: string,
  endYmd: string,
  buckets: readonly SalePriceBucketDef[] = readSalePriceBuckets(),
): SalesRangeSlice {
  const { startYmd: start, endYmd: end } = normalizeDateRange(startYmd, endYmd);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const metrics = emptyMetrics();
  const productMap = new Map<string, { unitsSold: number; revenueTwd: number }>();
  const bucketMap = emptyBucketMap(buckets);

  for (const order of orders) {
    const ymd = orderEstablishedYmd(order);
    if (!ymd || !isYmdInRange(ymd, start, end)) continue;

    const revenue = roundTwd(order.salePriceTwd);
    const gross = orderGrossProfit(order, itemsById);
    const net = orderNetProfit(order, itemsById);
    const pKey = productKeyForOrder(order, itemsById);
    const bucketId = bucketIdForPrice(order.salePriceTwd, buckets);

    metrics.unitsSold += 1;
    metrics.revenueTwd = roundTwd(metrics.revenueTwd + revenue);
    metrics.grossProfitTwd = roundTwd(metrics.grossProfitTwd + gross);
    metrics.salesNetProfitTwd = roundTwd(metrics.salesNetProfitTwd + net);

    const prod = productMap.get(pKey) ?? { unitsSold: 0, revenueTwd: 0 };
    prod.unitsSold += 1;
    prod.revenueTwd = roundTwd(prod.revenueTwd + revenue);
    productMap.set(pKey, prod);

    bucketMap.set(bucketId, (bucketMap.get(bucketId) ?? 0) + 1);
  }

  const ledger = sumLedgerForDateRange(ledgerEntries, start, end);
  metrics.ledgerIncomeTwd = ledger.incomeTwd;
  metrics.ledgerExpenseTwd = ledger.expenseTwd;
  finalizePeriodMetrics(metrics);

  return {
    metrics,
    products: buildProductRows(productMap),
    priceBuckets: buildPriceBuckets(bucketMap, buckets),
  };
}

export function computeSalesDashboardStats(
  orders: readonly WatchOrder[],
  items: readonly WatchItem[],
  ledgerEntries: readonly LedgerEntry[] = [],
  refDate = new Date(),
  buckets: readonly SalePriceBucketDef[] = readSalePriceBuckets(),
): SalesDashboardStats {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const byPeriod: Record<SalesPeriodId, SalesPeriodMetrics> = {
    week: emptyMetrics(),
    month: emptyMetrics(),
    year: emptyMetrics(),
  };

  const productMaps: Record<SalesPeriodId, Map<string, { unitsSold: number; revenueTwd: number }>> = {
    week: new Map(),
    month: new Map(),
    year: new Map(),
  };
  const bucketMaps: Record<SalesPeriodId, Map<string, number>> = {
    week: emptyBucketMap(buckets),
    month: emptyBucketMap(buckets),
    year: emptyBucketMap(buckets),
  };

  for (const order of orders) {
    const ymd = orderEstablishedYmd(order);
    if (!ymd) continue;

    const revenue = roundTwd(order.salePriceTwd);
    const gross = orderGrossProfit(order, itemsById);
    const net = orderNetProfit(order, itemsById);
    const pKey = productKeyForOrder(order, itemsById);
    const bucketId = bucketIdForPrice(order.salePriceTwd, buckets);

    for (const period of ['week', 'month', 'year'] as const) {
      if (!isYmdInPeriod(ymd, period, refDate)) continue;
      const m = byPeriod[period];
      m.unitsSold += 1;
      m.revenueTwd = roundTwd(m.revenueTwd + revenue);
      m.grossProfitTwd = roundTwd(m.grossProfitTwd + gross);
      m.salesNetProfitTwd = roundTwd(m.salesNetProfitTwd + net);

      const prod = productMaps[period].get(pKey) ?? { unitsSold: 0, revenueTwd: 0 };
      prod.unitsSold += 1;
      prod.revenueTwd = roundTwd(prod.revenueTwd + revenue);
      productMaps[period].set(pKey, prod);

      bucketMaps[period].set(bucketId, (bucketMaps[period].get(bucketId) ?? 0) + 1);
    }
  }

  const ledgerByPeriod = sumLedgerByPeriod(ledgerEntries, refDate);
  for (const period of ['week', 'month', 'year'] as const) {
    const m = byPeriod[period];
    const l = ledgerByPeriod[period];
    m.ledgerIncomeTwd = l.incomeTwd;
    m.ledgerExpenseTwd = l.expenseTwd;
    finalizePeriodMetrics(m);
  }

  const productsByPeriod = {} as Record<SalesPeriodId, ProductSalesRow[]>;
  const priceBucketsByPeriod = {} as Record<SalesPeriodId, PriceBucketRow[]>;

  for (const period of ['week', 'month', 'year'] as const) {
    productsByPeriod[period] = buildProductRows(productMaps[period]);
    priceBucketsByPeriod[period] = buildPriceBuckets(bucketMaps[period], buckets);
  }

  return { byPeriod, productsByPeriod, priceBucketsByPeriod };
}
