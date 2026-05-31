/**
 * 側欄品牌 Logo（本機 data URL）
 */

const STORAGE_KEY = 'shengwatch_brand_logo_v1';
const MAX_DATA_URL_LENGTH = 512_000;

export const BRAND_LOGO_UPDATED_EVENT = 'shengwatchBrandLogoUpdated';

export function readBrandLogo(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !raw.startsWith('data:image/')) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeBrandLogo(dataUrl: string): void {
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:image/')) {
    throw new Error('請上傳 PNG、JPG、WebP 或 GIF 圖片。');
  }
  if (trimmed.length > MAX_DATA_URL_LENGTH) {
    throw new Error('圖片過大，請使用小於約 500KB 的圖片。');
  }
  localStorage.setItem(STORAGE_KEY, trimmed);
  window.dispatchEvent(new Event(BRAND_LOGO_UPDATED_EVENT));
}

export function clearBrandLogo(): void {
  if (!localStorage.getItem(STORAGE_KEY)) return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(BRAND_LOGO_UPDATED_EVENT));
}
