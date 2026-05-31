import { Plus, Pencil, Trash2, Watch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Modal, { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '@/components/Modal';
import { calcTotalTwdCost } from '@/services';
import { formatRmb, formatTwd, watchStyleLabel } from '@/lib/format';
import { inventory } from '@/services';
import type { WatchItem, WatchItemStatus } from '@/types/watch';
import { WATCH_ITEM_STATUS_LABELS } from '@/types/watch';
import { WATCH_ITEMS_UPDATED_EVENT } from '@/lib/watchItemStorage';

const EMPTY_FORM = {
  brand: '',
  model: '',
  reference: '',
  description: '',
  rmbCost: '',
  exchangeRate: '',
  twdShippingFee: '0',
  note: '',
  status: 'in_stock' as WatchItemStatus,
};

export default function Inventory() {
  const { can } = useAuth();
  const canEdit = can('edit_inventory');
  const [items, setItems] = useState<WatchItem[]>([]);
  const [filter, setFilter] = useState<WatchItemStatus | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WatchItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems(await inventory.list());
  }, []);

  useEffect(() => {
    void reload();
    const h = () => void reload();
    window.addEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
    return () => window.removeEventListener(WATCH_ITEMS_UPDATED_EVENT, h);
  }, [reload]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((x) => x.status === filter);
  }, [items, filter]);

  const previewCost = useMemo(() => {
    const rmb = Number(form.rmbCost) || 0;
    const rate = Number(form.exchangeRate) || 0;
    const ship = Number(form.twdShippingFee) || 0;
    return calcTotalTwdCost(rmb, rate, ship);
  }, [form.rmbCost, form.exchangeRate, form.twdShippingFee]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (item: WatchItem) => {
    setEditing(item);
    setForm({
      brand: item.style.brand,
      model: item.style.model,
      reference: item.style.reference ?? '',
      description: item.style.description ?? '',
      rmbCost: String(item.rmbCost),
      exchangeRate: String(item.exchangeRate),
      twdShippingFee: String(item.twdShippingFee),
      note: item.note ?? '',
      status: item.status,
    });
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.brand.trim() || !form.model.trim()) {
      setError('品牌與型號為必填');
      return;
    }
    const rmbCost = Number(form.rmbCost);
    const exchangeRate = Number(form.exchangeRate);
    if (!rmbCost || !exchangeRate) {
      setError('請填寫 RMB 成本與匯率');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        style: {
          brand: form.brand.trim(),
          model: form.model.trim(),
          reference: form.reference.trim() || undefined,
          description: form.description.trim() || undefined,
        },
        rmbCost,
        exchangeRate,
        twdShippingFee: Number(form.twdShippingFee) || 0,
        note: form.note.trim() || undefined,
        status: form.status,
      };

      if (editing) {
        await inventory.update(editing.id, payload);
      } else {
        await inventory.create(payload);
      }
      setModalOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: WatchItem) => {
    if (item.status === 'sold') {
      alert('已售出項目不可刪除');
      return;
    }
    if (!window.confirm(`確定刪除「${watchStyleLabel(item.style)}」？`)) return;
    await inventory.remove(item.id);
    await reload();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Watch className="h-6 w-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">庫存管理</h2>
        </div>
        {canEdit && (
          <PrimaryButton onClick={openCreate} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            新增庫存
          </PrimaryButton>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', ...Object.keys(WATCH_ITEM_STATUS_LABELS)] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key as WatchItemStatus | 'all')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === key ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {key === 'all' ? '全部' : WATCH_ITEM_STATUS_LABELS[key as WatchItemStatus]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">款式</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium text-right">RMB 成本</th>
                <th className="px-4 py-3 font-medium text-right">匯率</th>
                <th className="px-4 py-3 font-medium text-right">台幣成本</th>
                <th className="px-4 py-3 font-medium text-right">利潤</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    尚無庫存資料
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{watchStyleLabel(item.style)}</p>
                      {item.style.description && (
                        <p className="text-xs text-slate-400">{item.style.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {WATCH_ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRmb(item.rmbCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.exchangeRate}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-700">
                      {formatTwd(item.totalTwdCost)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                      {item.profitTwd != null ? formatTwd(item.profitTwd) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            title="編輯"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(item)}
                            disabled={item.status === 'sold'}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                            title="刪除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-slate-400">僅檢視</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} title={editing ? '編輯庫存' : '新增庫存'} onClose={() => setModalOpen(false)} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel required>品牌</FieldLabel>
            <TextInput value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Rolex" />
          </div>
          <div>
            <FieldLabel required>型號</FieldLabel>
            <TextInput value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Submariner" />
          </div>
          <div>
            <FieldLabel>官方編號</FieldLabel>
            <TextInput value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div>
            <FieldLabel>狀態</FieldLabel>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as WatchItemStatus })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              disabled={editing?.status === 'sold'}
            >
              {Object.entries(WATCH_ITEM_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>描述</FieldLabel>
            <TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="材質、錶徑、年份…" />
          </div>
          <div>
            <FieldLabel required>RMB 成本</FieldLabel>
            <TextInput type="number" value={form.rmbCost} onChange={(e) => setForm({ ...form, rmbCost: e.target.value })} />
          </div>
          <div>
            <FieldLabel required>換匯匯率</FieldLabel>
            <TextInput type="number" step="0.01" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} />
          </div>
          <div>
            <FieldLabel>台幣運費</FieldLabel>
            <TextInput type="number" value={form.twdShippingFee} onChange={(e) => setForm({ ...form, twdShippingFee: e.target.value })} />
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-lg bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-700">台幣成本（RMB × 匯率 + 運費）</p>
              <p className="text-lg font-bold text-amber-800 tabular-nums">{formatTwd(previewCost)}</p>
            </div>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>備註</FieldLabel>
            <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setModalOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submit()} disabled={busy}>
            {busy ? '儲存中…' : '儲存'}
          </PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}
