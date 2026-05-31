import {
  LayoutDashboard,
  Landmark,
  LogOut,
  Menu,
  Shield,
  ShoppingCart,
  Watch,
  X,
} from 'lucide-react';
import { NAV_VIEW_PERMISSION, type PermissionKey } from '@/types/permissions';
import { SHENGWATCH_EXPORT_STORAGE_KEYS } from '@/lib/appDataBundle';
import { cn } from '@/lib/utils';

export type NavViewId = 'dashboard' | 'inventory' | 'orders' | 'treasury' | 'users';

const NAV_ITEMS: { id: NavViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: '營運概況', icon: LayoutDashboard },
  { id: 'inventory', label: '庫存管理', icon: Watch },
  { id: 'orders', label: '訂單管理', icon: ShoppingCart },
  { id: 'treasury', label: '金流管理', icon: Landmark },
  { id: 'users', label: '帳號與權限', icon: Shield },
];

type SidebarProps = {
  currentView: NavViewId;
  setCurrentView: (view: NavViewId) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  can: (key: PermissionKey) => boolean;
  onLogout: () => void;
};

export default function Sidebar({ currentView, setCurrentView, isOpen, setIsOpen, can, onLogout }: SidebarProps) {
  const visibleNav = NAV_ITEMS.filter((item) => {
    const perm = NAV_VIEW_PERMISSION[item.id];
    return !perm || can(perm);
  });

  const navigate = (id: NavViewId) => {
    setCurrentView(id);
    setIsOpen(false);
  };

  const resetLocalData = () => {
    if (!window.confirm('確定要清除本機所有業務資料嗎？帳號與權限設定會保留。此操作無法復原。')) return;
    for (const key of SHENGWATCH_EXPORT_STORAGE_KEYS) {
      if (key === 'shengwatch_system_users_v1' || key === 'shengwatch_login_credentials_v1') continue;
      localStorage.removeItem(key);
    }
    window.location.reload();
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="關閉選單"
          className="fixed inset-0 z-40 bg-slate-900/30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-sm transition-transform md:static md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md">
              <Watch className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">職人手錶</p>
              <p className="text-xs text-slate-500">進銷存管理</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map(({ id, label, icon: Icon }) => {
            const active = currentView === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-r-4 border-amber-600 bg-amber-50 text-amber-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className={cn('h-5 w-5', active ? 'text-amber-600' : 'text-slate-400')} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-slate-100 p-3">
          {can('reset_data') && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
              onClick={resetLocalData}
            >
              <LogOut className="h-5 w-5" />
              重置業務資料
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={() => {
              if (window.confirm('確定要登出？')) onLogout();
            }}
          >
            <LogOut className="h-5 w-5" />
            登出
          </button>
        </div>
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
      onClick={onClick}
      aria-label="開啟選單"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
