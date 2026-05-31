import { CheckCircle2, Pencil, Plus, ShoppingCart, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AccountField from '@/components/AccountField';
import VendorField from '@/components/VendorField';
import Modal, {
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  TextInput,
} from '@/components/Modal';
import { formatTwd, orderDisplayLabel, todayYmd } from '@/lib/format';
import { WATCH_ITEMS_UPDATED_EVENT } from '@/lib/watchItemStorage';
import { WATCH_ORDERS_UPDATED_EVENT } from '@/lib/watchOrderStorage';
import { VENDOR_PAYABLES_UPDATED_EVENT } from '@/lib/vendorPayableStorage';
import {
  inventory,
  orders,
  sumPaymentsTwd,
  calcTotalTwdCost,
  calcProfitTwd,
  inferPaymentType,
  treasury,
} from '@/services';
import type { WatchItem, WatchOrder, WatchOrderUpdate } from '@/types/watch';
import { normalizePaymentAccount } from '@/types/accounts';
import { WATCH_ORDER_SOURCE_LABELS, PAYMENT_TYPE_LABELS } from '@/types/watch';

type CreateMode = 'inventory' | 'customer';

const EMPTY_CREATE_FORM = {
  mode: 'customer' as CreateMode,
  watchItemId: '',
  brand: '',
  model: '',
  reference: '',
  description: '',
  rmbCost: '',
  exchangeRate: '',
  twdShippingFee: '0',
  vendorPayableVendor: '',
  salePriceTwd: '',
  customerName: '',
  note: '',
  withDeposit: false,
  depositAmount: '',
  depositAccount: '國泰CUBE',
};

const EMPTY_EDIT_FORM = {
  brand: '',
  model: '',
  reference: '',
  description: '',
  rmbCost: '',
  exchangeRate: '',
  twdShippingFee: '0',
  salePriceTwd: '',
  customerName: '',
  note: '',
};

export default function OrdersView() {
  const { can } = useAuth();
  const canEdit = can('edit_orders');
  const [orderList, setOrderList] = useState<WatchOrder[]>([]);
  const [items, setItems] = useState<WatchItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [vendorNames, setVendorNames] = useState<string[]>([]);

  const [payForm, setPayForm] = useState({
    amountTwd: '',
    account: '國泰CUBE',
    dateYmd: todayYmd(),
    note: '',
  });

  const reload = useCallback(async () => {
    const [o, i, vs] = await Promise.all([orders.list(), inventory.list(), treasury.listVendorSummaries()]);
    setOrderList(o);
    setItems(i);
    setVendorNames(vs.map((v) => v.vendorName));
    if (selectedId && !o.find((x) => x.id === selectedId)) {
      setSelectedId(o[0]?.id ?? null);
    } else if (!selectedId && o[0]) {
      setSelectedId(o[0].id);
    }
  }, [selectedId]);

  useEffect(() => {
    void reload();
    const h = () => void reload();
    window.addEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
    window.addEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
    window.addEventListener(VENDOR_PAYABLES_UPDATED_EVENT, h);
    return () => {
      window.removeEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
      window.removeEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
      window.removeEventListener(VENDOR_PAYABLES_UPDATED_EVENT, h);
    };
  }, [reload]);

  const selected = useMemo(
    () => orderList.find((x) => x.id === selectedId) ?? null,
    [orderList, selectedId],
  );

  const selectedItem = useMemo(
    () => (selected ? items.find((x) => x.id === selected.watchItemId) ?? null : null),
    [selected, items],
  );

  const availableItems = items.filter((x) => x.status === 'in_stock' || x.status === 'reserved');

  const paymentTotal = selected ? sumPaymentsTwd(selected.payments) : 0;
  const remaining = selected ? selected.salePriceTwd - paymentTotal : 0;

  const previewOrderCost = useMemo(() => {
    const rmb = Number(createForm.rmbCost) || 0;
    const rate = Number(createForm.exchangeRate) || 0;
    const ship = Number(createForm.twdShippingFee) || 0;
    if (rmb <= 0 || rate <= 0) return null;
    return calcTotalTwdCost(rmb, rate, ship);
  }, [createForm.rmbCost, createForm.exchangeRate, createForm.twdShippingFee]);

  const createInventoryItem = useMemo(
    () => (createForm.watchItemId ? items.find((x) => x.id === createForm.watchItemId) ?? null : null),
    [createForm.watchItemId, items],
  );

  const previewVendorCharge = useMemo(() => {
    if (createForm.mode === 'inventory') {
      return createInventoryItem?.totalTwdCost ?? null;
    }
    return previewOrderCost;
  }, [createForm.mode, createInventoryItem, previewOrderCost]);

  const previewEditCost = useMemo(() => {
    const rmb = Number(editForm.rmbCost) || 0;
    const rate = Number(editForm.exchangeRate) || 0;
    const ship = Number(editForm.twdShippingFee) || 0;
    if (rmb <= 0 || rate <= 0) return null;
    return calcTotalTwdCost(rmb, rate, ship);
  }, [editForm.rmbCost, editForm.exchangeRate, editForm.twdShippingFee]);

  const isCustomerOrder = selected?.source === 'customer' && !selected?.watchItemId;

  const selectedTotalCost = useMemo(() => {
    if (!selected) return null;
    if (selected.totalTwdCost != null && selected.totalTwdCost > 0) return selected.totalTwdCost;
    if (selectedItem?.totalTwdCost) return selectedItem.totalTwdCost;
    const rmb = selected.rmbCost ?? selectedItem?.rmbCost;
    const rate = selected.exchangeRate ?? selectedItem?.exchangeRate;
    const ship = selected.twdShippingFee ?? selectedItem?.twdShippingFee ?? 0;
    if (rmb == null || rate == null || rmb <= 0 || rate <= 0) return null;
    return calcTotalTwdCost(rmb, rate, ship);
  }, [selected, selectedItem]);

  const selectedProfitDisplay = useMemo(() => {
    if (!selected) return null;
    if (selected.profitTwd != null) return selected.profitTwd;
    if (selectedTotalCost == null) return null;
    return calcProfitTwd(selected.salePriceTwd, selectedTotalCost);
  }, [selected, selectedTotalCost]);

  const createOrder = async () => {
    const salePriceTwd = Number(createForm.salePriceTwd);
    if (!salePriceTwd) {
      setMsg('請填寫售價');
      return;
    }

    if (createForm.mode === 'inventory') {
      if (!createForm.watchItemId) {
        setMsg('請選擇庫存');
        return;
      }
    } else if (!createForm.brand.trim() || !createForm.model.trim()) {
      setMsg('客戶下單請填寫品牌與型號');
      return;
    }

    const vendor = createForm.vendorPayableVendor.trim();
    if (vendor && (!previewVendorCharge || previewVendorCharge <= 0)) {
      setMsg('填寫代付廠商時，請先填寫成本（客戶下單）或選擇有成本的庫存');
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      if (createForm.withDeposit && Number(createForm.depositAmount) > 0 && !normalizePaymentAccount(createForm.depositAccount)) {
        setMsg('請填寫流入帳戶');
        setBusy(false);
        return;
      }

      const base = {
        salePriceTwd,
        customerName: createForm.customerName.trim() || undefined,
        note: createForm.note.trim() || undefined,
        vendorPayableVendor: vendor || undefined,
        initialPayment:
          createForm.withDeposit && Number(createForm.depositAmount) > 0
            ? {
                paymentType: 'deposit' as const,
                amountTwd: Number(createForm.depositAmount),
                account: createForm.depositAccount,
                dateYmd: todayYmd(),
              }
            : undefined,
      };

      const order = await orders.create(
        createForm.mode === 'inventory'
          ? { ...base, watchItemId: createForm.watchItemId }
          : {
              ...base,
              orderStyle: {
                brand: createForm.brand.trim(),
                model: createForm.model.trim(),
                reference: createForm.reference.trim() || undefined,
                description: createForm.description.trim() || undefined,
              },
              ...(Number(createForm.rmbCost) > 0 && Number(createForm.exchangeRate) > 0
                ? {
                    rmbCost: Number(createForm.rmbCost),
                    exchangeRate: Number(createForm.exchangeRate),
                    twdShippingFee: Number(createForm.twdShippingFee) || 0,
                  }
                : {}),
            },
      );
      setCreateOpen(false);
      setSelectedId(order.id);
      setCreateForm(EMPTY_CREATE_FORM);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '建立失敗');
    } finally {
      setBusy(false);
    }
  };

  const addPayment = async () => {
    if (!selected) return;
    const amountTwd = Number(payForm.amountTwd);
    if (!amountTwd) {
      setMsg('請填寫金額');
      return;
    }
    if (!normalizePaymentAccount(payForm.account)) {
      setMsg('請填寫流入帳戶');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await orders.appendPayment(selected.id, {
        paymentType: inferPaymentType(selected, amountTwd),
        amountTwd,
        account: payForm.account,
        dateYmd: payForm.dateYmd,
        note: payForm.note.trim() || undefined,
      });
      setPaymentOpen(false);
      setPayForm({ amountTwd: '', account: '國泰CUBE', dateYmd: todayYmd(), note: '' });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '新增金流失敗');
    } finally {
      setBusy(false);
    }
  };

  const tryComplete = async () => {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await orders.tryComplete(selected.id);
      if (!result) {
        setMsg('找不到訂單');
        return;
      }
      if (result.completed) {
        const profitMsg =
          result.order.profitTwd != null
            ? `結案成功！利潤 ${formatTwd(result.order.profitTwd)}`
            : '結案成功！';
        setMsg(profitMsg);
      } else {
        setMsg(result.check.reason ?? '金流尚未齊備，無法結案');
      }
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '結案失敗');
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await orders.remove(id);
      setDeleteConfirmOpen(false);
      if (selectedId === id) setSelectedId(null);
      setMsg('已刪除訂單');
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setBusy(false);
    }
  };

  const openEditOrder = () => {
    if (!selected || selected.isCompleted) return;
    setEditForm({
      brand: selected.orderStyle?.brand ?? '',
      model: selected.orderStyle?.model ?? '',
      reference: selected.orderStyle?.reference ?? '',
      description: selected.orderStyle?.description ?? '',
      rmbCost: selected.rmbCost != null ? String(selected.rmbCost) : '',
      exchangeRate: selected.exchangeRate != null ? String(selected.exchangeRate) : '',
      twdShippingFee: selected.twdShippingFee != null ? String(selected.twdShippingFee) : '0',
      salePriceTwd: String(selected.salePriceTwd),
      customerName: selected.customerName ?? '',
      note: selected.note ?? '',
    });
    setEditOpen(true);
  };

  const submitEditOrder = async () => {
    if (!selected) return;
    const salePriceTwd = Number(editForm.salePriceTwd);
    if (!salePriceTwd) {
      setMsg('請填寫售價');
      return;
    }

    const patch: WatchOrderUpdate = {
      salePriceTwd,
      customerName: editForm.customerName.trim() || undefined,
      note: editForm.note.trim() || undefined,
    };

    if (isCustomerOrder) {
      if (!editForm.brand.trim() || !editForm.model.trim()) {
        setMsg('請填寫品牌與型號');
        return;
      }
      patch.orderStyle = {
        brand: editForm.brand.trim(),
        model: editForm.model.trim(),
        reference: editForm.reference.trim() || undefined,
        description: editForm.description.trim() || undefined,
      };
      const rmb = Number(editForm.rmbCost);
      const rate = Number(editForm.exchangeRate);
      if (rmb > 0 && rate > 0) {
        patch.rmbCost = rmb;
        patch.exchangeRate = rate;
        patch.twdShippingFee = Number(editForm.twdShippingFee) || 0;
      } else {
        patch.rmbCost = undefined;
        patch.exchangeRate = undefined;
        patch.twdShippingFee = undefined;
      }
    }

    setBusy(true);
    setMsg(null);
    try {
      await orders.update(selected.id, patch);
      setEditOpen(false);
      setMsg('已更新訂單');
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">訂單管理</h2>
        </div>
        {canEdit && (
          <PrimaryButton
            onClick={() => {
              setMsg(null);
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            建立訂單
          </PrimaryButton>
        )}
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-3 text-sm ${msg.includes('成功') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">訂單列表</p>
          {orderList.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400">尚無訂單</p>
          ) : (
            orderList.map((order) => {
              const item = items.find((x) => x.id === order.watchItemId);
              const paid = sumPaymentsTwd(order.payments);
              const active = order.id === selectedId;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(order.id);
                    setMsg(null);
                  }}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    active ? 'border-amber-300 bg-amber-50' : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <p className="font-medium text-slate-900">{orderDisplayLabel(order, item)}</p>
                  <p className="text-xs text-slate-500">
                    {order.customerName || '未命名客戶'}
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {WATCH_ORDER_SOURCE_LABELS[order.source ?? (order.watchItemId ? 'inventory' : 'customer')]}
                    </span>
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="tabular-nums text-slate-600">{formatTwd(order.salePriceTwd)}</span>
                    {order.isCompleted ? (
                      <span className="text-emerald-600">已結案</span>
                    ) : (
                      <span className="text-amber-600">
                        已收 {formatTwd(paid)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {selected ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {orderDisplayLabel(selected, selectedItem)}
                </h3>
                <p className="text-sm text-slate-500">
                  {WATCH_ORDER_SOURCE_LABELS[selected.source ?? (selected.watchItemId ? 'inventory' : 'customer')]}
                  {' · '}
                  客戶：{selected.customerName || '—'} · 售價{' '}
                  <span className="font-medium text-slate-800">{formatTwd(selected.salePriceTwd)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !selected.isCompleted && (
                  <button
                    type="button"
                    onClick={openEditOrder}
                    className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                    title="編輯訂單"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selected.isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selected.isCompleted ? '已結案' : '進行中'}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatBox label="已收金額" value={formatTwd(paymentTotal)} color="text-blue-600" />
              <StatBox
                label="待收"
                value={formatTwd(Math.max(0, remaining))}
                color={remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}
              />
              <StatBox
                label="成本 / 利潤"
                value={
                  selectedTotalCost != null
                    ? `${formatTwd(selectedTotalCost)} / ${
                        selectedProfitDisplay != null ? formatTwd(selectedProfitDisplay) : '—'
                      }`
                    : '尚未填寫成本'
                }
                color="text-slate-700"
                small
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Wallet className="h-4 w-4" />
                  金流明細
                </p>
                {canEdit && !selected.isCompleted && (
                  <PrimaryButton className="!py-1.5 !px-3 text-xs" onClick={() => setPaymentOpen(true)}>
                    收款記入
                  </PrimaryButton>
                )}
              </div>
              {selected.payments.length === 0 ? (
                <p className="text-sm text-slate-400">尚無金流紀錄</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">類型</th>
                        <th className="px-3 py-2 text-left font-medium">帳戶</th>
                        <th className="px-3 py-2 text-left font-medium">日期</th>
                        <th className="px-3 py-2 text-right font-medium">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.payments.map((p) => (
                        <tr key={p.id} className="border-t border-slate-50">
                          <td className="px-3 py-2">{PAYMENT_TYPE_LABELS[p.paymentType]}</td>
                          <td className="px-3 py-2">{p.account}</td>
                          <td className="px-3 py-2">{p.dateYmd}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {p.paymentType === 'refund' ? '-' : ''}
                            {formatTwd(Math.abs(p.amountTwd))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canEdit && !selected.isCompleted && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <PrimaryButton
                  onClick={() => void tryComplete()}
                  disabled={busy || remaining !== 0}
                  className="inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  完成訂單
                </PrimaryButton>
                {remaining !== 0 && (
                  <p className="self-center text-xs text-slate-500">
                    金流加總須等於售價才可結案（目前差額 {formatTwd(remaining)}）
                  </p>
                )}
                <SecondaryButton onClick={() => setDeleteConfirmOpen(true)} className="ml-auto text-red-600">
                  刪除訂單
                </SecondaryButton>
              </div>
            )}

            {selected.isCompleted && (
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {selectedItem
                  ? `已結案 · 庫存狀態已更新為「已售出」· 利潤 ${formatTwd(selected.profitTwd ?? 0)}`
                  : selected.profitTwd != null
                    ? `已結案 · 客戶下單 · 利潤 ${formatTwd(selected.profitTwd)}`
                    : '已結案 · 客戶下單（未填成本，無法計算利潤）'}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-12 text-slate-400">
            選擇左側訂單以管理金流
          </div>
        )}
      </div>

      <Modal open={createOpen} title="建立訂單" onClose={() => setCreateOpen(false)} wide>
        <div className="mb-4 flex gap-2 rounded-lg bg-slate-100 p-1">
          {(['customer', 'inventory'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCreateForm({ ...createForm, mode, watchItemId: '' })}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                createForm.mode === mode ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-600'
              }`}
            >
              {WATCH_ORDER_SOURCE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {createForm.mode === 'inventory' ? (
            <div className="sm:col-span-2">
              <FieldLabel required>選擇庫存</FieldLabel>
              <SelectInput
                value={createForm.watchItemId}
                onChange={(e) => setCreateForm({ ...createForm, watchItemId: e.target.value })}
              >
                <option value="">— 請選擇 —</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {orderDisplayLabel({ watchItemId: item.id }, item)} · 成本 {formatTwd(item.totalTwdCost)}
                  </option>
                ))}
              </SelectInput>
              {availableItems.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">目前無在庫品項，可改選「客戶下單」模式。</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <FieldLabel required>品牌</FieldLabel>
                <TextInput
                  value={createForm.brand}
                  onChange={(e) => setCreateForm({ ...createForm, brand: e.target.value })}
                  placeholder="Rolex"
                />
              </div>
              <div>
                <FieldLabel required>型號</FieldLabel>
                <TextInput
                  value={createForm.model}
                  onChange={(e) => setCreateForm({ ...createForm, model: e.target.value })}
                  placeholder="Submariner"
                />
              </div>
              <div>
                <FieldLabel>官方編號</FieldLabel>
                <TextInput
                  value={createForm.reference}
                  onChange={(e) => setCreateForm({ ...createForm, reference: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>需求描述</FieldLabel>
                <TextInput
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="錶徑、材質、年份…"
                />
              </div>
              <div className="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <p className="mb-3 text-sm font-semibold text-amber-900">進貨成本（換匯當下）</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>人民幣金額</FieldLabel>
                    <TextInput
                      type="number"
                      value={createForm.rmbCost}
                      onChange={(e) => setCreateForm({ ...createForm, rmbCost: e.target.value })}
                      placeholder="68000"
                    />
                  </div>
                  <div>
                    <FieldLabel>匯率</FieldLabel>
                    <TextInput
                      type="number"
                      step="0.01"
                      value={createForm.exchangeRate}
                      onChange={(e) => setCreateForm({ ...createForm, exchangeRate: e.target.value })}
                      placeholder="4.52"
                    />
                  </div>
                  <div>
                    <FieldLabel>台幣運費</FieldLabel>
                    <TextInput
                      type="number"
                      value={createForm.twdShippingFee}
                      onChange={(e) => setCreateForm({ ...createForm, twdShippingFee: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full rounded-lg bg-white px-4 py-3 ring-1 ring-amber-100">
                      <p className="text-xs text-amber-700">台幣成本（RMB × 匯率 + 運費）</p>
                      <p className="text-lg font-bold tabular-nums text-amber-800">
                        {previewOrderCost != null ? formatTwd(previewOrderCost) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="sm:col-span-2 rounded-xl border border-rose-100 bg-rose-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-rose-900">代付廠商（選填）</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>代付廠商</FieldLabel>
                <VendorField
                  value={createForm.vendorPayableVendor}
                  onChange={(vendorPayableVendor) => setCreateForm({ ...createForm, vendorPayableVendor })}
                  suggestions={vendorNames}
                  placeholder="例如：深圳錶行、王老板"
                />
                <p className="mt-1 text-xs text-rose-600">填寫後，台幣成本將自動記入該廠商欠款</p>
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-lg bg-white px-4 py-3 ring-1 ring-rose-100">
                  <p className="text-xs text-rose-700">記入廠商欠款（台幣）</p>
                  <p className="text-lg font-bold tabular-nums text-rose-800">
                    {createForm.vendorPayableVendor.trim() && previewVendorCharge != null
                      ? formatTwd(previewVendorCharge)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <FieldLabel required>售價（台幣）</FieldLabel>
            <TextInput
              type="number"
              value={createForm.salePriceTwd}
              onChange={(e) => setCreateForm({ ...createForm, salePriceTwd: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>客戶姓名</FieldLabel>
            <TextInput
              value={createForm.customerName}
              onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={createForm.withDeposit}
                onChange={(e) => setCreateForm({ ...createForm, withDeposit: e.target.checked })}
              />
              建單時一併登記訂金
            </label>
          </div>
          {createForm.withDeposit && (
            <>
              <div>
                <FieldLabel>訂金金額</FieldLabel>
                <TextInput
                  type="number"
                  value={createForm.depositAmount}
                  onChange={(e) => setCreateForm({ ...createForm, depositAmount: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <AccountField
                  value={createForm.depositAccount}
                  onChange={(depositAccount) => setCreateForm({ ...createForm, depositAccount })}
                />
              </div>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setCreateOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void createOrder()} disabled={busy}>
            建立
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={editOpen} title="編輯訂單" onClose={() => setEditOpen(false)} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          {selected?.watchItemId && selectedItem && (
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              庫存品項：{orderDisplayLabel(selected, selectedItem)} · 成本 {formatTwd(selectedItem.totalTwdCost)}
            </div>
          )}
          {isCustomerOrder && (
            <>
              <div>
                <FieldLabel required>品牌</FieldLabel>
                <TextInput
                  value={editForm.brand}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel required>型號</FieldLabel>
                <TextInput
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>官方編號</FieldLabel>
                <TextInput
                  value={editForm.reference}
                  onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>需求描述</FieldLabel>
                <TextInput
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <p className="mb-3 text-sm font-semibold text-amber-900">進貨成本（換匯當下）</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>人民幣金額</FieldLabel>
                    <TextInput
                      type="number"
                      value={editForm.rmbCost}
                      onChange={(e) => setEditForm({ ...editForm, rmbCost: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>匯率</FieldLabel>
                    <TextInput
                      type="number"
                      step="0.01"
                      value={editForm.exchangeRate}
                      onChange={(e) => setEditForm({ ...editForm, exchangeRate: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>台幣運費</FieldLabel>
                    <TextInput
                      type="number"
                      value={editForm.twdShippingFee}
                      onChange={(e) => setEditForm({ ...editForm, twdShippingFee: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full rounded-lg bg-white px-4 py-3 ring-1 ring-amber-100">
                      <p className="text-xs text-amber-700">台幣成本（RMB × 匯率 + 運費）</p>
                      <p className="text-lg font-bold tabular-nums text-amber-800">
                        {previewEditCost != null ? formatTwd(previewEditCost) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <div>
            <FieldLabel required>售價（台幣）</FieldLabel>
            <TextInput
              type="number"
              value={editForm.salePriceTwd}
              onChange={(e) => setEditForm({ ...editForm, salePriceTwd: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>客戶姓名</FieldLabel>
            <TextInput
              value={editForm.customerName}
              onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>備註</FieldLabel>
            <TextInput
              value={editForm.note}
              onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setEditOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitEditOrder()} disabled={busy}>
            儲存
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={deleteConfirmOpen} title="確認刪除訂單" onClose={() => setDeleteConfirmOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">確定要刪除此訂單嗎？此操作無法復原。</p>
          {selected && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 px-4 py-3 text-sm">
              <p className="font-medium text-slate-900">{orderDisplayLabel(selected, selectedItem)}</p>
              <p className="mt-1 text-slate-600">
                客戶：{selected.customerName || '—'} · 售價 {formatTwd(selected.salePriceTwd)}
              </p>
              {selected.payments.length > 0 && (
                <p className="mt-1 text-amber-700">
                  此訂單已有 {selected.payments.length} 筆收款紀錄，刪除後將一併移除。
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setDeleteConfirmOpen(false)}>取消</SecondaryButton>
          <PrimaryButton
            onClick={() => selected && void removeOrder(selected.id)}
            disabled={busy}
            className="!bg-red-600 hover:!bg-red-700"
          >
            確認刪除
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={paymentOpen} title="收款記入" onClose={() => setPaymentOpen(false)}>
        <div className="space-y-4">
          <div>
            <FieldLabel required>台幣金額</FieldLabel>
            <TextInput
              type="number"
              value={payForm.amountTwd}
              onChange={(e) => setPayForm({ ...payForm, amountTwd: e.target.value })}
              placeholder={remaining > 0 ? `建議 ${remaining}` : ''}
            />
          </div>
          <AccountField
            value={payForm.account}
            onChange={(account) => setPayForm({ ...payForm, account })}
          />
          <div>
            <FieldLabel required>收款日</FieldLabel>
            <TextInput
              type="date"
              value={payForm.dateYmd}
              onChange={(e) => setPayForm({ ...payForm, dateYmd: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setPaymentOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void addPayment()} disabled={busy}>
            新增
          </PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: string;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${small ? 'text-sm' : 'text-lg'} font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
