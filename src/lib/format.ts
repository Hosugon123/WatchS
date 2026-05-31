export function formatTwd(n: number): string {
  return `$ ${Math.round(n).toLocaleString('zh-TW')}`;
}

export function formatRmb(n: number): string {
  return `¥ ${Math.round(n).toLocaleString('zh-TW')}`;
}

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function watchStyleLabel(style: { brand: string; model: string; reference?: string }): string {
  const ref = style.reference ? ` (${style.reference})` : '';
  return `${style.brand} ${style.model}${ref}`;
}

export function orderDisplayLabel(
  order: { watchItemId?: string; orderStyle?: { brand: string; model: string; reference?: string } },
  item?: { style: { brand: string; model: string; reference?: string } } | null,
): string {
  if (item) return watchStyleLabel(item.style);
  if (order.orderStyle?.brand) return watchStyleLabel(order.orderStyle);
  return '客戶訂單';
}
