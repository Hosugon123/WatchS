import type { PaymentAccount } from './accounts';

/** 庫存狀態 */
export const WATCH_ITEM_STATUSES = ['in_stock', 'reserved', 'sold', 'archived'] as const;
export type WatchItemStatus = (typeof WATCH_ITEM_STATUSES)[number];

export const WATCH_ITEM_STATUS_LABELS: Record<WatchItemStatus, string> = {
  in_stock: '在庫',
  reserved: '已預留',
  sold: '已售出',
  archived: '已封存',
};

/** 手錶款式（品牌／型號／補充描述） */
export type WatchStyle = {
  brand: string;
  model: string;
  /** 官方型號或自訂編號 */
  reference?: string;
  /** 材質、錶徑、年份等補充說明 */
  description?: string;
};

/**
 * 庫存單品。
 * totalTwdCost 由 {@link calcTotalTwdCost} 在寫入時自動計算並持久化。
 */
export type WatchItem = {
  id: string;
  style: WatchStyle;
  status: WatchItemStatus;
  /** RMB 成本（人民幣） */
  rmbCost: number;
  /** 換匯當下匯率（1 RMB = ? TWD） */
  exchangeRate: number;
  /** 台幣運費 */
  twdShippingFee: number;
  /** 台幣總成本 = rmbCost × exchangeRate + twdShippingFee */
  totalTwdCost: number;
  /** 售出後寫入：售價 − totalTwdCost */
  profitTwd?: number;
  /** 關聯訂單（售出後回填） */
  soldOrderId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

/** 金流類型（可分期／全額／退款） */
export const PAYMENT_TYPES = ['deposit', 'balance', 'full', 'refund'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: '訂金',
  balance: '尾款',
  full: '全額',
  refund: '退款',
};

/** 訂單分期金流明細 */
export type WatchOrderPayment = {
  id: string;
  paymentType: PaymentType;
  /** 台幣金額（退款為負向時請填正數並以 paymentType=refund 標記） */
  amountTwd: number;
  /** 流入帳戶（常用或自訂） */
  account: PaymentAccount;
  /** 收款日 YYYY-MM-DD */
  dateYmd: string;
  note?: string;
  createdAt: string;
};

export const WATCH_ORDER_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
export type WatchOrderStatus = (typeof WATCH_ORDER_STATUSES)[number];

export const WATCH_ORDER_SOURCES = ['inventory', 'customer'] as const;
export type WatchOrderSource = (typeof WATCH_ORDER_SOURCES)[number];

export const WATCH_ORDER_SOURCE_LABELS: Record<WatchOrderSource, string> = {
  inventory: '庫存售出',
  customer: '客戶下單',
};

/**
 * 銷售訂單。
 * isCompleted 僅在 {@link checkOrderPaymentStatus} 通過後可設為 true。
 * - 庫存售出：watchItemId 必填，結案時更新庫存為 sold
 * - 客戶下單：無庫存關聯，orderStyle 描述需求款式
 */
export type WatchOrder = {
  id: string;
  /** 訂單來源 */
  source: WatchOrderSource;
  /** 關聯庫存（客戶下單時可省略） */
  watchItemId?: string;
  /** 客戶下單時的款式描述（無庫存關聯時使用） */
  orderStyle?: WatchStyle;
  /** 客戶下單／預估進貨成本（人民幣） */
  rmbCost?: number;
  /** 換匯當下匯率（1 RMB = ? TWD） */
  exchangeRate?: number;
  /** 台幣運費 */
  twdShippingFee?: number;
  /** 台幣總成本 = rmbCost × exchangeRate + twdShippingFee */
  totalTwdCost?: number;
  /** 訂單售價（台幣） */
  salePriceTwd: number;
  payments: WatchOrderPayment[];
  status: WatchOrderStatus;
  /** 金流齊備且已結案 */
  isCompleted: boolean;
  /** 結案後寫入：salePriceTwd − totalTwdCost（庫存或客戶下單成本） */
  profitTwd?: number;
  customerName?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  /** 結案時間 ISO */
  completedAt?: string;
};

/** 建立庫存時的輸入（totalTwdCost 由 storage 層計算） */
export type NewWatchItemInput = {
  style: WatchStyle;
  status?: WatchItemStatus;
  rmbCost: number;
  exchangeRate: number;
  twdShippingFee?: number;
  note?: string;
};

export type WatchItemUpdate = Partial<
  Pick<WatchItem, 'style' | 'status' | 'rmbCost' | 'exchangeRate' | 'twdShippingFee' | 'note'>
>;

export type NewWatchOrderPaymentInput = {
  paymentType: PaymentType;
  amountTwd: number;
  account: PaymentAccount;
  dateYmd: string;
  note?: string;
};

export type NewWatchOrderInput = {
  /** 庫存售出時必填 */
  watchItemId?: string;
  /** 客戶下單時必填（品牌＋型號） */
  orderStyle?: WatchStyle;
  salePriceTwd: number;
  /** 客戶下單時可填進貨成本 */
  rmbCost?: number;
  exchangeRate?: number;
  twdShippingFee?: number;
  customerName?: string;
  note?: string;
  /** 可選：建單時一併登記首筆金流 */
  initialPayment?: NewWatchOrderPaymentInput;
  /** 可選：代付廠商名稱；有成本時自動記入廠商欠款（台幣） */
  vendorPayableVendor?: string;
};

export type WatchOrderUpdate = Partial<
  Pick<
    WatchOrder,
    'salePriceTwd' | 'customerName' | 'note' | 'status' | 'orderStyle' | 'rmbCost' | 'exchangeRate' | 'twdShippingFee'
  >
>;
