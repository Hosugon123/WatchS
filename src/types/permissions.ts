/** 可勾選下放的功能權限（管理員預設全開） */
export const PERMISSION_KEYS = [
  'view_dashboard',
  'view_inventory',
  'edit_inventory',
  'view_orders',
  'edit_orders',
  'view_treasury',
  'edit_treasury',
  'manage_users',
  'reset_data',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

export type PermissionGroup = {
  id: string;
  label: string;
  keys: { key: PermissionKey; label: string; hint?: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'pages',
    label: '功能頁面',
    keys: [
      { key: 'view_dashboard', label: '營運概況', hint: '可進入首頁與總覽' },
      { key: 'view_inventory', label: '庫存管理（檢視）' },
      { key: 'view_orders', label: '訂單管理（檢視）' },
      { key: 'view_treasury', label: '金流管理（檢視）' },
    ],
  },
  {
    id: 'inventory',
    label: '庫存操作',
    keys: [{ key: 'edit_inventory', label: '新增／編輯／刪除庫存', hint: '需一併勾選「庫存管理（檢視）」' }],
  },
  {
    id: 'orders',
    label: '訂單操作',
    keys: [{ key: 'edit_orders', label: '建單／收款／編輯訂單', hint: '需一併勾選「訂單管理（檢視）」' }],
  },
  {
    id: 'treasury',
    label: '金流操作',
    keys: [{ key: 'edit_treasury', label: '轉帳／期初／廠商還款等', hint: '需一併勾選「金流管理（檢視）」' }],
  },
  {
    id: 'system',
    label: '系統管理',
    keys: [
      { key: 'manage_users', label: '帳號與權限設定' },
      { key: 'reset_data', label: '重置本機業務資料', hint: '危險操作，請謹慎下放' },
    ],
  },
];

/** 側邊欄導覽與檢視權限對應 */
export const NAV_VIEW_PERMISSION: Record<string, PermissionKey> = {
  dashboard: 'view_dashboard',
  inventory: 'view_inventory',
  orders: 'view_orders',
  treasury: 'view_treasury',
  users: 'manage_users',
};
