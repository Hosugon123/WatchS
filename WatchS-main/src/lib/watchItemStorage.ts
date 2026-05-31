/**
 * 手錶庫存（本機 localStorage）
 */
import { calcTotalTwdCost } from './watchCost';
import type { NewWatchItemInput, WatchItem, WatchItemStatus, WatchItemUpdate } from '../types/watch';

const STORAGE_KEY = 'shengwatch_items_v1';
export const WATCH_ITEMS_UPDATED_EVENT = 'shengwatchItemsUpdated';

type StoreV1 = {
  version: 1;
  items: WatchItem[];
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
    if (!raw) return { version: 1, items: [] };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) {
      return { version: 1, items: [] };
    }
    return parsed;
  } catch {
    return { version: 1, items: [] };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(WATCH_ITEMS_UPDATED_EVENT));
}

function normalizeStyle(style: NewWatchItemInput['style']): WatchItem['style'] {
  return {
    brand: style.brand.trim(),
    model: style.model.trim(),
    reference: style.reference?.trim() || undefined,
    description: style.description?.trim() || undefined,
  };
}

export function listWatchItems(): WatchItem[] {
  return readStore().items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWatchItemById(id: string): WatchItem | null {
  return readStore().items.find((item) => item.id === id) ?? null;
}

export function listWatchItemsByStatus(status: WatchItemStatus): WatchItem[] {
  return listWatchItems().filter((item) => item.status === status);
}

export function createWatchItem(input: NewWatchItemInput): WatchItem {
  const now = new Date().toISOString();
  const twdShippingFee = input.twdShippingFee ?? 0;
  const totalTwdCost = calcTotalTwdCost(input.rmbCost, input.exchangeRate, twdShippingFee);

  const item: WatchItem = {
    id: newId(),
    style: normalizeStyle(input.style),
    status: input.status ?? 'in_stock',
    rmbCost: input.rmbCost,
    exchangeRate: input.exchangeRate,
    twdShippingFee,
    totalTwdCost,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const store = readStore();
  store.items.push(item);
  writeStore(store);
  return item;
}

export function updateWatchItem(id: string, patch: WatchItemUpdate): WatchItem | null {
  const store = readStore();
  const idx = store.items.findIndex((item) => item.id === id);
  if (idx < 0) return null;

  const prev = store.items[idx];
  const next: WatchItem = {
    ...prev,
    ...patch,
    style: patch.style ? normalizeStyle(patch.style) : prev.style,
    note: patch.note !== undefined ? patch.note.trim() || undefined : prev.note,
    updatedAt: new Date().toISOString(),
  };

  next.totalTwdCost = calcTotalTwdCost(next.rmbCost, next.exchangeRate, next.twdShippingFee);
  store.items[idx] = next;
  writeStore(store);
  return next;
}

/** 內部／結案流程用：直接寫入完整 WatchItem */
export function saveWatchItem(item: WatchItem): WatchItem {
  const store = readStore();
  const idx = store.items.findIndex((x) => x.id === item.id);
  if (idx < 0) {
    store.items.push(item);
  } else {
    store.items[idx] = item;
  }
  writeStore(store);
  return item;
}

export function removeWatchItem(id: string): boolean {
  const store = readStore();
  const before = store.items.length;
  store.items = store.items.filter((item) => item.id !== id);
  if (store.items.length === before) return false;
  writeStore(store);
  return true;
}

export const WATCH_ITEM_STORAGE_KEY = STORAGE_KEY;
