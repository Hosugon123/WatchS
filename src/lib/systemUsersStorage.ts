/**
 * 系統使用者與功能權限（本機 localStorage）。
 */
import { SUPER_ADMIN_LOGIN_ID } from './authConstants';
import { sanitizePermissionMap } from './permissionChecks';
import type { PermissionMap } from '@/types/permissions';

const KEY = 'shengwatch_system_users_v1';

export const SYSTEM_USERS_UPDATED_EVENT = 'shengwatchSystemUsersUpdated';

export type SystemUserRole = 'admin' | 'staff';
export type SystemUserStatus = 'active' | 'disabled';

export type SystemUser = {
  id: string;
  name: string;
  role: SystemUserRole;
  loginId?: string;
  email: string;
  phone: string;
  status: SystemUserStatus;
  /** 僅 role=staff 時有效；admin 視為全權限 */
  permissions: PermissionMap;
  createdAt: string;
  updatedAt: string;
};

type PersistV1 = { version: 1; users: SystemUser[] };

export type NewSystemUserInput = {
  name: string;
  role: SystemUserRole;
  email: string;
  phone: string;
  loginId?: string;
  status?: SystemUserStatus;
  permissions?: PermissionMap;
};

export type SystemUserUpdate = Partial<
  Pick<SystemUser, 'name' | 'role' | 'loginId' | 'email' | 'phone' | 'status' | 'permissions'>
>;

function dispatchUpdated(): void {
  window.dispatchEvent(new Event(SYSTEM_USERS_UPDATED_EVENT));
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function normalizeLoginId(s: string): string {
  return s.trim().toLowerCase();
}

function matchesPrimarySuperLogin(u: SystemUser): boolean {
  return Boolean(u.loginId && normalizeLoginId(u.loginId) === normalizeLoginId(SUPER_ADMIN_LOGIN_ID));
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedUsers(): SystemUser[] {
  const t = nowIso();
  return [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: '許勝曄',
      role: 'admin',
      loginId: SUPER_ADMIN_LOGIN_ID,
      email: 'boss@shengwatch.local',
      phone: '',
      status: 'active',
      permissions: {},
      createdAt: t,
      updatedAt: t,
    },
  ];
}

function coerceUser(raw: unknown): SystemUser | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  const name = typeof o.name === 'string' ? o.name : '';
  const role = o.role;
  const email = typeof o.email === 'string' ? o.email : '';
  const phone = typeof o.phone === 'string' ? o.phone : '';
  const loginIdRaw = o.loginId;
  const status = o.status;
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : '';
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : '';
  if (!id || !name || !email) return null;
  if (role !== 'admin' && role !== 'staff') return null;
  if (status !== 'active' && status !== 'disabled') return null;
  const permissions =
    role === 'staff' && o.permissions && typeof o.permissions === 'object' && !Array.isArray(o.permissions)
      ? sanitizePermissionMap(o.permissions as PermissionMap)
      : {};
  const u: SystemUser = {
    id,
    name,
    role,
    email,
    phone,
    status,
    permissions,
    createdAt: createdAt || nowIso(),
    updatedAt: updatedAt || nowIso(),
  };
  if (typeof loginIdRaw === 'string' && loginIdRaw.trim()) {
    u.loginId = normalizeLoginId(loginIdRaw);
  }
  return u;
}

function loadPersisted(): SystemUser[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    const bag = parsed as PersistV1;
    if (bag.version !== 1 || !Array.isArray(bag.users)) return null;
    const out: SystemUser[] = [];
    for (const row of bag.users) {
      const u = coerceUser(row);
      if (u) out.push(u);
    }
    return out;
  } catch {
    return null;
  }
}

function savePersisted(users: SystemUser[]): void {
  const body: PersistV1 = { version: 1, users };
  localStorage.setItem(KEY, JSON.stringify(body));
  dispatchUpdated();
}

export function listSystemUsers(): SystemUser[] {
  const loaded = loadPersisted();
  if (loaded === null) {
    const seeded = seedUsers();
    savePersisted(seeded);
    return seeded.map((u) => ({ ...u, permissions: { ...u.permissions } }));
  }
  return loaded.map((u) => ({ ...u, permissions: { ...u.permissions } }));
}

