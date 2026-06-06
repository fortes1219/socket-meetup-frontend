# Socket Meetup Frontend

Vue Meetup
demo 前端專案，用來展示多分頁 Socket.IO 即時資料治理、K 線 history/realtime 接合，以及交易對 CRUD 後的資料同步。

這個 repo 是 Socket Meetup demo 的前端部分。重點不是「畫一張 K 線圖」，而是展示 Vue 前端如何在多分頁環境中協調 realtime
ownership，避免把高頻行情 tick 透過 `BroadcastChannel` 廣播到所有分頁。

## Demo 展示內容

- 從 REST API 繪製 K 線歷史資料。
- 透過 Socket.IO `/quote` 接收 K 線 realtime tick。
- 交易對 selector 與前端 precision metadata。
- 同 origin 多分頁的 leader / follower realtime ownership。
- Admin 交易對 CRUD。
- Backend `callUpdate` 通知 frontend refetch 與 cache coherence。
- TanStack Query 管 server state。
- Pinia 管 client coordination state。
- Zod runtime validation。
- ts-rest type-level contract。

## Routes

| Route                   | 用途                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `/`                     | Public demo 頁：K 線圖、交易對 selector、realtime owner/follower 行為。 |
| `/manage/trading-pairs` | Admin demo 頁：交易對 CRUD。                                            |

Admin UI route 刻意不使用 `/admin/*`。原因是 Vite dev proxy 會把 `/admin` 轉發到 backend API。

## 架構邊界

### Feature Views

Feature-owned UI 與 composables 放在各自 view folder：

```text
src/views/home/
  Home.vue
  components/
  composables/

src/views/admin-trading-pairs/
  AdminTradingPairs.vue
  components/
```

跨 feature 的 infrastructure 才放在 view 外：

```text
src/service/
  api/
  contract/
  schema/
  socket/
  control/
  leader/
  kline/

src/queries/
src/stores/
```

### Socket 邊界

Frontend 使用兩個 Socket.IO namespace：

| Namespace | 用途                                                               |
| --------- | ------------------------------------------------------------------ |
| `/quote`  | 高頻 K 線 realtime 更新。只有 realtime owner tab 消費。            |
| `/`       | 低頻 control signal，目前用於 `callUpdate` resource invalidation。 |

`BroadcastChannel` 只作為 control plane，不廣播 K 線 tick。

### State Ownership

| State                                            | Owner                        |
| ------------------------------------------------ | ---------------------------- |
| REST server data                                 | TanStack Query               |
| leader role / socket state / subscription intent | Pinia                        |
| Socket payload validation                        | Zod schemas                  |
| API contract typing                              | ts-rest type-level contracts |
| Chart data adapter                               | `src/service/kline/`         |

## 本地開發

先啟動 backend，並確保 backend 在：

```text
localhost:3000
```

再啟動 frontend：

```bash
npm install
npm run dev
```

Vite dev server 會 proxy 這些路徑到 backend：

```text
/api
/admin
/healthz
/socket.io
```

開啟：

```text
http://localhost:5173/
http://localhost:5173/manage/trading-pairs
```

## 常用指令

```bash
npm run dev
npm run typecheck:test
npm run format:check
npm run lint
npm run test:run
npm run build
```

## Demo Flow

1. 開 `/`，確認 K 線 history 有繪製。
2. 確認 leader tab 的 realtime 現價會更新。
3. 開第二個同 origin 分頁，觀察 follower 行為。
4. 開 `/manage/trading-pairs`。
5. 輸入 admin token，進行本地 demo CRUD。
6. Create / enable / disable / reorder / delete trading pair。
7. 回 `/`，觀察 public trading-pair selector/list 透過 `callUpdate` 更新。

## 重要設計選擇

- Admin 頁不參與 realtime leader election。
- Home 是 public realtime demo surface。
- Trading-pair CRUD 不直接修改 Home state。
- Backend commit 成功後 emit `callUpdate`。
- Frontend 依照 `callUpdate.resource` 對應要更新的 query。
- Jitter / coordinator 避免所有分頁同時 refetch。
- Admin token 只存在 memory，不持久化。
- `BroadcastChannel` 不廣播高頻 K 線 tick，只傳 coordination/control message。

## Docker

Build static frontend image：

```bash
docker build -t socket-meetup-frontend .
```

本地執行：

```bash
docker run --rm -p 8080:80 socket-meetup-frontend
```

Production deployment 細節、正式 hostname、credential、runbook 不寫在 public README。

## Public Documentation

可公開的 backend/frontend contract notes 放在：

```text
docs/backend-contracts.md
```

Private handoff、rehearsal notes、presentation drafts 放在 `.claude/`，並且刻意被 Git ignore。
