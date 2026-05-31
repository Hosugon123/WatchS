/**
 * 收支記帳（本機 localStorage）
 */
import { roundTwd } from './watchCost';

const STORAGE_KEY = 'shengwatch_ledger_entries_v1';
export const LEDGER_ENTRIES_UPDATED_EVENT = 'shengwatchLedgerEntriesUpdated';

export const LEDGER_ENTRY_TYPES = ['income', 'expense'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  income: '收入',
  expense: '支出',
};

export type LedgerEntry = {
  id: string;
  type: LedgerEntryType;
  amountTwd: number;
  dateYmd: string;
  category: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewLedgerEntryInput = {
  type: LedgerEntryType;
  amountTwd: number;
  dateYmd: string;
  category: string;
  note?: string;
};

export type LedgerEntryUpdate = Partial<
  Pick<LedgerEntry, 'type' | 'amountTwd' | 'dateYmd' | 'category' | 'note'>
>;

type StoreV1 = { version: 1; entries: LedgerEntry[] };

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeStore(store: StoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(LEDGER_ENTRIES_UPDATED_EVENT));
}

function coerceEntry(raw: unknown): LedgerEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (type !== 'income' && type !== 'expense') return null;
  const amountTwd = Number(o.amountTwd);
  const dateYmd = typeof o.dateYmd === 'string' ? o.dateYmd : '';
  const category = typeof o.category === 'string' ? o.category.trim() : '';
  const id = typeof o.id === 'string' ? o.id : '';
  if (!id || !dateYmd || !category || !Number.isFinite(amountTwd) || amountTwd <= 0) return null;
  return {
    id,
    type,
    amountTwd: roundTwd(amountTwd),
    dateYmd,
    category,
    note: typeof o.note === 'string' ? o.note : undefined,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
  };
}

export function listLedgerEntries(): LedgerEntry[] {
  const store = readStore();
  const out: LedgerEntry[] = [];
  for (const row of store.entries) {
    const e = coerceEntry(row);
    if (e) out.push(e);
  }
  return out.sort((a, b) => b.dateYmd.localeCompare(a.dateYmd) || b.createdAt.localeCompare(a.createdAt));
}

export function createLedgerEntry(input: NewLedgerEntryInput): LedgerEntry {
  const category = input.category.trim();
  if (!category) throw new Error('請填寫類別。');
  if (!input.dateYmd) throw new Error('請填寫日期。');
  const amountTwd = roundTwd(input.amountTwd);
  if (amountTwd <= 0) throw new Error('金額需大於 0。');

  const t = nowIso();
  const entry: LedgerEntry = {
    id: newId(),
    type: input.type,
    amountTwd,
    dateYmd: input.dateYmd,
    category,
    note: input.note?.trim() || undefined,
    createdAt: t,
    updatedAt: t,
  };
  const store = readStore();
  writeStore({ version: 1, entries: [...store.entries, entry] });
  return entry;
}

export function updateLedgerEntry(id: string, patch: LedgerEntryUpdate): LedgerEntry | null {
  const store = readStore();
  const i = store.entries.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const cur = coerceEntry(store.entries[i]);
  if (!cur) return null;

  if (patch.category !== undefined) {
    const category = patch.category.trim();
    if (!category) throw new Error('請填寫類別。');
    cur.category = category;
  }
  if (patch.dateYmd !== undefined) {
    if (!patch.dateYmd) throw new Error('請填寫日期。');
    cur.dateYmd = patch.dateYmd;
  }
  if (patch.amountTwd !== undefined) {
    const amountTwd = roundTwd(patch.amountTwd);
    if (amountTwd <= 0) throw new Error('金額需大於 0。');
    cur.amountTwd = amountTwd;
  }
  if (patch.type !== undefined) cur.type = patch.type;
  if (patch.note !== undefined) cur.note = patch.note.trim() || undefined;
  cur.updatedAt = nowIso();

  const next = [...store.entries];
  next[i] = cur;
  writeStore({ version: 1, entries: next });
  return cur;
}

export function removeLedgerEntry(id: string): boolean {
  const store = readStore();
  const next = store.entries.filter((e) => e.id !== id);
  if (next.length === store.entries.length) return false;
  writeStore({ version: 1, entries: next });
  return true;
}
