import { BarChart3, LayoutDashboard, Plus, Settings2, ShoppingCart, Trash2, TrendingUp, Watch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatTwd } from '@/lib/format';
import {
  computeSalesDashboardStats,
  computeSalesStatsForDateRange,
  SALES_PERIOD_LABELS,
  type SalesPeriodId,
} from '@/lib/salesAnalytics';
import { formatDateRangeLabel, periodStartYmd } from '@/lib/salesPeriod';
import { todayYmd } from '@/lib/format';
import { inventory, ledger, orders } from '@/services';
import type { WatchItem, WatchOrder } from '@/types/watch';
import { LEDGER_ENTRIES_UPDATED_EVENT } from '@/lib/ledgerStorage';
import { WATCH_ITEMS_UPDATED_EVENT } from '@/lib/watchItemStorage';
import { WATCH_ORDERS_UPDATED_EVENT } from '@/lib/watchOrderStorage';
import Modal, { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '@/components/Modal';
import {
  bucketsToFormRows,
  formRowsToBuckets,
  readSalePriceBuckets,
  DEFAULT_SALE_PRICE_BUCKETS,
  SALE_PRICE_BUCKETS_UPDATED_EVENT,
  writeSalePriceBuckets,
  type SalePriceBucketFormRow,
} from '@/lib/salePriceBucketStorage';
import { cn } from '@/lib/utils';

type DashboardProps = {
  onNavigate: (view: 'inventory' | 'orders') => void;
};

const SALES_PERIODS: SalesPeriodId[] = ['week', 'month', 'year'];
type SalesFilterMode = SalesPeriodId | 'custom';

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [orderList, setOrderList] = useState<WatchOrder[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<Awaited<ReturnType<typeof ledger.list>>>([]);
  const [seeding, setSeeding] = useState(false);
  const [salesFilter, setSalesFilter] = useState<SalesFilterMode>('month');
  const [customStartYmd, setCustomStartYmd] = useState(() => periodStartYmd('month'));
  const [customEndYmd, setCustomEndYmd] = useState(() => todayYmd());
  const [salePriceBuckets, setSalePriceBuckets] = useState(() => readSalePriceBuckets());
  const [bucketEditorOpen, setBucketEditorOpen] = useState(false);
  const [bucketFormRows, setBucketFormRows] = useState<SalePriceBucketFormRow[]>(() =>
    bucketsToFormRows(readSalePriceBuckets()),
  );
  const [bucketFormErr, setBucketFormErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [i, o, l] = await Promise.all([inventory.list(), orders.list(), ledger.list()]);
    setItems(i);
    setOrderList(o);
    setLedgerEntries(l);
  }, []);

  useEffect(() => {
    void reload();
    const h = () => void reload();
    window.addEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
    window.addEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
    window.addEventListener(LEDGER_ENTRIES_UPDATED_EVENT, h);
    return () => {
      window.removeEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
      window.removeEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
      window.removeEventListener(LEDGER_ENTRIES_UPDATED_EVENT, h);
    };
  }, [reload]);

  useEffect(() => {
    const syncBuckets = () => setSalePriceBuckets(readSalePriceBuckets());
    window.addEventListener(SALE_PRICE_BUCKETS_UPDATED_EVENT, syncBuckets);
    return () => window.removeEventListener(SALE_PRICE_BUCKETS_UPDATED_EVENT, syncBuckets);
  }, []);

  const openBucketEditor = () => {
    setBucketFormRows(bucketsToFormRows(salePriceBuckets));
    setBucketFormErr(null);
    setBucketEditorOpen(true);
  };

  const saveBucketConfig = () => {
    try {
      const next = writeSalePriceBuckets(formRowsToBuckets(bucketFormRows));
      setSalePriceBuckets(next);
      setBucketEditorOpen(false);
      setBucketFormErr(null);
    } catch (e) {
      setBucketFormErr(e instanceof Error ? e.message : '儲存失敗');
    }
  };

  const salesStats = useMemo(
    () => computeSalesDashboardStats(orderList, items, ledgerEntries, new Date(), salePriceBuckets),
    [orderList, items, ledgerEntries, salePriceBuckets],
  );

  const customRangeStats = useMemo(
    () =>
      salesFilter === 'custom'
        ? computeSalesStatsForDateRange(
            orderList,
            items,
            ledgerEntries,
            customStartYmd,
            customEndYmd,
            salePriceBuckets,
          )
        : null,
    [salesFilter, orderList, items, ledgerEntries, customStartYmd, customEndYmd, salePriceBuckets],
  );

  const periodSales =
    salesFilter === 'custom' ? customRangeStats!.metrics : salesStats.byPeriod[salesFilter];
  const periodPriceBuckets =
    salesFilter === 'custom'
      ? customRangeStats!.priceBuckets
      : salesStats.priceBucketsByPeriod[salesFilter];

  const periodHintLabel =
    salesFilter === 'custom'
      ? formatDateRangeLabel(customStartYmd, customEndYmd)
      : SALES_PERIOD_LABELS[salesFilter];

  const inStock = items.filter((x) => x.status === 'in_stock').length;
  const activeOrders = orderList.filter((x) => !x.isCompleted && x.status !== 'cancelled');
  const inventoryValue = items
    .filter((x) => x.status === 'in_stock' || x.status === 'reserved')
    .reduce((s, x) => s + x.totalTwdCost, 0);

  const maxBucketUnits = Math.max(1, ...periodPriceBuckets.map((b) => b.unitsSold));

  const seedDemo = async () => {
    setSeeding(true);
    try {
      const item1 = await inventory.create({
        style: { brand: 'Rolex', model: 'Submariner', reference: '126610LN', description: '黑水鬼 41mm' },
        rmbCost: 68_000,
        exchangeRate: 4.52,
        twdShippingFee: 2_500,
      });
      await inventory.create({
        style: { brand: 'Omega', model: 'Speedmaster', reference: '310.30.42.50.01.001', description: '月球錶' },
        rmbCost: 42_000,
        exchangeRate: 4.48,
        twdShippingFee: 1_800,
      });
      await orders.create({
        watchItemId: item1.id,
        salePriceTwd: 420_000,
        customerName: '王先生',
        initialPayment: {
          paymentType: 'deposit',
          amountTwd: 100_000,
          account: '國泰CUBE',
          dateYmd: new Date().toISOString().slice(0, 10),
        },
      });
      await reload();
    } finally {
      setSeeding(false);
    }
  };

  const isEmpty = items.length === 0 && orderList.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">營運概況</h2>
        </div>
        {isEmpty && (
          <PrimaryButton onClick={() => void seedDemo()} disabled={seeding}>
            {seeding ? '載入中…' : '載入示範資料'}
          </PrimaryButton>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <BarChart3 className="h-4 w-4 text-amber-600" />
            營運與銷售數據
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {SALES_PERIODS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSalesFilter(id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    salesFilter === id
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {SALES_PERIOD_LABELS[id]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSalesFilter('custom')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  salesFilter === 'custom'
                    ? 'bg-white text-amber-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                自訂
              </button>
            </div>
          </div>
        </div>

        {salesFilter === 'custom' && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">起始日期</span>
              <input
                type="date"
                value={customStartYmd}
                max={customEndYmd}
                onChange={(e) => setCustomStartYmd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </label>
            <span className="pb-2 text-slate-400">～</span>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">結束日期</span>
              <input
                type="date"
                value={customEndYmd}
                min={customStartYmd}
                max={todayYmd()}
                onChange={(e) => setCustomEndYmd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </label>
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white hover:text-amber-700"
              onClick={() => {
                setCustomStartYmd(periodStartYmd('month'));
                setCustomEndYmd(todayYmd());
              }}
            >
              重設為本月
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SalesMetricCard
            label="銷售件數"
            value={`${periodSales.unitsSold} 件`}
            hint={`${periodHintLabel} 成立訂單（不含已取消）`}
          />
          <SalesMetricCard
            label="營業額"
            value={formatTwd(periodSales.revenueTwd)}
            hint="成立訂單售價合計"
            accent="text-amber-700"
          />
          <SalesMetricCard
            label="營業收入"
            value={formatTwd(periodSales.operatingRevenueTwd)}
            hint="銷售額＋記帳收入"
            accent="text-amber-800"
          />
          <SalesMetricCard
            label="總支出"
            value={formatTwd(periodSales.ledgerExpenseTwd)}
            hint={`${periodHintLabel} 記帳支出`}
            accent="text-rose-600"
          />
          <SalesMetricCard
            label="毛利"
            value={formatTwd(periodSales.grossProfitTwd)}
            hint="售價 − 進貨成本"
            accent="text-emerald-600"
          />
          <SalesMetricCard
            label="綜合淨利"
            value={formatTwd(periodSales.netProfitTwd)}
            hint="銷售淨利＋記帳收入−支出"
            accent="text-blue-600"
          />
        </div>

        <div className="mt-6 border-t border-slate-100 pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-800">
              售價區間銷售數（{periodHintLabel} 成立）
            </h4>
            <SecondaryButton
              type="button"
              className="inline-flex items-center gap-1.5 py-1.5 text-xs"
              onClick={openBucketEditor}
            >
              <Settings2 className="h-3.5 w-3.5" />
              自訂區間
            </SecondaryButton>
          </div>
          <ul className="space-y-3">
            {periodPriceBuckets.map((row) => (
              <li key={row.bucketId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{row.label}</span>
                  <span className="font-medium tabular-nums text-slate-900">{row.unitsSold} 件</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${(row.unitsSold / maxBucketUnits) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="border-t border-slate-200 pt-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="在庫數量"
          value={String(inStock)}
          sub="件可售"
          color="text-amber-600"
          icon={<Watch className="h-5 w-5" />}
          onClick={() => onNavigate('inventory')}
        />
        <KpiCard
          label="進行中訂單"
          value={String(activeOrders.length)}
          sub="筆待收款"
          color="text-blue-600"
          icon={<ShoppingCart className="h-5 w-5" />}
          onClick={() => onNavigate('orders')}
        />
        <KpiCard
          label="庫存成本"
          value={formatTwd(inventoryValue)}
          sub="在庫＋預留"
          color="text-slate-700"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">最近庫存</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">尚無庫存，請至「庫存管理」新增，或載入示範資料。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="pb-2 font-medium">款式</th>
                  <th className="pb-2 font-medium">狀態</th>
                  <th className="pb-2 font-medium text-right">台幣總成本</th>
                  <th className="pb-2 font-medium text-right">利潤</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 5).map((item) => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="py-2.5 font-medium text-slate-800">
                      {item.style.brand} {item.style.model}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatTwd(item.totalTwdCost)}</td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-600">
                      {item.profitTwd != null ? formatTwd(item.profitTwd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={bucketEditorOpen} title="自訂售價區間" onClose={() => setBucketEditorOpen(false)} wide>
        <p className="mb-4 text-sm text-slate-500">
          自訂圖表顯示名稱與區間（單位：萬元）。最後一列上限留空表示「以上」；區間依下限排序後自動銜接。
        </p>
        {bucketFormErr && <p className="mb-3 text-sm text-red-600">{bucketFormErr}</p>}
        <div className="space-y-3">
          {bucketFormRows.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-[1fr_5rem_5rem_auto]"
            >
              <div>
                <FieldLabel>顯示名稱</FieldLabel>
                <TextInput
                  value={row.label}
                  onChange={(e) => {
                    const next = [...bucketFormRows];
                    next[index] = { ...row, label: e.target.value };
                    setBucketFormRows(next);
                  }}
                  placeholder="例如：10 萬以下"
                />
              </div>
              <div>
                <FieldLabel>下限（萬）</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  value={row.minWan}
                  onChange={(e) => {
                    const next = [...bucketFormRows];
                    next[index] = { ...row, minWan: e.target.value };
                    setBucketFormRows(next);
                  }}
                />
              </div>
              <div>
                <FieldLabel>上限（萬）</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  value={row.maxWan}
                  placeholder={index === bucketFormRows.length - 1 ? '留空' : ''}
                  onChange={(e) => {
                    const next = [...bucketFormRows];
                    next[index] = { ...row, maxWan: e.target.value };
                    setBucketFormRows(next);
                  }}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  disabled={bucketFormRows.length <= 1}
                  aria-label="刪除此區間"
                  onClick={() => setBucketFormRows(bucketFormRows.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-800"
          onClick={() =>
            setBucketFormRows([
              ...bucketFormRows,
              {
                id: `new-${Date.now()}`,
                label: '',
                minWan:
                  bucketFormRows.length > 0
                    ? bucketFormRows[bucketFormRows.length - 1]!.maxWan || '0'
                    : '0',
                maxWan: '',
              },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          新增區間
        </button>
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <SecondaryButton
            type="button"
            onClick={() => {
              setBucketFormRows(bucketsToFormRows(DEFAULT_SALE_PRICE_BUCKETS));
              setBucketFormErr(null);
            }}
          >
            恢復預設
          </SecondaryButton>
          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={() => setBucketEditorOpen(false)}>
              取消
            </SecondaryButton>
            <PrimaryButton type="button" onClick={saveBucketConfig}>
              儲存
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SalesMetricCard({
  label,
  value,
  hint,
  accent = 'text-slate-900',
}: {
  label: string;
  value: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', accent)}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm ${onClick ? 'cursor-pointer hover:border-amber-200 hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`rounded-lg bg-slate-50 p-2 ${color}`}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </Tag>
  );
}

function StatusBadge({ status }: { status: WatchItem['status'] }) {
  const map: Record<WatchItem['status'], string> = {
    in_stock: 'bg-emerald-50 text-emerald-700',
    reserved: 'bg-amber-50 text-amber-700',
    sold: 'bg-slate-100 text-slate-600',
    archived: 'bg-slate-100 text-slate-400',
  };
  const labels: Record<WatchItem['status'], string> = {
    in_stock: '在庫',
    reserved: '已預留',
    sold: '已售出',
    archived: '已封存',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  );
}
