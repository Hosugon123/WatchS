# 手錶銷售管理系統（WatchS / shengwatch）

中古手錶進銷存 Web 應用：庫存、訂單、金流、收支記帳、帳號權限。前端 React + Vite；資料預設存瀏覽器 `localStorage`，正式環境可改為 **雲端 bundle 同步**（Vercel + Upstash Redis）。

> **給 Cursor / 換裝置開發：** 請先讀本 README 的「專案脈絡」與「Token 與環境變數結論」，即可延續先前對話中的部署與架構決策，無需重講一遍。

---

## 專案脈絡（2026-05 整理）

| 項目 | 結論 |
|------|------|
| **程式唯一來源** | Git repo **根目錄**（`src/`、`api/`）。已合併原 `WatchS-main/`，**勿再使用** `WatchS-main` 子目錄。 |
| **Vercel Root Directory** | 留空（使用 repo 根目錄）。 |
| **本機開發** | `npm run dev` → http://localhost:3001/ |
| **正式部署** | Vercel；`vercel.json` 已含 SPA rewrite 與 `/api` 路由。 |
| **多端資料** | 必須 `VITE_STORAGE_MODE=remote` + Redis + 同步 token（見下）。 |
| **衝突策略** | 雲端 `updatedAt` 樂觀鎖 → 409 → 頂部 `RemoteSyncBanner` 提示「載入雲端最新」，避免互相覆寫回溯。 |
| **與東山鴨頭共用 DB** | 可共用同一 Redis **實例**，但须 **不同 Redis key**（本系統：`shengwatch:bundle:v1`）且 **不同 sync token**；更建議 Upstash 開第二個 DB 手動填 env。 |

### 近期功能摘要

- 營運概況、收支記帳（表格式）、訂單（列表 + 明細收合）、金流（分頁／日期篩選）
- 側欄自訂 Logo、售價區間自訂（localStorage）
- 頂部列已移除：通知、登出、變更密碼（登出在側欄）
- 登出改 `ConfirmDialog`，`clearSession` 避免事件迴圈

### 重要路徑

| 用途 | 路徑 |
|------|------|
| 雲端同步 API | `api/sync-bundle.ts` |
| 同步邏輯／409 | `src/services/remoteSyncHub.ts` |
| 資料抽象層（UI 應呼叫） | `src/services/watchApiService.ts` |
| 匯出／匯入 keys | `src/lib/appDataBundle.ts` |
| 衝突橫幅 UI | `src/components/RemoteSyncBanner.tsx` |
| 環境變數範本 | `.env.example` |

---

## Token 與環境變數結論（必讀）

### 兩組 Token 的關係

本系統用 **同一組密鑰** 做前後端同步授權，但變數名稱不同（Vite 建置規則）：

| 變數 | 執行位置 | 用途 |
|------|----------|------|
| `VITE_API_SYNC_TOKEN` | 前端（打包進 JS） | `fetch('/api/sync-bundle')` 的 `Authorization: Bearer …` |
| `API_SYNC_TOKEN` | Vercel Serverless（`api/`） | 驗證上述 Bearer；**值必須與左欄完全相同** |

**結論：**

1. 兩個變數 = **同一串** 隨機密鑰（建議 32+ bytes，base64url）。
2. 只設一邊 → GET/PUT 回 **401**，橫幅顯示「雲端同步授權失敗」。
3. `VITE_*` 會出現在前端 bundle，屬 **團隊共用密鑰** 設計（內部系統可接受；要更高安全性需改為登入後 JWT，尚未實作）。
4. **東山鴨頭與手錶系統若共用 Redis，sync token 也必須分開**，不可兩套共用同一組。

### 產生密鑰（本機執行一次，貼到 Vercel）

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 其餘環境變數

| 變數 | Production 建議值 | 說明 |
|------|-------------------|------|
| `VITE_STORAGE_MODE` | `remote` | 多端共用；本機可改 `localStorage` 或省略 |
| `VITE_API_URL` | *(留空)* | 留空 → 同源 `/api` |
| `UPSTASH_REDIS_REST_URL` | 由 Upstash 提供 | 連結 Redis 後自動或手動填入 |
| `UPSTASH_REDIS_REST_TOKEN` | 由 Upstash 提供 | 同上 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 選用 | 舊版 Vercel KV 整合時的別名，程式亦支援 |

