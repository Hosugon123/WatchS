import { NotebookPen, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PrimaryButton } from '@/components/Modal';
import { formatTwd, todayYmd } from '@/lib/format';
import { LEDGER_ENTRIES_UPDATED_EVENT, type LedgerEntry } from '@/lib/ledgerStorage';
import { isYmdInPeriod } from '@/lib/salesPeriod';
import { sumLedgerByPeriod } from '@/lib/ledgerAnalytics';
import { SALES_PERIOD_LABELS, type SalesPeriodId } from '@/lib/salesAnalytics';
import { ledger } from '@/services';
import { cn } from '@/lib/utils';

const PERIODS: SalesPeriodId[] = ['week', 'month', 'year'];

const INCOME_CATEGORIES = ['其他收入', '利息收入', '服務收入', '雜項收入'];
const EXPENSE_CATEGORIES = ['租金', '薪資', '運費', '維修保養', '行銷廣告', '雜項支出'];
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

type RowForm = {
  dateYmd: string;
  category: string;
  income: string;
  expense: string;
  note: string;
};

function entryToRowForm(e: LedgerEntry): RowForm {
  return {
    dateYmd: e.dateYmd,
    category: e.category,
    income: e.type === 'income' ? String(e.amountTwd) : '',
    expense: e.type === 'expense' ? String(e.amountTwd) : '',
    note: e.note ?? '',
  };
}

function emptyRowForm(): RowForm {
  return {
    dateYmd: todayYmd(),
    category: '',
    income: '',
    expense: '',
    note: '',
  };
}

function parseRowForm(row: RowForm): {
  type: 'income' | 'expense';
  amountTwd: number;
  dateYmd: string;
  category: string;
  note?: string;
} {
  const income = Number(row.income);
  const expense = Number(row.expense);
  const hasIncome = Number.isFinite(income) && income > 0;
  const hasExpense = Number.isFinite(expense) && expense > 0;
  if (hasIncome && hasExpense) {
    throw new Error('同一列請只填寫收入或支出其中一欄。');
  }
  if (!hasIncome && !hasExpense) {
    throw new Error('請填寫收入或支出金額。');
  }
  if (!row.dateYmd) throw new Error('請填寫日期。');
  if (!row.category.trim()) throw new Error('請填寫類別。');
  return {
    type: hasIncome ? 'income' : 'expense',
    amountTwd: hasIncome ? Math.round(income) : Math.round(expense),
    dateYmd: row.dateYmd,
    category: row.category.trim(),
    note: row.note.trim() || undefined,
  };
}

const cellInput =
  'w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100';

