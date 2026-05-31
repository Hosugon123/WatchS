/**
 * 側邊欄主選單順序（本機 localStorage）。
 */
export const MAIN_NAV_IDS = ['dashboard', 'inventory', 'orders', 'treasury', 'ledger'] as const;
export type MainNavId = (typeof MAIN_NAV_IDS)[number];

const STORAGE_KEY = 'shengwatch_main_nav_order_v1';

export const MAIN_NAV_DEFAULT_ORDER: MainNavId[] = [...MAIN_NAV_IDS];

const VALID_IDS = new Set<string>(MAIN_NAV_IDS);

function isMainNavId(id: string): id is MainNavId {
  return VALID_IDS.has(id);
}

function coerceOrder(raw: unknown): MainNavId[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MainNavId[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && isMainNavId(x) && !out.includes(x)) {
      out.push(x);
    }
  }
  return out.length > 0 ? out : null;
}

export function loadMainNavOrder(): MainNavId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...MAIN_NAV_DEFAULT_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    return coerceOrder(parsed) ?? [...MAIN_NAV_DEFAULT_ORDER];
  } catch {
    return [...MAIN_NAV_DEFAULT_ORDER];
  }
}

export function saveMainNavOrder(order: readonly MainNavId[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...order]));
}

export function resetMainNavOrder(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** 依自訂順序排列；缺少的項目接在後方（預設相對順序） */
export function sortMainNavIds<T extends { id: MainNavId }>(
  items: readonly T[],
  order: readonly MainNavId[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sorted: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      sorted.push(item);
      byId.delete(id);
    }
  }
  for (const id of MAIN_NAV_DEFAULT_ORDER) {
    const item = byId.get(id);
    if (item) sorted.push(item);
  }
  return sorted;
}

export function moveNavId(order: readonly MainNavId[], fromId: MainNavId, toId: MainNavId): MainNavId[] {
  const list = order.filter((id) => isMainNavId(id));
  const from = list.indexOf(fromId);
  const to = list.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...list];
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed!);
  for (const id of MAIN_NAV_DEFAULT_ORDER) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}
