/**
 * 手錶成本計算（純函式，不依賴 React／Storage）。
 */

/** 將金額正規化為非負整數台幣（四捨五入） */
export function roundTwd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * 台幣換匯成本 = RMB 成本 × 換匯匯率（不含運費）。
 * 匯率鎖定「換匯當下」，作為日後利潤分析的護城河數據。
 */
export function calcExchangeTwdCost(rmbCost: number, exchangeRate: number): number {
  const rmb = Math.max(0, Number(rmbCost) || 0);
  const rate = Math.max(0, Number(exchangeRate) || 0);
  return roundTwd(rmb * rate);
}

/** 台幣總成本 = RMB × 匯率 + 台幣運費 */
export function calcTotalTwdCost(
  rmbCost: number,
  exchangeRate: number,
  twdShippingFee = 0,
): number {
  const shipping = roundTwd(Math.max(0, Number(twdShippingFee) || 0));
  return roundTwd(calcExchangeTwdCost(rmbCost, exchangeRate) + shipping);
}

/** 利潤 = 售價 − 總成本 */
export function calcProfitTwd(salePriceTwd: number, totalTwdCost: number): number {
  return roundTwd(salePriceTwd - totalTwdCost);
}

/** 利潤 = 售價 − (RMB × 匯率 + 運費) */
export function calcProfitFromRmb(
  salePriceTwd: number,
  rmbCost: number,
  exchangeRate: number,
  twdShippingFee = 0,
): number {
  return calcProfitTwd(salePriceTwd, calcTotalTwdCost(rmbCost, exchangeRate, twdShippingFee));
}

/** 套用成本欄位並回傳帶 totalTwdCost 的 patch */
export function withComputedTotalTwdCost<T extends { rmbCost: number; exchangeRate: number; twdShippingFee: number }>(
  item: T,
): T & { totalTwdCost: number } {
  return {
    ...item,
    totalTwdCost: calcTotalTwdCost(item.rmbCost, item.exchangeRate, item.twdShippingFee),
  };
}