function LedgerGridRow({
  row,
  onChange,
  onSave,
  onDelete,
  canEdit,
  saving,
  isDraft,
}: {
  row: RowForm;
  onChange: (next: RowForm) => void;
  onSave: () => void;
  onDelete?: () => void;
  canEdit: boolean;
  saving?: boolean;
  isDraft?: boolean;
}) {
  if (!canEdit) {
    const income = row.income ? Number(row.income) : 0;
    const expense = row.expense ? Number(row.expense) : 0;
    return (
      <tr className="border-t border-slate-100">
        <td className="px-2 py-2 tabular-nums text-slate-600">{row.dateYmd}</td>
        <td className="px-2 py-2 font-medium text-slate-800">{row.category || '—'}</td>
        <td className="px-2 py-2 text-right tabular-nums text-emerald-600">
          {income > 0 ? formatTwd(income) : '—'}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-rose-600">
          {expense > 0 ? formatTwd(expense) : '—'}
        </td>
        <td className="max-w-[10rem] truncate px-2 py-2 text-slate-500">{row.note || '—'}</td>
        <td className="px-2 py-2" />
      </tr>
    );
  }

  return (
    <tr
      className={cn(
        'border-t border-slate-100',
        saving && 'bg-amber-50/40',
        isDraft && 'border-t-2 border-amber-200 bg-amber-50/30',
      )}
    >
      <td className="px-2 py-1.5">
        <input
          type="date"
          className={cellInput}
          value={row.dateYmd}
          onChange={(e) => onChange({ ...row, dateYmd: e.target.value })}
          onBlur={onSave}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          list="ledger-categories"
          placeholder="類別"
          className={cellInput}
          value={row.category}
          onChange={(e) => onChange({ ...row, category: e.target.value })}
          onBlur={onSave}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min={0}
          placeholder="0"
          className={cn(cellInput, 'text-right tabular-nums text-emerald-700')}
          value={row.income}
          onChange={(e) =>
            onChange({
              ...row,
              income: e.target.value,
              ...(e.target.value.trim() ? { expense: '' } : {}),
            })
          }
          onBlur={onSave}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min={0}
          placeholder="0"
          className={cn(cellInput, 'text-right tabular-nums text-rose-700')}
          value={row.expense}
          onChange={(e) =>
            onChange({
              ...row,
              expense: e.target.value,
              ...(e.target.value.trim() ? { income: '' } : {}),
            })
          }
          onBlur={onSave}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          placeholder="備註"
          className={cellInput}
          value={row.note}
          onChange={(e) => onChange({ ...row, note: e.target.value })}
          onBlur={onSave}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        {onDelete && (
          <button
            type="button"
            title="刪除"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

export default function LedgerView() {
  const { can } = useAuth();
  const canEdit = can('edit_ledger');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [period, setPeriod] = useState<SalesPeriodId>('month');
  const [rowForms, setRowForms] = useState<Record<string, RowForm>>({});
  const [draftRow, setDraftRow] = useState<RowForm>(emptyRowForm);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const reload = useCallback(async () => {
    const list = await ledger.list();
    setEntries(list);
    const forms: Record<string, RowForm> = {};
    for (const e of list) {
      forms[e.id] = entryToRowForm(e);
    }
    setRowForms(forms);
  }, []);

  useEffect(() => {
    void reload();
    const h = () => void reload();
    window.addEventListener(LEDGER_ENTRIES_UPDATED_EVENT, h);
    return () => window.removeEventListener(LEDGER_ENTRIES_UPDATED_EVENT, h);
  }, [reload]);

  const totalsByPeriod = useMemo(() => sumLedgerByPeriod(entries), [entries]);
  const totals = totalsByPeriod[period];

  const periodEntries = useMemo(
    () => entries.filter((e) => isYmdInPeriod(e.dateYmd, period)),
    [entries, period],
  );

  const showMsg = (text: string, ok: boolean) => {
    setMsg(text);
    setMsgOk(ok);
  };

  const updateRowForm = (id: string, next: RowForm) => {
    setRowForms((prev) => ({ ...prev, [id]: next }));
  };

  const saveExisting = async (id: string) => {
    const row = rowForms[id];
    if (!row) return;
    const original = entries.find((e) => e.id === id);
    if (!original) return;
    const origForm = entryToRowForm(original);
    if (JSON.stringify(row) === JSON.stringify(origForm)) return;

    setSavingId(id);
    setBusy(true);
    try {
      const payload = parseRowForm(row);
      await ledger.update(id, payload);
      showMsg('已儲存', true);
      await reload();
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '儲存失敗', false);
      updateRowForm(id, origForm);
    } finally {
      setSavingId(null);
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    const hasAmount =
      (Number(draftRow.income) > 0 && Number.isFinite(Number(draftRow.income))) ||
      (Number(draftRow.expense) > 0 && Number.isFinite(Number(draftRow.expense)));
    if (!hasAmount) return;
    if (!draftRow.category.trim()) {
      showMsg('請填寫類別', false);
      return;
    }

    setBusy(true);
    try {
      const payload = parseRowForm(draftRow);
      await ledger.create(payload);
      setDraftRow(emptyRowForm());
      showMsg('已新增一列', true);
      await reload();
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '新增失敗', false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: LedgerEntry) => {
    if (!window.confirm(`確定刪除此筆記帳？`)) return;
    setBusy(true);
    try {
      await ledger.remove(e.id);
      showMsg('已刪除', true);
      await reload();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : '刪除失敗', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <datalist id="ledger-categories">
        {ALL_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-6 w-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">收支記帳</h2>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {PERIODS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                period === id ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {SALES_PERIOD_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <p
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            msgOk ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700',
          )}
        >
          {msg}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <p className="text-sm text-emerald-800">{SALES_PERIOD_LABELS[period]}收入</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-900">{formatTwd(totals.incomeTwd)}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
          <p className="text-sm text-rose-700">{SALES_PERIOD_LABELS[period]}支出</p>
          <p className="text-2xl font-bold tabular-nums text-rose-900">{formatTwd(totals.expenseTwd)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">{SALES_PERIOD_LABELS[period]}收支結餘</p>
          <p
            className={cn(
              'text-2xl font-bold tabular-nums',
              totals.incomeTwd - totals.expenseTwd >= 0 ? 'text-slate-900' : 'text-red-600',
            )}
          >
            {formatTwd(totals.incomeTwd - totals.expenseTwd)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-600">
                <th className="w-[8.5rem] px-2 py-2.5 text-left font-semibold">日期</th>
                <th className="min-w-[8rem] px-2 py-2.5 text-left font-semibold">類別</th>
                <th className="w-[7.5rem] px-2 py-2.5 text-right font-semibold text-emerald-800">收入</th>
                <th className="w-[7.5rem] px-2 py-2.5 text-right font-semibold text-rose-800">支出</th>
                <th className="min-w-[6rem] px-2 py-2.5 text-left font-semibold">備註</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {periodEntries.length === 0 && !canEdit && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {SALES_PERIOD_LABELS[period]}尚無記帳紀錄
                  </td>
                </tr>
              )}
              {periodEntries.map((e) => {
                const form = rowForms[e.id] ?? entryToRowForm(e);
                return (
                  <LedgerGridRow
                    key={e.id}
                    row={form}
                    canEdit={canEdit}
                    saving={savingId === e.id}
                    onChange={(next) => updateRowForm(e.id, next)}
                    onSave={() => void saveExisting(e.id)}
                    onDelete={canEdit ? () => void remove(e) : undefined}
                  />
                );
              })}
              {canEdit && (
                <LedgerGridRow
                  row={draftRow}
                  canEdit
                  isDraft
                  onChange={setDraftRow}
                  onSave={() => void saveDraft()}
                />
              )}
            </tbody>
            {(periodEntries.length > 0 || canEdit) && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-2 py-2.5 text-slate-600" colSpan={2}>
                    本期合計
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">
                    {formatTwd(totals.incomeTwd)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-rose-700">
                    {formatTwd(totals.expenseTwd)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-800" colSpan={2}>
                    結餘 {formatTwd(totals.incomeTwd - totals.expenseTwd)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-amber-50/40 px-3 py-2.5">
            <PrimaryButton
              type="button"
              className="inline-flex items-center gap-1.5 py-1.5 text-xs"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              <Plus className="h-3.5 w-3.5" />
              記帳
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