export function ensurePrimarySuperAdminAccount(): SystemUser {
  const list = listSystemUsers();
  const sw = list.find((u) => u.loginId && normalizeLoginId(u.loginId) === normalizeLoginId(SUPER_ADMIN_LOGIN_ID));
  if (sw) {
    if (sw.status !== 'active' || sw.role !== 'admin') {
      updateSystemUser(sw.id, { status: 'active', role: 'admin' });
      const refreshed = listSystemUsers().find((u) => u.id === sw.id);
      return refreshed ? { ...refreshed, permissions: { ...refreshed.permissions } } : { ...sw, status: 'active', role: 'admin' };
    }
    return { ...sw, permissions: { ...sw.permissions } };
  }

  const firstAdmin = list.find((u) => u.role === 'admin');
  if (firstAdmin) {
    updateSystemUser(firstAdmin.id, {
      loginId: SUPER_ADMIN_LOGIN_ID,
      status: 'active',
      role: 'admin',
    });
    const refreshed = listSystemUsers().find((u) => u.id === firstAdmin.id);
    return refreshed
      ? { ...refreshed, permissions: { ...refreshed.permissions } }
      : { ...firstAdmin, loginId: SUPER_ADMIN_LOGIN_ID, status: 'active', role: 'admin' };
  }

  const t = nowIso();
  const seededAdmin: SystemUser = {
    id: crypto.randomUUID(),
    name: '系統管理員',
    role: 'admin',
    loginId: SUPER_ADMIN_LOGIN_ID,
    email: 'sw001@shengwatch.local',
    phone: '',
    status: 'active',
    permissions: {},
    createdAt: t,
    updatedAt: t,
  };
  savePersisted([seededAdmin, ...list]);
  return { ...seededAdmin };
}

export function createSystemUser(input: NewSystemUserInput): SystemUser {
  const list = listSystemUsers();
  const emailN = normalizeEmail(input.email);
  if (!input.name.trim()) throw new Error('請填寫使用者名稱。');
  if (!emailN) throw new Error('請填寫電子信箱。');
  if (input.role === 'admin') {
    throw new Error('無法新增管理員帳號；系統僅保留主要管理帳號。');
  }
  if (list.some((u) => normalizeEmail(u.email) === emailN)) {
    throw new Error('此信箱已被使用。');
  }
  let loginId: string | undefined;
  if (input.loginId?.trim()) {
    loginId = normalizeLoginId(input.loginId);
    if (!loginId) throw new Error('登入帳號不可僅有空白。');
    if (list.some((x) => x.loginId && normalizeLoginId(x.loginId) === loginId)) {
      throw new Error('此登入帳號已被使用。');
    }
  }
  const t = nowIso();
  const u: SystemUser = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    role: 'staff',
    email: emailN,
    phone: input.phone.trim(),
    status: input.status ?? 'active',
    permissions: sanitizePermissionMap(input.permissions),
    createdAt: t,
    updatedAt: t,
  };
  if (loginId) u.loginId = loginId;
  savePersisted([...list, u]);
  return { ...u };
}

export function updateSystemUser(id: string, patch: SystemUserUpdate): boolean {
  const list = listSystemUsers();
  const i = list.findIndex((u) => u.id === id);
  if (i < 0) return false;
  const cur = list[i]!;
  if (matchesPrimarySuperLogin(cur)) {
    if (patch.role && patch.role !== 'admin') throw new Error('無法變更主要管理員的角色。');
    if (patch.status === 'disabled') throw new Error('無法停權主要管理員。');
    if (patch.loginId && normalizeLoginId(patch.loginId) !== normalizeLoginId(SUPER_ADMIN_LOGIN_ID)) {
      throw new Error('無法變更主要管理員的登入帳號。');
    }
  }
  if (patch.role === 'admin' && !matchesPrimarySuperLogin(cur)) {
    throw new Error('無法將一般帳號提升為管理員；系統僅保留一位管理員。');
  }
  if (patch.email !== undefined) {
    const emailN = normalizeEmail(patch.email);
    if (!emailN) throw new Error('請填寫電子信箱。');
    if (list.some((u) => u.id !== id && normalizeEmail(u.email) === emailN)) {
      throw new Error('此信箱已被使用。');
    }
    cur.email = emailN;
  }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('請填寫使用者名稱。');
    cur.name = patch.name.trim();
  }
  if (patch.phone !== undefined) cur.phone = patch.phone.trim();
  if (patch.status !== undefined) cur.status = patch.status;
  if (patch.loginId !== undefined) {
    const lid = patch.loginId.trim() ? normalizeLoginId(patch.loginId) : undefined;
    if (lid && list.some((u) => u.id !== id && u.loginId && normalizeLoginId(u.loginId) === lid)) {
      throw new Error('此登入帳號已被使用。');
    }
    cur.loginId = lid;
  }
  if (patch.permissions !== undefined && cur.role === 'staff') {
    cur.permissions = sanitizePermissionMap(patch.permissions);
  }
  cur.updatedAt = nowIso();
  const next = [...list];
  next[i] = cur;
  savePersisted(next);
  return true;
}

export function removeSystemUser(id: string): boolean {
  const list = listSystemUsers();
  const u = list.find((x) => x.id === id);
  if (!u) return false;
  if (matchesPrimarySuperLogin(u)) throw new Error('無法刪除主要管理員帳號。');
  if (u.role === 'admin') throw new Error('無法刪除管理員帳號。');
  savePersisted(list.filter((x) => x.id !== id));
  return true;
}

export function getSystemUserById(id: string): SystemUser | undefined {
  return listSystemUsers().find((u) => u.id === id);
}

export function isPrimarySuperAdminUser(u: SystemUser | null | undefined): boolean {
  return Boolean(u && matchesPrimarySuperLogin(u));
}
