import { describe, expect, it } from 'vitest';
import type { ShengwatchDataBundleV1 } from './bundleTypes';
import { bundleUpdatedAt, shouldRejectPush } from './bundleConflict';

function bundle(updatedAt: number): ShengwatchDataBundleV1 {
  return {
    bundleVersion: 1,
    app: 'shengwatch',
    exportedAt: new Date().toISOString(),
    updatedAt,
    format: 'shengwatch-localStorage-snapshot-v1',
    keys: { shengwatch_items_v1: '[]' },
  };
}

describe('shouldRejectPush', () => {
  it('空雲端允許首次推送', () => {
    expect(shouldRejectPush(null, 0)).toBe(false);
  });

  it('客戶端基於舊版本時拒絕', () => {
    expect(shouldRejectPush(bundle(200), 100)).toBe(true);
  });

  it('客戶端基於最新版本時允許', () => {
    expect(shouldRejectPush(bundle(200), 200)).toBe(false);
  });

  it('bundleUpdatedAt 處理非法值', () => {
    expect(bundleUpdatedAt({ ...bundle(1), updatedAt: NaN })).toBe(0);
  });
});
