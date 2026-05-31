/**
 * 手錶銷售訂單（本機 localStorage）
 */
import { assertPaymentAccount } from '../types/accounts';
import type {
  NewWatchOrderInput,
  NewWatchOrderPaymentInput,
  WatchOrder,
  WatchOrderPayment,
  WatchOrderUpdate,
  WatchStyle,
} from '../types/watch';
import { completeCustomerOrderIfPaid, completeOrderIfPaid } from './watchPayment';
import { calcTotalTwdCost } from './watchCost';
import { getWatchItemById, saveWatchItem } from './watchItemStorage';

const STORAGE_KEY = 'shengwatch_orders_v1';
export const WATCH_ORDERS_UPDATED_EVENT = 'shengwatchOrdersUpdated';

type StoreV1 = {
  version: 1;
  orders: WatchOrder[];
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, orders: [] };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.orders)) {
      return { version: 1, orders: [] };
    }
    return parsed;
  } catch {
    return { version: 1, orders: [] };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(WATCH_ORDERS_UPDATED_EVENT));
}

function buildPayment(input: NewWatchOrderPaymentInput): WatchOrderPayment {
  const now = new Date().toISOString();
  return {
    id: newId(),
    paymentType: input.paymentType,
    amountTwd: input.amountTwd,
    account: assertPaymentAccount(input.account),
    dateYmd: input.dateYmd,
    note: input.note?.trim() || undefined,
    createdAt: now,
  };
}

function normalizeStyle(style: WatchStyle): WatchStyle {
  return {
    brand: style.brand.trim(),
    model: style.model.trim(),
    reference: style.reference?.trim() || undefined,
    description: style.description?.trim() || undefined,
  };
}

/** 舊資料相容：無 source 時依 watchItemId 推斷 */
export function normalizeWatchOrder(order: WatchOrder): WatchOrder {
  const source = order.source ?? (order.watchItemId ? 'inventory' : 'customer');
  return { ...order, source };
}

