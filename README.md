# Socket Meetup Frontend

Vue Meetup demo 前端專案，用來展示多分頁 Socket.IO 即時資料治理、K 線 history/realtime 接合、交易對 CRUD 後的資料一致性，以及前端如何在高頻即時資料場景中治理 realtime ownership。

這個 repo 的重點不是「畫一張 K 線圖」，也不是「接上 WebSocket 就會動」。

真正要展示的是：

> 當使用者在同一個 origin 開多個分頁或視窗時，前端如何決定誰有資格吃 realtime socket、誰只保留 history / snapshot、誰該在資料變更後 refetch，以及如何避免把高頻行情 tick 透過 BroadcastChannel 廣播到所有分頁。

---

## 核心主張

### BroadcastChannel is not your market-data bus.

在這個 demo 裡，`BroadcastChannel` 不是拿來廣播 K 線 tick，也不是拿來把 ticker 當成前端資料匯流排。

它只作為 **control plane**：

- leader election
- realtime ownership 協調
- active tab reclaim realtime owner
- resource invalidation
- snapshot coherence
- sync request
- jitter / dedupe refetch coordination

高頻行情資料則走 `/quote` namespace，並且只由 realtime owner tab 消費。

---

## Demo 展示內容

- 從 REST API 繪製 K 線歷史資料。
- 透過 Socket.IO `/quote` 接收 K 線 realtime tick。
- 交易對 selector 與前端 precision metadata。
- 同 origin 多分頁 leader / follower realtime ownership。
- Active tab 重新取得 realtime owner。
- K 線 history reload + realtime resubscribe。
- Admin 交易對 CRUD。
- Backend `callUpdate` 觸發 frontend resource invalidation。
- Leader refresh 後 publish snapshot，follower apply snapshot。
- TanStack Query 管 server state。
- Pinia 管 client coordination state。
- Zod runtime validation。
- ts-rest type-level contract。

---

## 為什麼不是每個分頁都連 socket？

每個瀏覽器分頁都是獨立 runtime：

- Vue app instance
- Pinia store
- TanStack Query observer
- Socket.IO client
- klinecharts instance
- watcher / computed / render pipeline

如果每個分頁都直接連 `/quote`，成本不只是多幾條 WebSocket connection。

每一筆 tick 後面通常還包含：

- JSON parse
- schema validation
- normalize
- store update
- computed / watch invalidation
- chart callback
- render scheduling
- GC pressure

所以這個 demo 的目標不是「讓 WebSocket 能動」，而是治理：

> 哪個分頁有資格 realtime？
> 哪個分頁應該停止吃高頻資料？
> 哪些資料更新應該透過 invalidation / snapshot，而不是每個分頁各自暴衝 refetch？

---

## 架構邊界

### Routes

| Route | 用途 |
|---|---|
| `/` | Public demo 頁：K 線圖、交易對 selector、realtime owner/follower 行為。 |
| `/manage/trading-pairs` | Admin demo 頁：交易對 CRUD。 |

Admin UI route 刻意不使用 `/admin/*`，因為 Vite dev proxy 會把 `/admin` 轉發到 backend API。

---

### Feature Views

Feature-owned UI 與 composables 放在各自 view folder：

```txt
src/views/home/
  Home.vue
  components/
  composables/

src/views/admin-trading-pairs/
  AdminTradingPairs.vue
  components/
```

跨 feature 的 infrastructure 才放在 view 外：

