import { describe, expect, it } from 'vitest';
import { userHasPermission, sanitizePermissionMap } from './permissionChecks';
import type { SystemUser } from './systemUsersStorage';

const staff: SystemUser = {
  id: '1',
  name: '員工',
  role: 'staff',
  loginId: 'staff01',
  email: 'a@b.c',
  phone: '',
  status: 'active',
  permissions: { view_inventory: true },
  createdAt: '',
  updatedAt: '',
};

const admin: SystemUser = { ...staff, role: 'admin', permissions: {} };

describe('userHasPermission', () => {
  it('admin has all permissions', () => {
    expect(userHasPermission(admin, 'edit_treasury')).toBe(true);
    expect(userHasPermission(admin, 'reset_data')).toBe(true);
  });

  it('staff only has granted keys', () => {
    expect(userHasPermission(staff, 'view_inventory')).toBe(true);
    expect(userHasPermission(staff, 'edit_inventory')).toBe(false);
  });

  it('disabled staff has no access', () => {
    expect(userHasPermission({ ...staff, status: 'disabled' }, 'view_inventory')).toBe(false);
  });
});

describe('sanitizePermissionMap', () => {
  it('strips unknown keys', () => {
    expect(sanitizePermissionMap({ view_orders: true, bogus: true } as never)).toEqual({
      view_orders: true,
    });
  });
});
