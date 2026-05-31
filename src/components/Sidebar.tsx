import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ImagePlus,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Shield,
  ShoppingCart,
  Watch,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import {
  BRAND_LOGO_UPDATED_EVENT,
  clearBrandLogo,
  readBrandLogo,
  writeBrandLogo,
} from '@/lib/brandLogoStorage';
import { NAV_VIEW_PERMISSION, type PermissionKey } from '@/types/permissions';
import {
  loadMainNavOrder,
  moveNavId,
  resetMainNavOrder,
  saveMainNavOrder,
  sortMainNavIds,
  type MainNavId,
} from '@/lib/navOrderStorage';
import { cn } from '@/lib/utils';

export type NavViewId = 'dashboard' | 'inventory' | 'orders' | 'treasury' | 'ledger' | 'users';

type NavItemDef = { id: NavViewId; label: string; icon: typeof LayoutDashboard };

const MAIN_NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', label: '營運概況', icon: LayoutDashboard },
  { id: 'inventory', label: '庫存管理', icon: Watch },
  { id: 'orders', label: '訂單管理', icon: ShoppingCart },
  { id: 'treasury', label: '金流管理', icon: Landmark },
  { id: 'ledger', label: '收支記帳', icon: NotebookPen },
];

const FOOTER_NAV_ITEMS: NavItemDef[] = [
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

function filterNavByPermission(items: NavItemDef[], can: (key: PermissionKey) => boolean) {
  return items.filter((item) => {
    const perm = NAV_VIEW_PERMISSION[item.id];
    return !perm || can(perm);
  });
}

function NavButton({
  label,
  icon: Icon,
  active,
  reorderMode,
  dragOver,
  canMoveUp,
  canMoveDown,
  onNavigate,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  reorderMode: boolean;
  dragOver?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onNavigate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg transition-colors',
        dragOver && 'bg-amber-50 ring-1 ring-amber-200',
        active && !reorderMode && 'border-r-4 border-amber-600 bg-amber-50',
      )}
      onDragOver={reorderMode ? onDragOver : undefined}
      onDragLeave={reorderMode ? onDragLeave : undefined}
      onDrop={reorderMode ? onDrop : undefined}
    >
      {reorderMode && (
        <div className="flex shrink-0 flex-col pl-0.5">
          <button
            type="button"
            title="上移"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="下移"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <button
        type="button"
        draggable={reorderMode}
        onDragStart={reorderMode ? onDragStart : undefined}
        onDragEnd={reorderMode ? onDragEnd : undefined}
        onClick={() => {
          if (!reorderMode) onNavigate();
        }}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          reorderMode ? 'cursor-grab text-slate-700 active:cursor-grabbing' : '',
          active && !reorderMode ? 'text-amber-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        )}
      >
        {reorderMode && <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />}
        <Icon className={cn('h-5 w-5 shrink-0', active && !reorderMode ? 'text-amber-600' : 'text-slate-400')} />
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}

export default function Sidebar({ currentView, setCurrentView, isOpen, setIsOpen, can, onLogout }: SidebarProps) {
  const [reorderMode, setReorderMode] = useState(false);
  const [mainOrder, setMainOrder] = useState<MainNavId[]>(() => loadMainNavOrder());
  const [dragId, setDragId] = useState<MainNavId | null>(null);
  const [dragOverId, setDragOverId] = useState<MainNavId | null>(null);

  const visibleMainNav = useMemo(() => {
    const filtered = filterNavByPermission(MAIN_NAV_ITEMS, can) as { id: MainNavId; label: string; icon: typeof LayoutDashboard }[];
    return sortMainNavIds(filtered, mainOrder);
  }, [can, mainOrder]);

  const visibleFooterNav = filterNavByPermission(FOOTER_NAV_ITEMS, can);

  const persistOrder = useCallback((next: MainNavId[]) => {
    setMainOrder(next);
    saveMainNavOrder(next);
  }, []);

  const applyMove = useCallback(
    (fromId: MainNavId, toId: MainNavId) => {
      persistOrder(moveNavId(mainOrder, fromId, toId));
    },
    [mainOrder, persistOrder],
  );

  const navigate = (id: NavViewId) => {
    setCurrentView(id);
    setIsOpen(false);
  };

  const exitReorderMode = () => {
    setReorderMode(false);
    setDragId(null);
    setDragOverId(null);
  };

  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(() => readBrandLogo());
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setBrandLogoUrl(readBrandLogo());
    window.addEventListener(BRAND_LOGO_UPDATED_EVENT, sync);
    return () => window.removeEventListener(BRAND_LOGO_UPDATED_EVENT, sync);
  }, []);

  const onLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('請選擇圖片檔。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try {
        writeBrandLogo(reader.result);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '無法儲存圖片');
      }
    };
    reader.onerror = () => window.alert('讀取圖片失敗');
    reader.readAsDataURL(file);
  };

  const onLogoContextMenu = (e: MouseEvent) => {
    if (!brandLogoUrl) return;
    e.preventDefault();
    if (window.confirm('還原為預設圖示？')) clearBrandLogo();
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
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm transition-transform md:sticky md:top-0 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <button
                type="button"
                className="group relative flex h-10 w-10 overflow-hidden rounded-xl shadow-md ring-1 ring-black/5"
                title={brandLogoUrl ? '點擊更換 Logo · 右鍵還原預設' : '點擊上傳自訂 Logo'}
                onClick={() => logoInputRef.current?.click()}
                onContextMenu={onLogoContextMenu}
              >
                {brandLogoUrl ? (
                  <img src={brandLogoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700 text-white">
                    <Watch className="h-5 w-5" />
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-slate-900/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <ImagePlus className="h-4 w-4 text-white" aria-hidden />
                </span>
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={onLogoFileChange}
              />
            </div>
            <p className="text-sm font-bold leading-snug text-slate-900">手錶銷售管理系統</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            {reorderMode ? (
              <>
                <span className="text-xs text-slate-500">拖曳或使用箭頭調整順序</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-800"
                  onClick={exitReorderMode}
                >
                  完成
                </button>
              </>
            ) : (
              visibleMainNav.length > 1 && (
                <button
                  type="button"
                  className="ml-auto text-xs text-slate-500 hover:text-amber-700"
                  onClick={() => setReorderMode(true)}
                >
                  調整順序
                </button>
              )
            )}
          </div>

          <div className="space-y-1">
            {visibleMainNav.map((item, index) => (
              <NavButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                active={currentView === item.id}
                reorderMode={reorderMode}
                dragOver={dragOverId === item.id && dragId !== item.id}
                canMoveUp={index > 0}
                canMoveDown={index < visibleMainNav.length - 1}
                onNavigate={() => navigate(item.id)}
                onMoveUp={() => {
                  const prev = visibleMainNav[index - 1];
                  if (prev) applyMove(item.id, prev.id);
                }}
                onMoveDown={() => {
                  const next = visibleMainNav[index + 1];
                  if (next) applyMove(item.id, next.id);
                }}
                onDragStart={() => setDragId(item.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(item.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === item.id) setDragOverId(null);
                }}
                onDrop={() => {
                  if (dragId && dragId !== item.id) applyMove(dragId, item.id);
                  setDragId(null);
                  setDragOverId(null);
                }}
              />
            ))}
          </div>

          {reorderMode && (
            <button
              type="button"
              className="mt-3 px-1 text-left text-xs text-slate-400 hover:text-slate-600"
              onClick={() => {
                resetMainNavOrder();
                setMainOrder(loadMainNavOrder());
              }}
            >
              恢復預設順序
            </button>
          )}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-slate-100 bg-white p-3">
          {visibleFooterNav.map((item) => (
            <NavButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={currentView === item.id}
              reorderMode={false}
              onNavigate={() => navigate(item.id)}
            />
          ))}
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onLogout}
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
