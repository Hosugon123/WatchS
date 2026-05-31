/**
 * 帳戶金流彙總（純函式）
 */
import type { WatchOrder } from '../types/watch';
import { roundTwd } from './watchCost';
import { groupPaymentsByAccount } from './watchPayment';

export const TREASURY_EXTERNAL_ACCOUNT = '—';
export const TREASURY_VENDOR_ACCOUNT = '廠商代付';

export type TreasuryMovementKind = 'transfer' | 'opening' | 'payment' | 'vendor_pay';

export type AccountTransfer = {
  id: string;
  /** 未標記時視為帳戶轉帳 */
  kind?: 'transfer' | 'opening' | 'vendor_payment';
  fromAccount: string;
  toAccount: string;
  amountTwd: number;
  dateYmd: string;
  note?: string;
  createdAt: string;
};

export type TreasuryMovement = {
  id: string;
  kind: TreasuryMovementKind;
  dateYmd: string;
  fromAccount: string;
  toAccount: string;
  amountTwd: number;
  note?: string;
  createdAt: string;
  orderId?: string;
};

export const TREASURY_MOVEMENT_KIND_LABELS: Record<TreasuryMovementKind, string> = {
  transfer: '帳戶轉帳',
  opening: '起始資金',
  payment: '訂單收款',
  vendor_pay: '廠商還款',
};

/** 外部來源（入帳） */
export function isTreasuryMovementInflow(movement: Pick<TreasuryMovement, 'fromAccount' | 'toAccount'>): boolean {
  return movement.fromAccount === TREASURY_EXTERNAL_ACCOUNT || movement.fromAccount === '訂單收款';
}

import type { PaymentAccountOwnershipType } from './accountProfileStorage';

export type TreasuryAccountBalance = {
  account: string;
  ownershipType: PaymentAccountOwnershipType;
  profileNote?: string;
  /** 導入系統前的起始資金 */
  openingBalanceTwd: number;
  /** 訂單收款流入（含進行中訂金） */
  orderInflowTwd: number;
  /** 帳戶間轉帳淨額（轉入 − 轉出） */
  transferNetTwd: number;
  /** 目前實際餘額 */
  balanceTwd: number;
};

export type NewAccountTransferInput = {
  fromAccount: string;
  toAccount: string;
  amountTwd: number;
  dateYmd: string;
  note?: string;
};

/** 是否納入金流管理（已取消訂單除外） */
export function isTreasuryOrderEligible(order: Pick<WatchOrder, 'status'>): boolean {
  return order.status !== 'cancelled';
}

/** 彙總訂單收款（含進行中訂金／尾款），依帳戶加總 */
export function calcOrderInflowsByAccount(orders: readonly WatchOrder[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const order of orders) {
    if (!isTreasuryOrderEligible(order)) continue;
    const byAccount = groupPaymentsByAccount(order.payments);
    for (const [account, amt] of Object.entries(byAccount)) {
      map[account] = roundTwd((map[account] ?? 0) + amt);
    }
  }
  return map;
}

/** @deprecated 改用 {@link calcOrderInflowsByAccount} */
export function calcCompletedOrderInflowsByAccount(orders: readonly WatchOrder[]): Record<string, number> {
  return calcOrderInflowsByAccount(orders.filter((o) => o.isCompleted));
}

export function calcTransferNetForAccount(
  account: string,
  transfers: readonly AccountTransfer[],
): number {
  let net = 0;
  for (const t of transfers) {
    if (t.kind === 'opening') continue;
    if (t.fromAccount === account) net -= roundTwd(t.amountTwd);
    if (t.toAccount === account) net += roundTwd(t.amountTwd);
  }
  return roundTwd(net);
}

function isTreasuryAccountName(name: string): boolean {
  return name !== TREASURY_EXTERNAL_ACCOUNT && name !== '訂單收款' && name !== TREASURY_VENDOR_ACCOUNT;
}