export function listWatchOrders(): WatchOrder[] {
  return readStore().orders.map(normalizeWatchOrder).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWatchOrderById(id: string): WatchOrder | null {
  const order = readStore().orders.find((o) => o.id === id);
  return order ? normalizeWatchOrder(order) : null;
}

export function listWatchOrdersByItemId(watchItemId: string): WatchOrder[] {
  return listWatchOrders().filter((order) => order.watchItemId === watchItemId);
}

export function createWatchOrder(input: NewWatchOrderInput): WatchOrder {
  const hasItem = Boolean(input.watchItemId?.trim());
  const style = input.orderStyle ? normalizeStyle(input.orderStyle) : undefined;
  const hasStyle = Boolean(style?.brand && style?.model);

  if (!hasItem && !hasStyle) {
    throw new Error('請選擇庫存，或填寫客戶下單的款式（品牌＋型號）');
  }

  if (hasItem) {
    const item = getWatchItemById(input.watchItemId!);
    if (!item) {
      throw new Error('找不到對應的庫存品項');
    }
    if (item.status === 'sold') {
      throw new Error('此手錶已售出，無法建立新訂單');
    }
  }

  const now = new Date().toISOString();
  const payments: WatchOrderPayment[] = input.initialPayment
    ? [buildPayment(input.initialPayment)]
    : [];

  const isCustomer = !hasItem;
  let rmbCost: number | undefined;
  let exchangeRate: number | undefined;
  let twdShippingFee: number | undefined;
  let totalTwdCost: number | undefined;

  if (isCustomer && input.rmbCost != null && input.exchangeRate != null) {
    rmbCost = Math.max(0, Number(input.rmbCost) || 0);
    exchangeRate = Math.max(0, Number(input.exchangeRate) || 0);
    twdShippingFee = Math.max(0, Number(input.twdShippingFee) || 0);
    if (rmbCost > 0 && exchangeRate > 0) {
      totalTwdCost = calcTotalTwdCost(rmbCost, exchangeRate, twdShippingFee);
    }
  }

  const order: WatchOrder = {
    id: newId(),
    source: hasItem ? 'inventory' : 'customer',
    watchItemId: hasItem ? input.watchItemId : undefined,
    orderStyle: hasItem ? undefined : style,
    rmbCost: isCustomer ? rmbCost : undefined,
    exchangeRate: isCustomer ? exchangeRate : undefined,
    twdShippingFee: isCustomer ? twdShippingFee : undefined,
    totalTwdCost: isCustomer ? totalTwdCost : undefined,
    salePriceTwd: input.salePriceTwd,
    payments,
    status: 'active',
    isCompleted: false,
    customerName: input.customerName?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const store = readStore();
  store.orders.push(order);
  writeStore(store);
  return order;
}

export function updateWatchOrder(id: string, patch: WatchOrderUpdate): WatchOrder | null {
  const store = readStore();
  const idx = store.orders.findIndex((order) => order.id === id);
  if (idx < 0) return null;

  const prev = normalizeWatchOrder(store.orders[idx]);
  if (prev.isCompleted) {
    throw new Error('已結案訂單不可修改');
  }

  const next: WatchOrder = {
    ...prev,
    ...patch,
    orderStyle: patch.orderStyle ? normalizeStyle(patch.orderStyle) : prev.orderStyle,
    customerName: patch.customerName !== undefined ? patch.customerName.trim() || undefined : prev.customerName,
    note: patch.note !== undefined ? patch.note.trim() || undefined : prev.note,
    updatedAt: new Date().toISOString(),
  };

  if (prev.source === 'customer' && !prev.watchItemId) {
    const rmbCost = 'rmbCost' in patch ? patch.rmbCost : prev.rmbCost;
    const exchangeRate = 'exchangeRate' in patch ? patch.exchangeRate : prev.exchangeRate;
    const twdShippingFee = 'twdShippingFee' in patch ? patch.twdShippingFee : (prev.twdShippingFee ?? 0);
    next.rmbCost = rmbCost;
    next.exchangeRate = exchangeRate;
    next.twdShippingFee = twdShippingFee;
    if (rmbCost != null && exchangeRate != null && rmbCost > 0 && exchangeRate > 0) {
      next.totalTwdCost = calcTotalTwdCost(rmbCost, exchangeRate, twdShippingFee ?? 0);
    } else if ('rmbCost' in patch || 'exchangeRate' in patch || 'twdShippingFee' in patch) {
      next.totalTwdCost = undefined;
    }
  }

  store.orders[idx] = next;
  writeStore(store);
  return next;
}

export function appendWatchOrderPayment(orderId: string, input: NewWatchOrderPaymentInput): WatchOrder | null {
  const store = readStore();
  const idx = store.orders.findIndex((order) => order.id === orderId);
  if (idx < 0) return null;

  const prev = normalizeWatchOrder(store.orders[idx]);
  if (prev.isCompleted) {
    throw new Error('已結案訂單不可新增金流');
  }

  const next: WatchOrder = {
    ...prev,
    payments: [...prev.payments, buildPayment(input)],
    updatedAt: new Date().toISOString(),
  };

  store.orders[idx] = next;
  writeStore(store);
  return next;
}

/** 內部／結案流程用 */
export function saveWatchOrder(order: WatchOrder): WatchOrder {
  const store = readStore();
  const idx = store.orders.findIndex((x) => x.id === order.id);
  if (idx < 0) {
    store.orders.push(order);
  } else {
    store.orders[idx] = order;
  }
  writeStore(store);
  return order;
}

/**
 * 嘗試結案：金流齊備時更新訂單；有庫存關聯時一併更新庫存。
 */
export function tryCompleteWatchOrder(orderId: string): ReturnType<typeof completeOrderIfPaid> | ReturnType<typeof completeCustomerOrderIfPaid> | null {
  const order = getWatchOrderById(orderId);
  if (!order) return null;

  if (!order.watchItemId) {
    const result = completeCustomerOrderIfPaid(order);
    if (result.completed) {
      saveWatchOrder(result.order);
    }
    return result;
  }

  const watchItem = getWatchItemById(order.watchItemId);
  if (!watchItem) {
    return {
      completed: false,
      check: {
        canComplete: false,
        paymentsTotalTwd: 0,
        salePriceTwd: order.salePriceTwd,
        remainingTwd: order.salePriceTwd,
        accountsValid: true,
        invalidAccounts: [],
        reason: '找不到對應庫存，請先關聯庫存或改為客戶下單模式',
      },
      order,
      watchItem: null,
    };
  }

  const result = completeOrderIfPaid(order, watchItem);
  if (result.completed && result.watchItem) {
    saveWatchOrder(result.order);
    saveWatchItem(result.watchItem);
  }
  return result;
}

export function removeWatchOrder(id: string): boolean {
  const store = readStore();
  const target = store.orders.find((order) => order.id === id);
  if (!target) return false;
  if (target.isCompleted) {
    throw new Error('已結案訂單不可刪除');
  }
  store.orders = store.orders.filter((order) => order.id !== id);
  writeStore(store);
  return true;
}

export function renameAccountInOrders(oldName: string, newName: string): void {
  const oldN = oldName.trim();
  const newN = newName.trim();
  if (!oldN || !newN || oldN === newN) return;

  const store = readStore();
  let changed = false;
  for (const order of store.orders) {
    for (const payment of order.payments) {
      if (payment.account === oldN) {
        payment.account = newN;
        changed = true;
      }
    }
  }
  if (changed) writeStore(store);
}

export const WATCH_ORDER_STORAGE_KEY = STORAGE_KEY;
