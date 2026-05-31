import { describe, expect, it } from 'vitest';
import { moveNavId, sortMainNavIds, MAIN_NAV_DEFAULT_ORDER } from './navOrderStorage';

describe('navOrderStorage', () => {
  it('sortMainNavIds 依自訂順序排列', () => {
    const items = [
      { id: 'dashboard' as const, label: 'A' },
      { id: 'inventory' as const, label: 'B' },
      { id: 'orders' as const, label: 'C' },
    ];
    const sorted = sortMainNavIds(items, ['orders', 'dashboard', 'inventory']);
    expect(sorted.map((x) => x.id)).toEqual(['orders', 'dashboard', 'inventory']);
  });

  it('moveNavId 移動項目', () => {
    const next = moveNavId(MAIN_NAV_DEFAULT_ORDER, 'treasury', 'dashboard');
    expect(next[0]).toBe('treasury');
    expect(next).toContain('dashboard');
  });
});
