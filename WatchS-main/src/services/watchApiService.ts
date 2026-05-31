/**
 * 中古手錶進銷存 — 資料存取抽象層
 *
 * 規範：
 * - UI 層應優先呼叫本檔公開之 async 方法，不直接 localStorage.setItem。
 * - remote：啟動時由 {@link initRemoteSyncOnAppLoad} 先 GET 覆蓋本地；每次寫入後自動推送整包。
 */
import * as watchItems from '../lib/watchItemStorage';
import * as watchOrders from '../lib/watchOrderStorage';
import type {
  NewWatchItemInput,
  NewWatchOrderInput,
  NewWatchOrderPaymentInput,
  WatchItem,
  WatchItemStatus,
  WatchItemUpdate,
  WatchOrder,
  WatchOrderUpdate,
} from '../types/watch';
import {
  buildShengwatchDataBundle,
  importShengwatchDataBundle,
  serializeShengwatchDataBundle,
  type ImportBundleResult,
  type ShengwatchDataBundleV1,
} from '../lib/appDataBundle';
import {
  checkOrderPaymentStatus,
  completeOrderIfPaid,
  completeCustomerOrderIfPaid,
  groupPaymentsByAccount,
  inferPaymentType,
  sumPaymentsTwd,
  type CompleteOrderResult,
  type PaymentCheckResult,
} from '../lib/watchPayment';
import { calcProfitTwd, calcTotalTwdCost, roundTwd } from '../lib/watchCost';
import { orderDisplayLabel, todayYmd } from '../lib/format';
import * as paymentAccounts from '../lib/paymentAccountStorage';
import * as accountTransfers from '../lib/accountTransferStorage';
import * as accountOpeningBalances from '../lib/accountOpeningBalanceStorage';
import * as accountProfiles from '../lib/accountProfileStorage';
import * as vendorPayables from '../lib/vendorPayableStorage';
import { renamePaymentAccount } from '../lib/paymentAccountRename';
import {
  buildTreasuryMovements,
  calcTotalTreasuryBalance,
  calcTreasuryBalances,
  type AccountTransfer,
  type NewAccountTransferInput,
  type TreasuryAccountBalance,
  type TreasuryMovement,
} from '../lib/accountTreasury';
import * as systemUsers from '../lib/systemUsersStorage';
import * as credentialStorage from '../lib/credentialStorage';
import * as ledgerStorage from '../lib/ledgerStorage';
import {
  initRemoteSyncOnAppLoad,
  withRemoteStorageRead,
  withRemoteStorageWrite,
} from './remoteSyncHub';

export {
  initRemoteSyncOnAppLoad,
  withRemoteStorageRead,
  withRemoteStorageWrite,
  getRemoteSyncStatus,
  isRemoteSyncLocked,
  REMOTE_SYNC_STATUS_EVENT,
  REMOTE_SYNC_VERSION_CONFLICT_EVENT,
} from './remoteSyncHub';
export type { RemoteSyncStatus } from './remoteSyncHub';

export {
  DEFAULT_PAYMENT_ACCOUNTS,
  PAYMENT_ACCOUNT_WHITELIST,
  isPaymentAccount,
  assertPaymentAccount,
  normalizePaymentAccount,
} from '../types/accounts';
export type { PaymentAccount } from '../types/accounts';

export type { PaymentAccountProfile, PaymentAccountOwnershipType } from '../lib/accountProfileStorage';
export {
  PAYMENT_ACCOUNT_OWNERSHIP_TYPES,
  PAYMENT_ACCOUNT_OWNERSHIP_LABELS,
} from '../lib/accountProfileStorage';

export {
  loadCommonPaymentAccounts,
  saveCommonPaymentAccounts,
  addCommonPaymentAccount,
  resetCommonPaymentAccounts,
} from '../lib/paymentAccountStorage';

export type {
  WatchItem,
  WatchItemStatus,
  WatchStyle,
  WatchOrder,
  WatchOrderPayment,
  WatchOrderStatus,
  WatchOrderSource,
  PaymentType,
  NewWatchItemInput,
  WatchItemUpdate,
  NewWatchOrderInput,
  NewWatchOrderPaymentInput,
  WatchOrderUpdate,
} from '../types/watch';

export type { AccountTransfer, NewAccountTransferInput, TreasuryAccountBalance } from '../lib/accountTreasury';
export type { TreasuryMovement, TreasuryMovementKind } from '../lib/accountTreasury';
export { TREASURY_MOVEMENT_KIND_LABELS, isTreasuryMovementInflow } from '../lib/accountTreasury';
export type { VendorPayableEntry, VendorPayableSummary, VendorPayableEntryKind } from '../lib/vendorPayableStorage';
export {
  VENDOR_PAYABLE_KIND_LABELS,
  calcTotalVendorPayableBalance,
  calcVendorPayableSummaries,
} from '../lib/vendorPayableStorage';

