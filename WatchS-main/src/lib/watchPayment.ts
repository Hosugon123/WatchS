/**
 * 訂單金流檢算與結案邏輯（純函式）。
 */
import { assertPaymentAccount } from '../types/accounts';
import type { PaymentType, WatchItem, WatchOrder, WatchOrderPayment } from '../types/watch';
import { calcProfitTwd, roundTwd } from './watchCost';

export type PaymentCheckResult = {
  /** 金流加總是否等於售價（允許結案） */
  canComplete: boolean;
  paymentsTotalTwd: number;
  salePriceTwd: number;
  /** 售價 − 已收金流（正數 = 尚欠，0 = 齊備，負數 = 超收） */
  remainingTwd: number;
  /** 所有 payment.account 是否皆已填寫且合法 */
  accountsValid: boolean;
  invalidAccounts: string[];
  reason?: string;
};

/** 收款記入時依金額與既有金流自動判斷類型 */
export function inferPaymentType(
  order: Pick<WatchOrder, 'salePriceTwd' | 'payments'>,
  amountTwd: number,
): PaymentType {
  const paid = sumPaymentsTwd(order.payments);
  const remaining = roundTwd(order.salePriceTwd - paid);
  const amt = roundTwd(amountTwd);

  if (order.payments.length === 0) {
    return amt >= order.salePriceTwd ? 'full' : 'deposit';
  }
  return 'balance';
}

/** 加總金流台幣；退款以 paymentType=refund 從總額扣除 */
export function sumPaymentsTwd(payments: readonly WatchOrderPayment[]): number {
  let total = 0;
  for (const p of payments) {
    const amt = roundTwd(Math.abs(p.amountTwd));
    if (p.paymentType === 'refund') {
      total -= amt;
    } else {
      total += amt;
    }
  }
  return roundTwd(total);
}

function validatePaymentAccounts(payments: readonly WatchOrderPayment[]): {
  accountsValid: boolean;
  invalidAccounts: string[];
} {
  const invalidAccounts: string[] = [];
  for (const p of payments) {
    try {
      assertPaymentAccount(p.account);
    } catch {
      invalidAccounts.push(p.account);
    }
  }
  return {
    accountsValid: invalidAccounts.length === 0,
    invalidAccounts,
  };
}

/**
 * 檢算訂單金流狀態。
 * 僅當 payments 加總 **等於** 訂單售價且帳戶皆合法時，canComplete 為 true。
 */
export function checkOrderPaymentStatus(
  order: Pick<WatchOrder, 'salePriceTwd' | 'payments' | 'isCompleted'>,
): PaymentCheckResult {
  const salePriceTwd = roundTwd(order.salePriceTwd);
  const paymentsTotalTwd = sumPaymentsTwd(order.payments);
  const remainingTwd = roundTwd(salePriceTwd - paymentsTotalTwd);
  const { accountsValid, invalidAccounts } = validatePaymentAccounts(order.payments);

  if (order.isCompleted) {
    return {
      canComplete: true,
      paymentsTotalTwd,
      salePriceTwd,
      remainingTwd,
      accountsValid,
      invalidAccounts,
      reason: '訂單已結案',
    };
  }

  if (!accountsValid) {
    return {
      canComplete: false,
      paymentsTotalTwd,
      salePriceTwd,
      remainingTwd,
      accountsValid,
      invalidAccounts,
      reason: `帳戶未填寫或格式不正確：${invalidAccounts.join('、')}`,
    };
  }

  if (salePriceTwd <= 0) {
    return {
      canComplete: false,
      paymentsTotalTwd,
      salePriceTwd,
      remainingTwd,
      accountsValid,
      invalidAccounts,
      reason: '售價必須大於 0',
    };
  }

  if (paymentsTotalTwd !== salePriceTwd) {
    return {
      canComplete: false,
      paymentsTotalTwd,
      salePriceTwd,
      remainingTwd,
      accountsValid,
      invalidAccounts,
      reason:
        remainingTwd > 0
          ? `尚欠 ${remainingTwd.toLocaleString('zh-TW')} 元`
          : `超收 ${Math.abs(remainingTwd).toLocaleString('zh-TW')} 元`,
    };
  }

  return {
    canComplete: true,
    paymentsTotalTwd,
    salePriceTwd,
    remainingTwd: 0,
    accountsValid,
    invalidAccounts,
  };
}

export type CompleteOrderResult = {
  completed: boolean;
  check: PaymentCheckResult;
  order: WatchOrder;
  /** 庫存售出結案時更新；客戶下單為 null */
  watchItem: WatchItem | null;
};

/**
 * 金流齊備時結案：isCompleted=true、WatchItem→sold、寫入 profitTwd。
 * 若檢算未通過，回傳原資料且不變更。
 */
export function completeOrderIfPaid(order: WatchOrder, watchItem: WatchItem): CompleteOrderResult {
  const check = checkOrderPaymentStatus(order);

  if (!check.canComplete || order.isCompleted) {
    return { completed: false, check, order, watchItem };
  }

  if (!order.watchItemId || watchItem.id !== order.watchItemId) {
    return {
      completed: false,
      check: { ...check, canComplete: false, reason: '訂單與庫存 ID 不匹配' },
      order,
      watchItem,
    };
  }

  const now = new Date().toISOString();
  const profitTwd = calcProfitTwd(order.salePriceTwd, watchItem.totalTwdCost);

  const completedOrder: WatchOrder = {
    ...order,
    isCompleted: true,
    status: 'completed',
    profitTwd,
    updatedAt: now,
    completedAt: now,
  };

  const soldItem: WatchItem = {
    ...watchItem,
    status: 'sold',
    profitTwd,
    soldOrderId: order.id,
    updatedAt: now,
  };

  return {
    completed: true,
    check,
    order: completedOrder,
    watchItem: soldItem,
  };
}

/**
 * 客戶下單（無庫存關聯）金流齊備時結案；若已填成本則計算 profitTwd。
 */
export function completeCustomerOrderIfPaid(order: WatchOrder): Omit<CompleteOrderResult, 'watchItem'> & { watchItem: null } {
  const check = checkOrderPaymentStatus(order);

  if (!check.canComplete || order.isCompleted) {
    return { completed: false, check, order, watchItem: null };
  }

  if (order.watchItemId) {
    return {
      completed: false,
      check: { ...check, canComplete: false, reason: '此訂單應走庫存結案流程' },
      order,
      watchItem: null,
    };
  }

  const now = new Date().toISOString();
  const profitTwd =
    order.totalTwdCost != null && order.totalTwdCost > 0
      ? calcProfitTwd(order.salePriceTwd, order.totalTwdCost)
      : undefined;

  const completedOrder: WatchOrder = {
    ...order,
    source: order.source ?? 'customer',
    isCompleted: true,
    status: 'completed',
    profitTwd,
    updatedAt: now,
    completedAt: now,
  };

  return {
    completed: true,
    check,
    order: completedOrder,
    watchItem: null,
  };
}

/** 依帳戶彙總金流（結案後對帳用） */
export function groupPaymentsByAccount(
  payments: readonly WatchOrderPayment[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of payments) {
    const amt =
      p.paymentType === 'refund' ? -roundTwd(Math.abs(p.amountTwd)) : roundTwd(Math.abs(p.amountTwd));
    map[p.account] = roundTwd((map[p.account] ?? 0) + amt);
  }
  return map;
}
