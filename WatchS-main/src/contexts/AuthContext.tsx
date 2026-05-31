import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AUTH_SESSION_CHANGED_EVENT,
  clearSession,
  readSession,
  validateSession,
  writeSession,
  type AuthSession,
} from '@/lib/authSession';
import { userHasPermission } from '@/lib/permissionChecks';
import { getSystemUserById, SYSTEM_USERS_UPDATED_EVENT } from '@/lib/systemUsersStorage';
import { isSuperAdminSession } from '@/lib/authSession';
import type { PermissionKey } from '@/types/permissions';
import type { SystemUser } from '@/lib/systemUsersStorage';

type AuthContextValue = {
  session: AuthSession | null;
  user: SystemUser | null;
  isSuperAdmin: boolean;
  can: (key: PermissionKey) => boolean;
  refreshUser: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const s = readSession();
    return s && validateSession(s) ? s : null;
  });
  const [userTick, setUserTick] = useState(0);

  const syncSession = useCallback(() => {
    const s = readSession();
    if (s && validateSession(s)) {
      setSession(s);
    } else {
      clearSession();
      setSession(null);
    }
    setUserTick((t) => t + 1);
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
  }, [syncSession]);

  useEffect(() => {
    const onUsersUpdated = () => {
      const s = readSession();
      if (s) {
        const u = getSystemUserById(s.userId);
        if (u?.status === 'active' && u.loginId && u.role !== s.role) {
          writeSession({ userId: u.id, loginId: u.loginId, role: u.role });
          return;
        }
      }
      setUserTick((t) => t + 1);
    };
    window.addEventListener(SYSTEM_USERS_UPDATED_EVENT, onUsersUpdated);
    return () => window.removeEventListener(SYSTEM_USERS_UPDATED_EVENT, onUsersUpdated);
  }, []);

  const user = useMemo(() => {
    void userTick;
    if (!session) return null;
    return getSystemUserById(session.userId) ?? null;
  }, [session, userTick]);

  const refreshUser = useCallback(() => setUserTick((t) => t + 1), []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const isSuperAdmin = session ? isSuperAdminSession(session.loginId) : false;

  const can = useCallback(
    (key: PermissionKey) => userHasPermission(user, key),
    [user],
  );

  const value = useMemo(
    () => ({ session, user, isSuperAdmin, can, refreshUser, logout }),
    [session, user, isSuperAdmin, can, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 須在 AuthProvider 內使用');
  return ctx;
}
