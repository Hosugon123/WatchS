import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/Modal';
import Sidebar, { type NavViewId } from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import AccessDenied from '@/components/AccessDenied';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useIsNarrowScreen } from '@/hooks/useIsNarrowScreen';
import {
  AUTH_SESSION_CHANGED_EVENT,
  clearSession,
  ensureAuthBootstrap,
  readSession,
  validateSession,
  type AuthSession,
} from '@/lib/authSession';
import { NAV_VIEW_PERMISSION, type PermissionKey } from '@/types/permissions';
import { initRemoteSyncOnAppLoad, startRemoteSyncListeners } from '@/services/watchApiService';
import RemoteSyncBanner from '@/components/RemoteSyncBanner';
import Dashboard from '@/views/Dashboard';
import Inventory from '@/views/Inventory';
import OrdersView from '@/views/Orders';
import Treasury from '@/views/Treasury';
import LedgerView from '@/views/Ledger';
import LoginScreen from '@/views/LoginScreen';
import UserPermissions from '@/views/UserPermissions';

const VIEW_TITLES: Record<NavViewId, string> = {
  dashboard: '營運概況',
  inventory: '庫存管理',
  orders: '訂單管理',
  treasury: '金流管理',
  ledger: '收支記帳',
  users: '帳號與權限',
};

const NAV_ORDER: NavViewId[] = ['dashboard', 'inventory', 'orders', 'treasury', 'ledger', 'users'];

function firstAllowedView(can: (key: PermissionKey) => boolean): NavViewId {
  for (const id of NAV_ORDER) {
    const perm = NAV_VIEW_PERMISSION[id];
    if (perm && can(perm)) return id;
  }
  return 'dashboard';
}

function AppShell() {
  const { can, logout } = useAuth();
  const [currentView, setCurrentView] = useState<NavViewId>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const isNarrow = useIsNarrowScreen();

  const requestLogout = useCallback(() => setLogoutConfirmOpen(true), []);

  const performLogout = useCallback(() => logout(), [logout]);

  useEffect(() => {
    const perm = NAV_VIEW_PERMISSION[currentView];
    if (perm && !can(perm)) {
      setCurrentView(firstAllowedView(can));
    }
  }, [currentView, can]);

  const renderView = () => {
    const perm = NAV_VIEW_PERMISSION[currentView];
    if (perm && !can(perm)) {
      return <AccessDenied />;
    }
    switch (currentView) {
      case 'inventory':
        return <Inventory />;
      case 'orders':
        return <OrdersView />;
      case 'treasury':
        return <Treasury />;
      case 'ledger':
        return <LedgerView />;
      case 'users':
        return <UserPermissions />;
      default:
        return (
          <Dashboard
            onNavigate={(view) => {
              setCurrentView(view);
            }}
          />
        );
    }
  };

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-slate-50">
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        isOpen={menuOpen || !isNarrow}
        setIsOpen={setMenuOpen}
        can={can}
        onLogout={requestLogout}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <RemoteSyncBanner />
        <Topbar title={VIEW_TITLES[currentView]} onMenuClick={() => setMenuOpen(true)} />

        <ConfirmDialog
          open={logoutConfirmOpen}
          title="登出"
          message="確定要登出？"
          confirmLabel="登出"
          danger
          onConfirm={performLogout}
          onClose={() => setLogoutConfirmOpen(false)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {isNarrow && (
            <h2 className="mb-4 text-lg font-bold text-slate-900">{VIEW_TITLES[currentView]}</h2>
          )}
          {renderView()}
        </main>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const syncSession = useCallback(() => {
    const s = readSession();
    if (s && validateSession(s)) {
      setSession(s);
    } else {
      clearSession();
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await initRemoteSyncOnAppLoad();
      startRemoteSyncListeners();
      ensureAuthBootstrap();
      syncSession();
      setAuthReady(true);
    })();
  }, [syncSession]);

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
  }, [syncSession]);

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500">
        載入中…
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onSuccess={syncSession} />;
  }

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default function App() {
  return <AuthenticatedApp />;
}
