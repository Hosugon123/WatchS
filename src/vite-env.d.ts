/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_MODE?: 'localStorage' | 'remote';
  readonly VITE_API_URL?: string;
  readonly VITE_API_SYNC_TOKEN?: string;
  readonly VITE_ASYNC_STORAGE_DELAY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