export {
  calcExchangeTwdCost,
  calcTotalTwdCost,
  calcProfitTwd,
  calcProfitFromRmb,
} from '../lib/watchCost';

export {
  calcTotalTreasuryBalance,
  calcTreasuryBalanceByOwnership,
  calcTreasuryBalances,
  buildTreasuryMovements,
} from '../lib/accountTreasury';

export {
  checkOrderPaymentStatus,
  completeOrderIfPaid,
  completeCustomerOrderIfPaid,
  inferPaymentType,
  sumPaymentsTwd,
  groupPaymentsByAccount,
};
export type { PaymentCheckResult, CompleteOrderResult };

// ——— 庫存 ———

export const inventory = {
  async list(): Promise<WatchItem[]> {
    return withRemoteStorageRead(() => watchItems.listWatchItems());
  },

  async getById(id: string): Promise<WatchItem | null> {
    return withRemoteStorageRead(() => watchItems.getWatchItemById(id));
  },

  async listByStatus(status: WatchItemStatus): Promise<WatchItem[]> {
    return withRemoteStorageRead(() => watchItems.listWatchItemsByStatus(status));
  },

  async create(input: NewWatchItemInput): Promise<WatchItem> {
    return withRemoteStorageWrite(() => watchItems.createWatchItem(input));
  },

  async update(id: string, patch: WatchItemUpdate): Promise<WatchItem | null> {
    return withRemoteStorageWrite(() => watchItems.updateWatchItem(id, patch));
  },

  async remove(id: string): Promise<boolean> {
    return withRemoteStorageWrite(() => watchItems.removeWatchItem(id));
  },
};

// ——— 訂單 ———

export const orders = {
  async list(): Promise<WatchOrder[]> {
    return withRemoteStorageRead(() => watchOrders.listWatchOrders());
  },

  async getById(id: string): Promise<WatchOrder | null> {
    return withRemoteStorageRead(() => watchOrders.getWatchOrderById(id));
  },

  async listByItemId(watchItemId: string): Promise<WatchOrder[]> {
    return withRemoteStorageRead(() => watchOrders.listWatchOrdersByItemId(watchItemId));
  },

  async create(input: NewWatchOrderInput): Promise<WatchOrder> {
    return withRemoteStorageWrite(() => {
      const order = watchOrders.createWatchOrder(input);
      if (input.initialPayment?.account) {
        paymentAccounts.addCommonPaymentAccount(input.initialPayment.account);
      }

      const vendor = input.vendorPayableVendor?.trim();
      if (vendor) {
        let amountTwd = 0;
        if (order.watchItemId) {
          const item = watchItems.getWatchItemById(order.watchItemId);
          amountTwd = item?.totalTwdCost ?? 0;
        } else {
          amountTwd = order.totalTwdCost ?? 0;
        }
        if (amountTwd <= 0) {
          throw new Error('無法換算台幣成本，無法記入廠商欠款');
        }
        vendorPayables.createVendorCharge({
          vendorName: vendor,
          amountTwd,
          dateYmd: todayYmd(),
          note: `${orderDisplayLabel(order)} · 建單代付`,
          orderId: order.id,
        });
      }

      return order;
    });
  },

  async update(id: string, patch: WatchOrderUpdate): Promise<WatchOrder | null> {
    return withRemoteStorageWrite(() => watchOrders.updateWatchOrder(id, patch));
  },

  async appendPayment(
    orderId: string,
    input: NewWatchOrderPaymentInput,
  ): Promise<WatchOrder | null> {
    return withRemoteStorageWrite(() => {
      const order = watchOrders.appendWatchOrderPayment(orderId, input);
      if (order && input.account) {
        paymentAccounts.addCommonPaymentAccount(input.account);
      }
      return order;
    });
  },

  /** 檢算金流（不寫入） */
  async checkPaymentStatus(orderId: string): Promise<PaymentCheckResult | null> {
    return withRemoteStorageRead(() => {
      const order = watchOrders.getWatchOrderById(orderId);
      if (!order) return null;
      return checkOrderPaymentStatus(order);
    });
  },

  /** 金流齊備時結案：更新 isCompleted、庫存 sold、profitTwd */
  async tryComplete(orderId: string): Promise<CompleteOrderResult | null> {
    return withRemoteStorageWrite(() => watchOrders.tryCompleteWatchOrder(orderId));
  },

  async remove(id: string): Promise<boolean> {
    return withRemoteStorageWrite(() => watchOrders.removeWatchOrder(id));
  },
};