/** 合併轉帳／起始資金紀錄與訂單收款，供資金異動列表顯示 */
export function buildTreasuryMovements(
  transfers: readonly AccountTransfer[],
  orders: readonly WatchOrder[],
  orderLabel: (order: WatchOrder) => string = () => '訂單收款',
): TreasuryMovement[] {
  const rows: TreasuryMovement[] = transfers.map((t) => ({
    id: t.id,
    kind: t.kind === 'opening' ? 'opening' : t.kind === 'vendor_payment' ? 'vendor_pay' : 'transfer',
    dateYmd: t.dateYmd,
    fromAccount: t.fromAccount,
    toAccount: t.toAccount,
    amountTwd: t.amountTwd,
    note: t.note,
    createdAt: t.createdAt,
  }));

  for (const order of orders) {
    if (!isTreasuryOrderEligible(order)) continue;
    const label = orderLabel(order);
    const statusNote = order.isCompleted ? label : `${label}（進行中）`;
    for (const payment of order.payments) {
      rows.push({
        id: `payment_${payment.id}`,
        kind: 'payment',
        dateYmd: payment.dateYmd,
        fromAccount: '訂單收款',
        toAccount: payment.account,
        amountTwd: payment.amountTwd,
        note: payment.note ?? statusNote,
        createdAt: payment.createdAt,
        orderId: order.id,
      });
    }
  }

  return rows.sort(
    (a, b) => b.dateYmd.localeCompare(a.dateYmd) || b.createdAt.localeCompare(a.createdAt),
  );
}

/** 計算各帳戶實際餘額 = 起始資金 + 訂單流入 + 轉帳淨額 */
export function calcTreasuryBalances(
  orders: readonly WatchOrder[],
  transfers: readonly AccountTransfer[],
  knownAccounts: readonly string[],
  openingBalances: Readonly<Record<string, number>> = {},
  profiles: Readonly<Record<string, { ownershipType: PaymentAccountOwnershipType; note?: string }>> = {},
): TreasuryAccountBalance[] {
  const inflows = calcOrderInflowsByAccount(orders);
  const accountSet = new Set<string>(knownAccounts);
  for (const name of Object.keys(inflows)) accountSet.add(name);
  for (const name of Object.keys(openingBalances)) accountSet.add(name);
  for (const t of transfers) {
    if (isTreasuryAccountName(t.fromAccount)) accountSet.add(t.fromAccount);
    if (isTreasuryAccountName(t.toAccount)) accountSet.add(t.toAccount);
  }

  const rows: TreasuryAccountBalance[] = [...accountSet].map((account) => {
    const openingBalanceTwd = roundTwd(openingBalances[account] ?? 0);
    const orderInflowTwd = inflows[account] ?? 0;
    const transferNetTwd = calcTransferNetForAccount(account, transfers);
    const profile = profiles[account];
    return {
      account,
      ownershipType: profile?.ownershipType === 'proxy' ? 'proxy' : 'own',
      profileNote: profile?.note,
      openingBalanceTwd,
      orderInflowTwd,
      transferNetTwd,
      balanceTwd: roundTwd(openingBalanceTwd + orderInflowTwd + transferNetTwd),
    };
  });

  return rows.sort((a, b) => b.balanceTwd - a.balanceTwd || a.account.localeCompare(b.account, 'zh-TW'));
}

export function calcTotalTreasuryBalance(balances: readonly TreasuryAccountBalance[]): number {
  return roundTwd(balances.reduce((s, b) => s + b.balanceTwd, 0));
}

export function calcTreasuryBalanceByOwnership(
  balances: readonly TreasuryAccountBalance[],
  ownershipType: PaymentAccountOwnershipType,
): number {
  return roundTwd(
    balances.filter((b) => b.ownershipType === ownershipType).reduce((s, b) => s + b.balanceTwd, 0),
  );
}
