/**
 * 重新命名帳戶，同步更新所有關聯資料。
 */
import { assertPaymentAccount, normalizePaymentAccount } from '../types/accounts';
import { renameOpeningBalanceAccount } from './accountOpeningBalanceStorage';
import { renameAccountProfile } from './accountProfileStorage';
import { renameAccountInTransfers } from './accountTransferStorage';
import { renameCommonPaymentAccount, loadCommonPaymentAccounts } from './paymentAccountStorage';
import { renameAccountInOrders } from './watchOrderStorage';

export function renamePaymentAccount(oldName: string, newName: string): string {
  const oldN = normalizePaymentAccount(oldName);
  const newN = assertPaymentAccount(newName);
  if (oldN === newN) return newN;

  const accounts = loadCommonPaymentAccounts();
  if (accounts.includes(newN)) {
    throw new Error('此帳戶名稱已存在');
  }

  renameCommonPaymentAccount(oldN, newN);
  renameOpeningBalanceAccount(oldN, newN);
  renameAccountProfile(oldN, newN);
  renameAccountInTransfers(oldN, newN);
  renameAccountInOrders(oldN, newN);

  return newN;
}