// ——— 常用帳戶 ———

export const paymentAccountsApi = {
  async list(): Promise<string[]> {
    return withRemoteStorageRead(() => paymentAccounts.loadCommonPaymentAccounts());
  },

  async save(accounts: readonly string[]): Promise<string[]> {
    return withRemoteStorageWrite(() => paymentAccounts.saveCommonPaymentAccounts(accounts));
  },

  async add(name: string): Promise<string[]> {
    return withRemoteStorageWrite(() => paymentAccounts.addCommonPaymentAccount(name));
  },

  async rename(oldName: string, newName: string): Promise<string> {
    return withRemoteStorageWrite(() => renamePaymentAccount(oldName, newName));
  },

  async reset(): Promise<string[]> {
    return withRemoteStorageWrite(() => paymentAccounts.resetCommonPaymentAccounts());
  },
};

// ——— 金流管理 ———

export const treasury = {
  async getBalances(): Promise<TreasuryAccountBalance[]> {
    return withRemoteStorageRead(() => {
      const orders = watchOrders.listWatchOrders();
      const transfers = accountTransfers.listAccountTransfers();
      const accounts = paymentAccounts.loadCommonPaymentAccounts();
      const opening = accountOpeningBalances.loadOpeningBalances();
      const profiles = accountProfiles.loadAccountProfiles();
      return calcTreasuryBalances(orders, transfers, accounts, opening, profiles);
    });
  },

  async listTransfers(): Promise<AccountTransfer[]> {
    return withRemoteStorageRead(() => accountTransfers.listAccountTransfers());
  },

  async listMovements(): Promise<TreasuryMovement[]> {
    return withRemoteStorageRead(() => {
      const transfers = accountTransfers.listAccountTransfers();
      const orders = watchOrders.listWatchOrders();
      return buildTreasuryMovements(transfers, orders, (order) => orderDisplayLabel(order));
    });
  },

  async transfer(input: NewAccountTransferInput): Promise<AccountTransfer> {
    return withRemoteStorageWrite(() => accountTransfers.createAccountTransfer(input));
  },

  async setOpeningBalance(account: string, amountTwd: number): Promise<number> {
    return withRemoteStorageWrite(() => {
      const old = accountOpeningBalances.getOpeningBalance(account);
      const amount = accountOpeningBalances.setOpeningBalance(account, amountTwd);
      const delta = roundTwd(amount - old);
      if (delta !== 0) {
        accountTransfers.createOpeningBalanceMovement(account, delta);
      }
      return amount;
    });
  },

  async getOpeningBalances(): Promise<Record<string, number>> {
    return withRemoteStorageRead(() => accountOpeningBalances.loadOpeningBalances());
  },

  async saveAccountProfile(
    account: string,
    profile: accountProfiles.PaymentAccountProfile,
  ): Promise<accountProfiles.PaymentAccountProfile> {
    return withRemoteStorageWrite(() => accountProfiles.saveAccountProfile(account, profile));
  },

  async getAccountProfile(account: string): Promise<accountProfiles.PaymentAccountProfile> {
    return withRemoteStorageRead(() => accountProfiles.getAccountProfile(account));
  },

  async listVendorSummaries(): Promise<vendorPayables.VendorPayableSummary[]> {
    return withRemoteStorageRead(() => vendorPayables.calcVendorPayableSummaries(vendorPayables.listVendorPayableEntries()));
  },

  async listVendorEntries(): Promise<vendorPayables.VendorPayableEntry[]> {
    return withRemoteStorageRead(() => vendorPayables.listVendorPayableEntries());
  },

  async recordVendorCharge(input: vendorPayables.NewVendorChargeInput): Promise<vendorPayables.VendorPayableEntry> {
    return withRemoteStorageWrite(() => vendorPayables.createVendorCharge(input));
  },

  async payVendor(input: vendorPayables.NewVendorPaymentInput): Promise<vendorPayables.VendorPayableEntry> {
    return withRemoteStorageWrite(() => {
      const entry = vendorPayables.createVendorPayment(input);
      accountTransfers.createVendorPaymentTransfer(
        input.fromAccount,
        input.amountTwd,
        input.dateYmd,
        input.note ? `還款 · ${input.vendorName} · ${input.note}` : `還款 · ${input.vendorName}`,
      );
      paymentAccounts.addCommonPaymentAccount(input.fromAccount);
      return entry;
    });
  },
};

// ——— 收支記帳 ———

export type {
  LedgerEntry,
  LedgerEntryType,
  NewLedgerEntryInput,
  LedgerEntryUpdate,
} from '../lib/ledgerStorage';
export { LEDGER_ENTRY_TYPE_LABELS, LEDGER_ENTRIES_UPDATED_EVENT } from '../lib/ledgerStorage';