```txt
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

這樣切分的目的不是為了目錄漂亮，而是讓 feature UI、server state、client coordination、socket protocol、cross-tab control 不互相污染。

---

## Socket 邊界

Frontend 使用兩個 Socket.IO namespace：

| Namespace | 用途 |
|---|---|
| `/quote` | 高頻 K 線 realtime 更新。只有 realtime owner tab 消費。 |
| `/` | 低頻 control signal，目前用於 `callUpdate` resource invalidation。 |

### `/quote`：high-frequency data plane

`/quote` 負責 K 線 realtime tick。

只有 realtime owner tab 會 bind quote socket、subscribe symbol interval、接收 tick、更新 chart。

Follower tab 不會開 `/quote` socket，也不會吃 leader 廣播過來的 K 線 tick。

### `/`：low-frequency control signal

`/` namespace 目前用於 backend commit 後發出的 `callUpdate`。

`callUpdate` 不攜帶完整 trading-pairs data，只是一個 resource invalidation signal。

Frontend 收到後交給 control coordinator 判斷誰要 refresh、誰要 publish snapshot、誰要 apply snapshot。

---

## BroadcastChannel 邊界

`BroadcastChannel` 只處理 coordination/control message，不處理高頻 market data。

它負責：

- `request-leader`
- `leader-announcement`
- `leader-heartbeat`
- `leader-release`
- `control:invalidated`
- `control:updated`
- `sync-request`

它不負責：

- 廣播 K 線 tick
- 廣播 ticker
- 替 follower 更新圖表
- 把瀏覽器變成另一個 market-data fan-out server

---

## Realtime ownership model

### Leader tab

Leader tab 代表目前取得 realtime ownership 的分頁。

它負責：

- connect `/quote`
- subscribe current symbol / interval
- consume realtime tick
- update local chart
- 在必要時 refresh resource
- publish control snapshot

### Follower tab

Follower tab 不直接吃 realtime socket。

它負責：

- 保留目前頁面狀態與 subscription intent
- 需要操作時 request realtime ownership
- 接收 low-frequency control snapshot
- 不參與高頻 tick fan-out

### Active tab reclaim

當使用者切到另一個分頁並需要操作時，該分頁可以要求 realtime ownership。

取得 ownership 後會進行：

1. reconnect socket
2. reload latest history
3. resubscribe realtime

這不是單純 `focus -> reconnect`，而是 `history reload + socket subscribe` 的 resume flow。

---

## K 線 history + realtime 接合

K 線資料分成兩條線：

| 類型 | 來源 | 用途 |
|---|---|---|
| history | REST API | 初始化與 resume 時取得已收線 K 線。 |
| realtime | Socket.IO `/quote` | 更新目前這根未收線 K 線。 |

前端流程：

1. klinecharts 呼叫 `getBars`。
2. 前端透過 REST API 取得 history。
3. history 轉成 klinecharts 需要的資料格式。
4. realtime owner 透過 `/quote` subscribe symbol / interval。
5. 收到 tick 後 callback 給 chart。
6. same timestamp 的 tick 會更新同一根 K 線，而不是 append duplicate。

Resume 時會重新 reload history，再接 realtime，避免背景期間資料斷層。

---

## Admin CRUD + callUpdate coherence

Admin mutation 不直接修改 Home state。

後端流程：

```txt
Admin mutation
→ backend transaction + audit
→ DB commit
→ backend emit callUpdate(resource)
→ frontend status socket receives callUpdate
→ control coordinator invalidates resource
→ leader refreshes data
→ leader publishes snapshot
→ followers apply snapshot
```

這個設計讓 `callUpdate` 成為 committed invalidation signal，而不是資料本體，也不是 optimistic event。

Frontend 重點：

- Admin 頁不參與 realtime leader election。
- Admin mutation 不直接塞資料給 Home。
- Backend commit 後才 emit `callUpdate`。
- Frontend 依照 `callUpdate.resource` 對應更新 query。
- Leader refresh 後 publish snapshot。
- Follower apply snapshot。
- Jitter / dedupe 避免同一時間大量 refetch。

---

## State Ownership

| 類型 | Owner |
|---|---|
| REST server data | TanStack Query |
| leader role / socket state / subscription intent | Pinia |
| Socket payload validation | Zod schemas |
| API contract typing | ts-rest type-level contracts |
| K 線 chart adapter | `src/service/kline/` |
| cross-tab control protocol | `src/service/control/` + `src/service/leader/` |

### 為什麼不是全部塞 Pinia？

Server state 應該有自己的 cache、stale、refetch、observer 生命週期。

所以 trading-pairs REST data 交給 TanStack Query。

Pinia 只負責 client-side coordination state：

- leader role
- socket state
- current subscription intent
- control sequence
- last applied snapshot metadata

這樣可以避免 server state 與 client coordination state 混在一起。

---

## Refetch storm 防線

這個 demo 不採用：

- socket connected 就 refetch
- tab focus 就 refetch
- 每個分頁收到 callUpdate 就立刻 refetch
- 每個分頁自己決定資料新不新

而是使用：

- committed invalidation signal
- leader-only refresh
- snapshot publish
- follower apply
- keyed jitter
- dedupe pending work

也就是把「資料什麼時候該更新」從隨機事件，收斂成可治理的 protocol。

---

## 本地開發

先啟動 backend，並確保 backend 在：

```bash
localhost:3000
```

再啟動 frontend：

```bash
npm install
npm run dev
```

Vite dev server 會 proxy 這些路徑到 backend：

```txt
/api
/admin
/healthz
/socket.io
```

開啟：

```txt
http://localhost:5173/
http://localhost:5173/manage/trading-pairs
```

---

## 常用指令

```bash
npm run dev
npm run typecheck:test
npm run format:check
npm run lint
npm run test:run
npm run build
```

---

## Demo Flow

### Demo A：Home realtime owner

1. 開 `/`。
2. 確認 K 線 history 有繪製。
3. 確認 leader tab 的 realtime 現價會更新。
4. 說明目前分頁是 realtime owner。

### Demo B：第二分頁 follower / 重新取得 realtime

1. 開第二個同 origin 分頁。
2. 觀察 follower 行為。
3. 切換 active tab。
4. 觀察 realtime owner handoff。
5. 說明 reconnect + history reload + resubscribe。

### Demo C：交易對切換

1. 點 ETHUSDT。
2. 觀察 URL `?symbol=ETHUSDT`。
3. 觀察 history reload。
4. 觀察現價切 ETH。
5. 點 disabled symbol，確認不可交易狀態。

### Demo D：Admin CRUD 觸發 Home 更新

1. 開 `/`。
2. 開 `/manage/trading-pairs`。
3. 輸入 admin token。
4. Create / enable / disable / reorder / delete trading pair。
5. 回 `/`，觀察 public trading-pair selector/list 透過 `callUpdate` 更新。

---

## 重要設計選擇

- Admin 頁不參與 realtime leader election。
- Home 是 public realtime demo surface。
- Trading-pair CRUD 不直接修改 Home state。
- Backend commit 成功後 emit `callUpdate`。
- Frontend 依照 `callUpdate.resource` 對應要更新的 query。
- Leader refresh 後 publish snapshot。
- Follower apply snapshot。
- Jitter / coordinator 避免所有分頁同時 refetch。
- Admin token 只存在 memory，不持久化。
- `BroadcastChannel` 不廣播高頻 K 線 tick，只傳 coordination/control message。
- K 線 history 與 realtime tick 分線處理。
- Realtime owner handoff 後會 reload history，再 resubscribe realtime。

---

## 與 backend 的 protocol 對應

Backend repo 負責：

- `/quote` high-frequency kline data plane
- `/` low-frequency `callUpdate` control signal
- REST K 線 history API
- Binance ingestion
- closed K 線 upsert DB
- Admin CRUD transaction + audit
- DB commit 後 emit `callUpdate`

Frontend repo 負責：

- realtime owner coordination
- quote socket ownership
- K 線 history/realtime 接合
- server state cache
- control snapshot coherence
- refetch storm 防線

這兩個 repo 合起來展示的是一條完整事件鏈：

```txt
Backend market data / admin mutation
→ socket signal / REST history
→ frontend ownership coordinator
→ query/cache/chart update
→ multi-tab coherence
```

---

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

---

## Public Documentation

可公開的 backend/frontend contract notes 放在：

```txt
docs/backend-contracts.md
```

Private handoff、rehearsal notes、presentation drafts 放在 `.claude/`，並且刻意被 Git ignore。

---

## 適合延伸的 production policy

目前 demo 可用單一 realtime owner 展示治理概念。

實務上可由後端 system policy 控制：

```ts
interface RealtimePolicy {
  maxRealtimeOwners: number;
  reclaimMode: 'manual' | 'auto';
  backgroundMode: 'keep' | 'release-on-hidden';
}
```

依照 userId、sessionId、anonymous deviceId、device type、paid plan、product mode 決定：

```txt
mobile retail user       → maxRealtimeOwners = 1
desktop user             → maxRealtimeOwners = 3 ~ 5
professional trader      → maxRealtimeOwners = 10
```

重點不是永遠鎖死一個 socket，而是讓 realtime ownership 變成可治理的產品能力。

---

## 一句話總結

前端架構的價值，不只是讓畫面即時更新。

而是知道：

- 哪些資料需要 realtime
- 哪些分頁有資格 realtime
- 哪些更新應該被取消
- 哪些 refetch 應該被削峰
- 哪些資料不能因為方便而變成二手來源

這不是 UI 問題。

這是產品規模化後一定會遇到的 realtime governance 問題。
