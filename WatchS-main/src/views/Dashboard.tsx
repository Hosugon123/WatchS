import { LayoutDashboard, TrendingUp, Watch, ShoppingCart } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { formatTwd } from '@/lib/format';
import { inventory, orders } from '@/services';
import type { WatchItem, WatchOrder } from '@/types/watch';
import { WATCH_ITEMS_UPDATED_EVENT } from '@/lib/watchItemStorage';
import { WATCH_ORDERS_UPDATED_EVENT } from '@/lib/watchOrderStorage';
import { PrimaryButton } from '@/components/Modal';

type DashboardProps = {
  onNavigate: (view: 'inventory' | 'orders') => void;
};

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [orderList, setOrderList] = useState<WatchOrder[]>([]);
  const [seeding, setSeeding] = useState(false);

  const reload = useCallback(async () => {
    const [i, o] = await Promise.all([inventory.list(), orders.list()]);
    setItems(i);
    setOrderList(o);
  }, []);

  useEffect(() => {
    void reload();
    const h = () => void reload();
    window.addEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
    window.addEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
    return () => {
      window.removeEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
      window.removeEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
    };
  }, [reload]);

  const inStock = items.filter((x) => x.status === 'in_stock').length;
  const sold = items.filter((x) => x.status === 'sold');
  const activeOrders = orderList.filter((x) => !x.isCompleted && x.status !== 'cancelled');
  const totalProfit = sold.reduce((s, x) => s + (x.profitTwd ?? 0), 0);
  const inventoryValue = items
    .filter((x) => x.status === 'in_stock' || x.status === 'reserved')
    .reduce((s, x) => s + x.totalTwdCost, 0);

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
        <KpiCard
          label="累計利潤"
          value={formatTwd(totalProfit)}
          sub={`已售 ${sold.length} 件`}
          color="text-emerald-600"
          icon={<TrendingUp className="h-5 w-5" />}
        />
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
