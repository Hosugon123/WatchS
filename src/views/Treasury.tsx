import { ArrowLeftRight, Landmark, List, Pencil, Plus, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AccountField from '@/components/AccountField';
import VendorField from '@/components/VendorField';
import Modal, { FieldLabel, PrimaryButton, SecondaryButton, SelectInput, TextInput } from '@/components/Modal';
import { formatTwd, todayYmd } from '@/lib/format';
import { ACCOUNT_OPENING_BALANCES_UPDATED_EVENT } from '@/lib/accountOpeningBalanceStorage';
import { ACCOUNT_TRANSFERS_UPDATED_EVENT } from '@/lib/accountTransferStorage';
import { WATCH_ORDERS_UPDATED_EVENT } from '@/lib/watchOrderStorage';
import { PAYMENT_ACCOUNTS_UPDATED_EVENT } from '@/lib/paymentAccountStorage';
import { ACCOUNT_PROFILES_UPDATED_EVENT } from '@/lib/accountProfileStorage';
import { VENDOR_PAYABLES_UPDATED_EVENT } from '@/lib/vendorPayableStorage';
import {
  calcTotalTreasuryBalance,
  calcTotalVendorPayableBalance,
  calcTreasuryBalanceByOwnership,
  PAYMENT_ACCOUNT_OWNERSHIP_LABELS,
  TREASURY_MOVEMENT_KIND_LABELS,
  VENDOR_PAYABLE_KIND_LABELS,
  isTreasuryMovementInflow,
  paymentAccountsApi,
  treasury,
  type PaymentAccountOwnershipType,
  type TreasuryAccountBalance,
  type TreasuryMovement,
  type VendorPayableEntry,
  type VendorPayableSummary,
} from '@/services';

export default function TreasuryView() {
  const { can } = useAuth();
  const canEdit = can('edit_treasury');
  const [balances, setBalances] = useState<TreasuryAccountBalance[]>([]);
  const [movements, setMovements] = useState<TreasuryMovement[]>([]);
  const [vendorSummaries, setVendorSummaries] = useState<VendorPayableSummary[]>([]);
  const [vendorEntries, setVendorEntries] = useState<VendorPayableEntry[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [payVendorOpen, setPayVendorOpen] = useState(false);
  const [vendorDetailOpen, setVendorDetailOpen] = useState(false);
  const [vendorDetailName, setVendorDetailName] = useState('');
  const [payVendorLocked, setPayVendorLocked] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [editAccount, setEditAccount] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountOpening, setNewAccountOpening] = useState('');
  const [newAccountOwnership, setNewAccountOwnership] = useState<PaymentAccountOwnershipType>('own');
  const [editForm, setEditForm] = useState({
    accountName: '',
    ownershipType: 'own' as PaymentAccountOwnershipType,
    profileNote: '',
    openingAmount: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const [form, setForm] = useState({
    fromAccount: '國泰CUBE',
    toAccount: '富邦銀行',
    amountTwd: '',
    dateYmd: todayYmd(),
    note: '',
  });

  const [chargeForm, setChargeForm] = useState({
    vendorName: '',
    amountTwd: '',
    dateYmd: todayYmd(),
    note: '',
  });

  const [payVendorForm, setPayVendorForm] = useState({
    vendorName: '',
    amountTwd: '',
    fromAccount: '國泰CUBE',
    dateYmd: todayYmd(),
    note: '',
  });

  const reload = useCallback(async () => {
    const [b, m, vs, ve, a] = await Promise.all([
      treasury.getBalances(),
      treasury.listMovements(),
      treasury.listVendorSummaries(),
      treasury.listVendorEntries(),
      paymentAccountsApi.list(),
    ]);
    setBalances(b);
    setMovements(m);
    setVendorSummaries(vs);
    setVendorEntries(ve);
    setAccounts(a);
  }, []);

  useEffect(() => {
    void reload();
    const h = () => void reload();
    window.addEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
    window.addEventListener(ACCOUNT_TRANSFERS_UPDATED_EVENT, h);
    window.addEventListener(PAYMENT_ACCOUNTS_UPDATED_EVENT, h);
    window.addEventListener(ACCOUNT_OPENING_BALANCES_UPDATED_EVENT, h);
    window.addEventListener(ACCOUNT_PROFILES_UPDATED_EVENT, h);
    window.addEventListener(VENDOR_PAYABLES_UPDATED_EVENT, h);
    return () => {
      window.removeEventListener(WATCH_ORDERS_UPDATED_EVENT, h);
      window.removeEventListener(ACCOUNT_TRANSFERS_UPDATED_EVENT, h);
      window.removeEventListener(PAYMENT_ACCOUNTS_UPDATED_EVENT, h);
      window.removeEventListener(ACCOUNT_OPENING_BALANCES_UPDATED_EVENT, h);
      window.removeEventListener(ACCOUNT_PROFILES_UPDATED_EVENT, h);
      window.removeEventListener(VENDOR_PAYABLES_UPDATED_EVENT, h);
    };
  }, [reload]);

  const totalBalance = useMemo(() => calcTotalTreasuryBalance(balances), [balances]);
  const ownBalance = useMemo(() => calcTreasuryBalanceByOwnership(balances, 'own'), [balances]);
  const proxyBalance = useMemo(() => calcTreasuryBalanceByOwnership(balances, 'proxy'), [balances]);
  const totalVendorPayable = useMemo(() => calcTotalVendorPayableBalance(vendorEntries), [vendorEntries]);

  const vendorNames = useMemo(() => {
    const names = new Set(vendorSummaries.map((v) => v.vendorName));
    return [...names].sort((a, b) => a.localeCompare(b, 'zh-TW'));
  }, [vendorSummaries]);

  const vendorSummaryMap = useMemo(() => {
    const m = new Map<string, VendorPayableSummary>();
    for (const v of vendorSummaries) m.set(v.vendorName, v);
    return m;
  }, [vendorSummaries]);

  const vendorDetailEntries = useMemo(
    () => vendorEntries.filter((e) => e.vendorName === vendorDetailName),
    [vendorEntries, vendorDetailName],
  );

  const payVendorSummary = useMemo(
    () => vendorSummaryMap.get(payVendorForm.vendorName.trim()) ?? null,
    [vendorSummaryMap, payVendorForm.vendorName],
  );

  const balanceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(b.account, b.balanceTwd);
    return m;
  }, [balances]);

  const openEditAccount = (balance: TreasuryAccountBalance) => {
    setEditAccount(balance.account);
    setEditForm({
      accountName: balance.account,
      ownershipType: balance.ownershipType,
      profileNote: balance.profileNote ?? '',
      openingAmount: balance.openingBalanceTwd > 0 ? String(balance.openingBalanceTwd) : '',
    });
    setEditAccountOpen(true);
  };

  const submitEditAccount = async () => {
    const newName = editForm.accountName.trim();
    if (!newName) {
      setMsg('請輸入帳戶名稱');
      setMsgOk(false);
      return;
    }

    const amount = editForm.openingAmount === '' ? 0 : Number(editForm.openingAmount);
    if (editForm.openingAmount !== '' && (!Number.isFinite(amount) || amount < 0)) {
      setMsg('起始資金格式不正確');
      setMsgOk(false);
      return;
    }

    setBusy(true);
    setMsg(null);
    setMsgOk(false);
    try {
      let accountKey = editAccount;
      if (newName !== editAccount) {
        accountKey = await paymentAccountsApi.rename(editAccount, newName);
      }
      await treasury.saveAccountProfile(accountKey, {
        ownershipType: editForm.ownershipType,
        note: editForm.profileNote.trim() || undefined,
      });
      await treasury.setOpeningBalance(accountKey, amount);
      setEditAccountOpen(false);
      setMsg(`已更新「${accountKey}」帳戶設定`);
      setMsgOk(true);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '儲存失敗');
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const submitTransfer = async () => {
    const amountTwd = Number(form.amountTwd);
    if (!amountTwd) {
      setMsg('請填寫轉帳金額');
      setMsgOk(false);
      return;
    }
    const fromBal = balanceMap.get(form.fromAccount) ?? 0;
    if (amountTwd > fromBal) {
      setMsg(`「${form.fromAccount}」餘額不足（目前 ${formatTwd(fromBal)}）`);
      setMsgOk(false);
      return;
    }

    setBusy(true);
    setMsg(null);
    setMsgOk(false);
    try {
      await treasury.transfer({
        fromAccount: form.fromAccount,
        toAccount: form.toAccount,
        amountTwd,
        dateYmd: form.dateYmd,
        note: form.note.trim() || undefined,
      });
      setTransferOpen(false);
      setForm({ fromAccount: '國泰CUBE', toAccount: '富邦銀行', amountTwd: '', dateYmd: todayYmd(), note: '' });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '轉帳失敗');
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const submitAddAccount = async () => {
    const name = newAccountName.trim();
    if (!name) {
      setMsg('請輸入帳戶名稱');
      setMsgOk(false);
      return;
    }
    if (accounts.includes(name)) {
      setMsg('此帳戶已存在');
      setMsgOk(false);
      return;
    }
    const opening = newAccountOpening === '' ? 0 : Number(newAccountOpening);
    if (newAccountOpening !== '' && (!Number.isFinite(opening) || opening < 0)) {
      setMsg('起始資金格式不正確');
      setMsgOk(false);
      return;
    }

    setBusy(true);
    setMsg(null);
    setMsgOk(false);
    try {
      await paymentAccountsApi.add(name);
      await treasury.saveAccountProfile(name, {
        ownershipType: newAccountOwnership,
      });
      if (opening > 0) {
        await treasury.setOpeningBalance(name, opening);
      }
      setAddAccountOpen(false);
      setNewAccountName('');
      setNewAccountOpening('');
      setNewAccountOwnership('own');
      setMsg(opening > 0 ? `已新增帳戶「${name}」，起始資金 ${formatTwd(opening)}` : `已新增帳戶「${name}」`);
      setMsgOk(true);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '新增失敗');
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const openPayVendor = (vendorName = '', lockVendor = false) => {
    setPayVendorLocked(lockVendor || Boolean(vendorName));
    setPayVendorForm({
      vendorName,
      amountTwd: '',
      fromAccount: accounts[0] ?? balances[0]?.account ?? '國泰CUBE',
      dateYmd: todayYmd(),
      note: '',
    });
    setPayVendorOpen(true);
  };

  const openVendorDetail = (vendorName: string) => {
    setVendorDetailName(vendorName);
    setVendorDetailOpen(true);
  };

  const submitVendorCharge = async () => {
    const vendorName = chargeForm.vendorName.trim();
    const amountTwd = Number(chargeForm.amountTwd);
    if (!vendorName) {
      setMsg('請填寫廠商名稱');
      setMsgOk(false);
      return;
    }
    if (!amountTwd || amountTwd <= 0) {
      setMsg('請填寫有效的欠款金額');
      setMsgOk(false);
      return;
    }

    setBusy(true);
    setMsg(null);
    setMsgOk(false);
    try {
      await treasury.recordVendorCharge({
        vendorName,
        amountTwd,
        dateYmd: chargeForm.dateYmd,
        note: chargeForm.note.trim() || undefined,
      });
      setChargeOpen(false);
      setChargeForm({ vendorName: '', amountTwd: '', dateYmd: todayYmd(), note: '' });
      setMsg(`已記錄「${vendorName}」代付欠款 ${formatTwd(amountTwd)}`);
      setMsgOk(true);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '儲存失敗');
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const submitPayVendor = async () => {
    const vendorName = payVendorForm.vendorName.trim();
    const amountTwd = Number(payVendorForm.amountTwd);
    if (!vendorName) {
      setMsg('請填寫廠商名稱');
      setMsgOk(false);
      return;
    }
    if (!amountTwd || amountTwd <= 0) {
      setMsg('請填寫有效的還款金額');
      setMsgOk(false);
      return;
    }
    const fromBal = balanceMap.get(payVendorForm.fromAccount) ?? 0;
    if (amountTwd > fromBal) {
      setMsg(`「${payVendorForm.fromAccount}」餘額不足（目前 ${formatTwd(fromBal)}）`);
      setMsgOk(false);
      return;
    }

    setBusy(true);
    setMsg(null);
    setMsgOk(false);
    try {
      await treasury.payVendor({
        vendorName,
        amountTwd,
        fromAccount: payVendorForm.fromAccount,
        dateYmd: payVendorForm.dateYmd,
        note: payVendorForm.note.trim() || undefined,
      });
      setPayVendorOpen(false);
      setPayVendorForm({
        vendorName: '',
        amountTwd: '',
        fromAccount: accounts[0] ?? '國泰CUBE',
        dateYmd: todayYmd(),
        note: '',
      });
      setMsg(`已還款 ${formatTwd(amountTwd)} 給「${vendorName}」（${payVendorForm.fromAccount}）`);
      setMsgOk(true);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '還款失敗');
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-6 w-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">金流管理</h2>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setAddAccountOpen(true)} className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新增帳戶
            </SecondaryButton>
            <PrimaryButton onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              帳戶轉帳
            </PrimaryButton>
          </div>
        )}
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-3 text-sm ${msgOk ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
          <p className="text-sm text-amber-800">全部帳戶合計</p>
          <p className="text-3xl font-bold tabular-nums text-amber-900">{formatTwd(totalBalance)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">本人戶加總</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{formatTwd(ownBalance)}</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
          <p className="text-sm text-violet-700">代收戶加總</p>
          <p className="text-3xl font-bold tabular-nums text-violet-900">{formatTwd(proxyBalance)}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
          <p className="text-sm text-rose-700">應付廠商合計</p>
          <p className="text-3xl font-bold tabular-nums text-rose-900">{formatTwd(totalVendorPayable)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.map((b) => (
          <AccountBalanceCard key={b.account} balance={b} onEdit={canEdit ? () => openEditAccount(b) : undefined} />
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => setAddAccountOpen(true)}
            className="flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 text-slate-400 transition-colors hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-700"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">新增帳戶</span>
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Truck className="h-4 w-4" />
            廠商代付應付
          </h3>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={() => setChargeOpen(true)} className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                記錄代付欠款
              </SecondaryButton>
              <PrimaryButton onClick={() => openPayVendor()} className="inline-flex items-center gap-2">
                還款給廠商
              </PrimaryButton>
            </div>
          )}
        </div>

        {vendorSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-slate-400">
            尚無廠商代付紀錄
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vendorSummaries.map((v) => (
              <VendorPayableCard
                key={v.vendorName}
                summary={v}
                onDetail={() => openVendorDetail(v.vendorName)}
                onPay={() => openPayVendor(v.vendorName, true)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ArrowLeftRight className="h-4 w-4" />
            資金異動紀錄
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-semibold text-red-600">轉出</th>
                <th className="px-4 py-3 font-medium">轉入</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
                <th className="px-4 py-3 font-medium">備註</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    尚無資金異動紀錄
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{m.dateYmd}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.kind === 'opening'
                            ? 'bg-sky-100 text-sky-700'
                            : m.kind === 'payment'
                              ? 'bg-emerald-100 text-emerald-700'
                              : m.kind === 'vendor_pay'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {TREASURY_MOVEMENT_KIND_LABELS[m.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-red-600">{m.fromAccount}</td>
                    <td className="px-4 py-3">{m.toAccount}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        isTreasuryMovementInflow(m) ? 'text-slate-900' : 'text-red-600'
                      }`}
                    >
                      {formatTwd(m.amountTwd)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={editAccountOpen} title={`編輯帳戶 · ${editAccount}`} onClose={() => setEditAccountOpen(false)}>
        <div className="space-y-4">
          <div>
            <FieldLabel required>帳戶名稱</FieldLabel>
            <TextInput
              value={editForm.accountName}
              onChange={(e) => setEditForm({ ...editForm, accountName: e.target.value })}
              placeholder="例如：中信銀行、Line Pay"
            />
          </div>
          <div>
            <FieldLabel required>帳戶屬性</FieldLabel>
            <SelectInput
              value={editForm.ownershipType}
              onChange={(e) =>
                setEditForm({ ...editForm, ownershipType: e.target.value as PaymentAccountOwnershipType })
              }
            >
              {Object.entries(PAYMENT_ACCOUNT_OWNERSHIP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectInput>
          </div>
          {editForm.ownershipType === 'proxy' && (
            <div>
              <FieldLabel>代收說明</FieldLabel>
              <TextInput
                value={editForm.profileNote}
                onChange={(e) => setEditForm({ ...editForm, profileNote: e.target.value })}
                placeholder="例如：客戶王先生、合作方代收"
              />
            </div>
          )}
          <div>
            <FieldLabel>起始資金（台幣）</FieldLabel>
            <TextInput
              type="number"
              value={editForm.openingAmount}
              onChange={(e) => setEditForm({ ...editForm, openingAmount: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setEditAccountOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitEditAccount()} disabled={busy}>
            儲存
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={transferOpen} title="帳戶轉帳" onClose={() => setTransferOpen(false)}>
        <div className="space-y-4">
          <div>
            <FieldLabel required>轉出帳戶</FieldLabel>
            <SelectInput value={form.fromAccount} onChange={(e) => setForm({ ...form, fromAccount: e.target.value })}>
              {(accounts.length > 0 ? accounts : balances.map((b) => b.account)).map((a) => (
                <option key={a} value={a}>
                  {a}（餘額 {formatTwd(balanceMap.get(a) ?? 0)}）
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <FieldLabel required>轉入帳戶</FieldLabel>
            <AccountField value={form.toAccount} onChange={(toAccount) => setForm({ ...form, toAccount })} />
          </div>
          <div>
            <FieldLabel required>轉帳金額（台幣）</FieldLabel>
            <TextInput type="number" value={form.amountTwd} onChange={(e) => setForm({ ...form, amountTwd: e.target.value })} />
          </div>
          <div>
            <FieldLabel required>日期</FieldLabel>
            <TextInput type="date" value={form.dateYmd} onChange={(e) => setForm({ ...form, dateYmd: e.target.value })} />
          </div>
          <div>
            <FieldLabel>備註</FieldLabel>
            <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="選填" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setTransferOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitTransfer()} disabled={busy}>
            確認轉帳
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={addAccountOpen} title="新增帳戶" onClose={() => setAddAccountOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">新增的帳戶會出現在金流管理、收款記入的下拉選單中。</p>
          <div>
            <FieldLabel required>帳戶名稱</FieldLabel>
            <TextInput
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="例如：中信銀行、Line Pay"
            />
          </div>
          <div>
            <FieldLabel required>帳戶屬性</FieldLabel>
            <SelectInput
              value={newAccountOwnership}
              onChange={(e) => setNewAccountOwnership(e.target.value as PaymentAccountOwnershipType)}
            >
              {Object.entries(PAYMENT_ACCOUNT_OWNERSHIP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <FieldLabel>起始資金（台幣）</FieldLabel>
            <TextInput
              type="number"
              value={newAccountOpening}
              onChange={(e) => setNewAccountOpening(e.target.value)}
              placeholder="選填，已營運中可填入目前餘額"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setAddAccountOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitAddAccount()} disabled={busy}>
            新增
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={chargeOpen} title="記錄代付欠款" onClose={() => setChargeOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">廠商代付您的貨款（成本）時，在此記錄您欠該廠商多少錢。</p>
          <div>
            <FieldLabel required>廠商名稱</FieldLabel>
            <VendorField
              value={chargeForm.vendorName}
              onChange={(vendorName) => setChargeForm({ ...chargeForm, vendorName })}
              suggestions={vendorNames}
              placeholder="例如：深圳錶行、王老板"
            />
          </div>
          <div>
            <FieldLabel required>欠款金額（台幣）</FieldLabel>
            <TextInput
              type="number"
              value={chargeForm.amountTwd}
              onChange={(e) => setChargeForm({ ...chargeForm, amountTwd: e.target.value })}
              placeholder="代付的貨款成本"
            />
          </div>
          <div>
            <FieldLabel required>日期</FieldLabel>
            <TextInput
              type="date"
              value={chargeForm.dateYmd}
              onChange={(e) => setChargeForm({ ...chargeForm, dateYmd: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>備註</FieldLabel>
            <TextInput
              value={chargeForm.note}
              onChange={(e) => setChargeForm({ ...chargeForm, note: e.target.value })}
              placeholder="例如：Rolex 126610 進貨成本"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setChargeOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitVendorCharge()} disabled={busy}>
            儲存
          </PrimaryButton>
        </div>
      </Modal>

      <Modal open={payVendorOpen} title="還款給廠商" onClose={() => setPayVendorOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            還款為累計結清，可一次償還任意金額（不必對應單筆訂單）。
          </p>
          <div>
            <FieldLabel required>廠商名稱</FieldLabel>
            {payVendorLocked ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {payVendorForm.vendorName}
              </p>
            ) : (
              <VendorField
                value={payVendorForm.vendorName}
                onChange={(vendorName) => setPayVendorForm({ ...payVendorForm, vendorName })}
                suggestions={vendorNames}
                placeholder="還款對象"
              />
            )}
          </div>
          {payVendorSummary && (
            <div className="rounded-lg border border-rose-100 bg-rose-50/50 px-4 py-3 text-sm">
              <p className="text-rose-700">
                目前尚欠 <span className="font-bold tabular-nums">{formatTwd(payVendorSummary.balanceTwd)}</span>
                <span className="text-rose-600/80">
                  {' '}
                  （代付累計 {formatTwd(payVendorSummary.chargeTotalTwd)} · 已還{' '}
                  {formatTwd(payVendorSummary.paymentTotalTwd)}）
                </span>
              </p>
            </div>
          )}
          <div>
            <FieldLabel required>本次還款金額（台幣）</FieldLabel>
            <TextInput
              type="number"
              value={payVendorForm.amountTwd}
              onChange={(e) => setPayVendorForm({ ...payVendorForm, amountTwd: e.target.value })}
              placeholder="輸入本次還款金額"
            />
          </div>
          <div>
            <FieldLabel required>付款帳戶</FieldLabel>
            <SelectInput
              value={payVendorForm.fromAccount}
              onChange={(e) => setPayVendorForm({ ...payVendorForm, fromAccount: e.target.value })}
            >
              {(accounts.length > 0 ? accounts : balances.map((b) => b.account)).map((a) => (
                <option key={a} value={a}>
                  {a}（餘額 {formatTwd(balanceMap.get(a) ?? 0)}）
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <FieldLabel required>日期</FieldLabel>
            <TextInput
              type="date"
              value={payVendorForm.dateYmd}
              onChange={(e) => setPayVendorForm({ ...payVendorForm, dateYmd: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>備註</FieldLabel>
            <TextInput
              value={payVendorForm.note}
              onChange={(e) => setPayVendorForm({ ...payVendorForm, note: e.target.value })}
              placeholder="選填"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setPayVendorOpen(false)}>取消</SecondaryButton>
          <PrimaryButton onClick={() => void submitPayVendor()} disabled={busy}>
            確認還款
          </PrimaryButton>
        </div>
      </Modal>

      <Modal
        open={vendorDetailOpen}
        title={`${vendorDetailName} · 流水明細`}
        onClose={() => setVendorDetailOpen(false)}
        wide
      >
        {vendorSummaryMap.get(vendorDetailName) && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">代付累計</p>
              <p className="text-lg font-bold tabular-nums text-slate-800">
                {formatTwd(vendorSummaryMap.get(vendorDetailName)!.chargeTotalTwd)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">已還</p>
              <p className="text-lg font-bold tabular-nums text-slate-600">
                {formatTwd(vendorSummaryMap.get(vendorDetailName)!.paymentTotalTwd)}
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs text-rose-600">尚欠</p>
              <p className="text-lg font-bold tabular-nums text-rose-700">
                {formatTwd(vendorSummaryMap.get(vendorDetailName)!.balanceTwd)}
              </p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
                <th className="px-4 py-3 font-medium">付款帳戶</th>
                <th className="px-4 py-3 font-medium">備註</th>
              </tr>
            </thead>
            <tbody>
              {vendorDetailEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    尚無流水紀錄
                  </td>
                </tr>
              ) : (
                vendorDetailEntries.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{e.dateYmd}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.kind === 'charge' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {VENDOR_PAYABLE_KIND_LABELS[e.kind]}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        e.kind === 'charge' ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {formatTwd(e.amountTwd)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.fromAccount ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{e.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {vendorSummaryMap.get(vendorDetailName)?.balanceTwd ? (
            <PrimaryButton
              onClick={() => {
                setVendorDetailOpen(false);
                openPayVendor(vendorDetailName, true);
              }}
            >
              還款給此廠商
            </PrimaryButton>
          ) : null}
          <SecondaryButton onClick={() => setVendorDetailOpen(false)}>關閉</SecondaryButton>
        </div>
      </Modal>
    </div>
  );
}

function VendorPayableCard({
  summary,
  onDetail,
  onPay,
}: {
  summary: VendorPayableSummary;
  onDetail: () => void;
  onPay: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50/40 to-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="truncate text-sm font-semibold text-slate-800">{summary.vendorName}</span>
        <button
          type="button"
          onClick={onDetail}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <List className="h-3.5 w-3.5" />
          明細
        </button>
      </div>
      <p className="text-2xl font-bold tabular-nums text-rose-700">{formatTwd(summary.balanceTwd)}</p>
      <p className="mt-1 text-xs text-slate-500">
        代付 {formatTwd(summary.chargeTotalTwd)} · 已還 {formatTwd(summary.paymentTotalTwd)}
      </p>
      <div className="mt-3 flex gap-2">
        {summary.balanceTwd > 0 ? (
          <button
            type="button"
            onClick={onPay}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            還款
          </button>
        ) : (
          <span className="text-xs text-slate-400">已結清</span>
        )}
      </div>
    </div>
  );
}

function AccountBalanceCard({
  balance,
  onEdit,
}: {
  balance: TreasuryAccountBalance;
  onEdit?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-700">{balance.account}</span>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              balance.ownershipType === 'proxy'
                ? 'bg-violet-100 text-violet-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {PAYMENT_ACCOUNT_OWNERSHIP_LABELS[balance.ownershipType]}
          </span>
          {balance.profileNote && (
            <p className="mt-1 truncate text-xs text-slate-400">{balance.profileNote}</p>
          )}
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
            title="編輯帳戶"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums text-slate-900">{formatTwd(balance.balanceTwd)}</p>
    </div>
  );
}
