import type { PermissionKey, PermissionMap } from '@/types/permissions';
import { PERMISSION_KEYS } from '@/types/permissions';
import type { SystemUser } from './systemUsersStorage';

export function emptyPermissionMap(): PermissionMap {
  return {};
}

export function allPermissionsTrue(): PermissionMap {
  const m: PermissionMap = {};
  for (const k of PERMISSION_KEYS) m[k] = true;
  return m;
}

/** 管理員角色視為擁有全部權限 */
export function userHasPermission(user: SystemUser | null | undefined, key: PermissionKey): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'admin') return true;
  return user.permissions?.[key] === true;
}

export function sanitizePermissionMap(input: PermissionMap | undefined): PermissionMap {
  const out: PermissionMap = {};
  if (!input) return out;
  for (const k of PERMISSION_KEYS) {
    if (input[k] === true) out[k] = true;
  }
  return out;
}

export function permissionMapToList(map: PermissionMap | undefined): PermissionKey[] {
  return PERMISSION_KEYS.filter((k) => map?.[k] === true);
}
