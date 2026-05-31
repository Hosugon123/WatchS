/** 雲端 bundle 型別（API 專用，勿 import src/ 以免 Vercel 打包到瀏覽器程式碼） */
export const SHENGWATCH_DATA_BUNDLE_VERSION = 1;
export const SHENGWATCH_APP_ID = 'shengwatch';
export const SHENGWATCH_BUNDLE_FORMAT = 'shengwatch-localStorage-snapshot-v1' as const;

export type ShengwatchDataBundleV1 = {
  bundleVersion: typeof SHENGWATCH_DATA_BUNDLE_VERSION;
  app: typeof SHENGWATCH_APP_ID;
  exportedAt: string;
  updatedAt?: number;
  format: typeof SHENGWATCH_BUNDLE_FORMAT;
  keys: Record<string, string | null | undefined>;
};