export const ledger = {
  async list(): Promise<ledgerStorage.LedgerEntry[]> {
    return withRemoteStorageRead(() => ledgerStorage.listLedgerEntries());
  },
  async create(input: ledgerStorage.NewLedgerEntryInput): Promise<ledgerStorage.LedgerEntry> {
    return withRemoteStorageWrite(() => ledgerStorage.createLedgerEntry(input));
  },
  async update(
    id: string,
    patch: ledgerStorage.LedgerEntryUpdate,
  ): Promise<ledgerStorage.LedgerEntry | null> {
    return withRemoteStorageWrite(() => ledgerStorage.updateLedgerEntry(id, patch));
  },
  async remove(id: string): Promise<boolean> {
    return withRemoteStorageWrite(() => ledgerStorage.removeLedgerEntry(id));
  },
};

// ——— 帳號與權限 ———

export type CreateUserPayload = systemUsers.NewSystemUserInput & { initialPassword?: string };
export type UpdateAccountPayload = systemUsers.SystemUserUpdate & { newPassword?: string };

function normalizeLoginId(s: string): string {
  return s.trim().toLowerCase();
}

export const accounts = {
  async listUsers(): Promise<systemUsers.SystemUser[]> {
    return withRemoteStorageRead(() => systemUsers.listSystemUsers());
  },
  async createUser(input: CreateUserPayload): Promise<systemUsers.SystemUser> {
    return withRemoteStorageWrite(() => {
      const { initialPassword, ...rest } = input;
      if (rest.loginId?.trim() && !initialPassword?.trim()) {
        throw new Error('已填寫登入帳號時，請一併設定初始密碼。');
      }
      if (initialPassword?.trim() && !rest.loginId?.trim()) {
        throw new Error('設定初始密碼前請先填寫登入帳號。');
      }
      const u = systemUsers.createSystemUser(rest);
      try {
        if (rest.loginId?.trim() && initialPassword) {
          credentialStorage.registerCredential(rest.loginId, initialPassword);
        }
      } catch (e) {
        systemUsers.removeSystemUser(u.id);
        throw e;
      }
      return u;
    });
  },
  async updateUser(id: string, patch: UpdateAccountPayload): Promise<boolean> {
    return withRemoteStorageWrite(() => {
      const { newPassword, ...userPatch } = patch;
      const cur = systemUsers.listSystemUsers().find((u) => u.id === id);
      const oldLogin = cur?.loginId;
      const ok = systemUsers.updateSystemUser(id, userPatch);
      if (!ok) return false;
      const refreshed = systemUsers.listSystemUsers().find((u) => u.id === id);
      const newLogin = refreshed?.loginId;
      if (oldLogin && newLogin && normalizeLoginId(oldLogin) !== normalizeLoginId(newLogin)) {
        credentialStorage.migrateCredential(oldLogin, newLogin);
      }
      if (newPassword?.trim()) {
        const lid = refreshed?.loginId;
        if (!lid) throw new Error('此帳號尚未設定登入帳號，請先補上登入帳號再重設密碼。');
        credentialStorage.setCredential(lid, newPassword);
      }
      return true;
    });
  },
  async removeUser(id: string): Promise<boolean> {
    return withRemoteStorageWrite(() => {
      const cur = systemUsers.listSystemUsers().find((u) => u.id === id);
      const ok = systemUsers.removeSystemUser(id);
      if (ok && cur?.loginId) credentialStorage.removeCredential(cur.loginId);
      return ok;
    });
  },
  async setUserPassword(loginId: string, newPassword: string): Promise<void> {
    return withRemoteStorageWrite(() => {
      credentialStorage.setCredential(loginId, newPassword);
    });
  },
  async changeOwnPassword(loginId: string, currentPassword: string, newPassword: string): Promise<void> {
    return withRemoteStorageWrite(() => {
      credentialStorage.changeCredential(loginId, currentPassword, newPassword);
    });
  },
};

export type {
  SystemUser,
  SystemUserRole,
  SystemUserStatus,
  NewSystemUserInput,
  SystemUserUpdate,
} from '../lib/systemUsersStorage';

// ——— 備份／bundle ———

export const dataBundle = {
  build(): ShengwatchDataBundleV1 {
    return buildShengwatchDataBundle();
  },

  serialize(bundle?: ShengwatchDataBundleV1): string {
    return serializeShengwatchDataBundle(bundle ?? buildShengwatchDataBundle());
  },

  async import(bundle: ShengwatchDataBundleV1): Promise<ImportBundleResult> {
    return withRemoteStorageWrite(() => importShengwatchDataBundle(bundle));
  },
};