改動 `VITE_*` 後必須 **重新 Deploy**（建議不要只用 build cache）。

### Redis 儲存 key（與東山共用 DB 時）

- 本系統寫入 key：`shengwatch:bundle:v1`（見 `api/_lib/bundleConflict.ts`）
- 東山系統须使用 **不同 key**；勿共用 `API_SYNC_TOKEN`

---

## Vercel 部署步驟（簡表）

1. Import GitHub repo，`Root Directory` **留空**。
2. **Storage / Marketplace** → 安裝 **Upstash Redis**（或 Upstash 控制台開第二 DB，手動填 `UPSTASH_*` 到本專案）。
3. **Settings → Environment Variables** 新增（Production + Preview）：
   - `VITE_STORAGE_MODE` = `remote`
   - `VITE_API_URL` = 空
   - `VITE_API_SYNC_TOKEN` = 你的密鑰
   - `API_SYNC_TOKEN` = **同上**
4. **Deployments → Redeploy**（建議關閉 build cache）。
5. 驗證：登入後 Network 有 `GET /api/sync-bundle` **200**；兩台裝置能看到相同資料。

詳細圖文步驟見先前對話；變數意義以本節為準。

---

## 資料庫：一個 Vercel 免費 DB 怎麼選

| 方案 | 建議度 | 說明 |
|------|--------|------|
| **Upstash 第二個 Redis + 手動 env** | ⭐ 優先 | 不換部署平台；WatchS 專案貼另一組 `UPSTASH_*` |
| **同一 Redis、不同 key + 不同 token** | 可接受 | 省錢；key 已為 `shengwatch:bundle:v1` |
| **WatchS 換平台 / 第二 Vercel 帳號** | 最後手段 | 隔離最完整，設定成本最高 |

---

## 本機開發

```powershell
cd <repo 根目錄>
npm install
npm run dev      # http://localhost:3001
npm run lint
npm test
npm run build
```

### 本機 `.env.local`（勿提交 Git）

```env
# 僅本機瀏覽器，各裝置資料不共用
VITE_STORAGE_MODE=localStorage
```

```env
# 本機也要測雲端同步時（需 vercel dev 或已部署 API）
VITE_STORAGE_MODE=remote
VITE_API_URL=
VITE_API_SYNC_TOKEN=<與 Vercel 相同>
```

- 僅 `npm run dev`：預設 `localStorage`；`/api` proxy 到 `127.0.0.1:3000`，若未跑 API 則同步不可用。
- 要測完整雲端流程：`npx vercel dev`（讀取 Vercel 專案環境變數）。

---

## 多端同步行為（給除錯用）

1. **啟動**：`initRemoteSyncOnAppLoad` → GET 雲端 bundle → 覆寫本機（雲端非空時）。
2. **每次寫入**：`withRemoteStorageWrite` → PUT 整包 bundle，帶 `syncedFromUpdatedAt`。
3. **雲端較新**：PUT **409** → 鎖定同步 → `RemoteSyncBanner` → 使用者按「載入雲端最新」。
4. **分頁**：同瀏覽器 `storage` 事件同步 UI；回到分頁時 `checkRemoteNewer` 可能顯示 stale 橫幅。

---

## 換裝置用 Cursor 延續對話

1. Clone 同一 repo：`https://github.com/Hosugon123/WatchS`
2. 打開 **repo 根目錄**（不是 `WatchS-main`）。
3. 在 Cursor 新對話可說：
   > 請先讀 `README.md` 的「專案脈絡」和「Token 與環境變數結論」，再繼續 WatchS 開發。
4. 機密不要寫進 README：token 只放在 Vercel / 本機 `.env.local`。
5. 若本機殘留空資料夾 `WatchS-main/`（僅 `node_modules`），關閉 dev server 後刪除即可。

---

## 技術棧

- React 19、Vite 6、TypeScript、Tailwind CSS 4
- 部署：Vercel（靜態 `dist` + `api/sync-bundle`）
- 儲存：localStorage（bundle 快照） / Upstash Redis（正式）

---

## 授權

私有專案；依 repository 設定為準。
