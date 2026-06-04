import { onScopeDispose, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  DataLoader,
  DataLoaderGetBarsParams,
  DataLoaderSubscribeBarParams,
  DataLoaderUnsubscribeBarParams,
  KLineData
} from 'klinecharts';
import { getKlines, type Kline, type KlinesQuery } from '@/service/api/klines';
import { mapKlineRowsAscending, periodToBinanceInterval, tickToKLineData } from '@/service/kline/adapter';
import type { KlineTick } from '@/service/socket/quote';
import { useQuoteSocketStore } from '@/stores/quote-socket';

/** D-B：history limit；hasMore 判定也用此值（rows.length === limit）。 */
const DEFAULT_LIMIT = 500;

/** realtime 來源抽象（IoC）：正式由 quote-socket store 提供，測試可注入 fake。 */
export interface KlineFeedQuoteSource {
  latestTick: Ref<KlineTick | null>;
  subscribe(symbol: string, interval: string): void;
  unsubscribe(): void;
}

export interface KlineFeedDeps {
  /** 歷史 K 線來源；正式為 `getKlines()`（走 request.ts / error.ts，**不准 raw fetch**）。 */
  fetchKlines: (query: KlinesQuery, signal?: AbortSignal) => Promise<Kline[]>;
  quote: KlineFeedQuoteSource;
  limit?: number;
}

export interface KlineFeed {
  dataLoader: DataLoader;
  /** 釋放 latestTick watch；component unmount / scope dispose 時呼叫。 */
  dispose(): void;
}

interface ActiveSubscription {
  token: symbol;
  ticker: string;
  interval: string;
  callback: (data: KLineData) => void;
}

/**
 * klinecharts `DataLoader` 工廠（純 IoC，無 Vue component 依賴）。
 * - getBars 走注入的 `fetchKlines`（history）；backward / update 無資料。
 * - subscribeBar 接 quote source 的 realtime tick，以 stale token + symbol/interval 比對防舊 tick 寫入新圖。
 * - 任何 history 失敗都以 `callback([], false)` 收斂，不讓 promise rejection 噴給 klinecharts。
 */
export function createKlineFeed(deps: KlineFeedDeps): KlineFeed {
  const { fetchKlines, quote } = deps;
  const limit = deps.limit ?? DEFAULT_LIMIT;

  let active: ActiveSubscription | null = null;
  let activeToken: symbol | null = null;

  async function getBars(params: DataLoaderGetBarsParams): Promise<void> {
    const { type, timestamp, symbol, period, callback } = params;
    // D-G：update 不主動處理（realtime 只走 subscribeBar）；backward demo 不支援。
    if (type === 'backward' || type === 'update') {
      callback([], false);
      return;
    }
    let interval: string;
    try {
      interval = periodToBinanceInterval(period);
    } catch {
      // 非 1m：不打 REST，直接無資料（UI 層也不應提供此選項）。
      callback([], false);
      return;
    }
    const query: KlinesQuery = { symbol: symbol.ticker, interval, limit };
    // init 不帶 endTime；forward 用 timestamp（往更舊）。
    if (type === 'forward' && timestamp !== null) {
      query.endTime = timestamp;
    }
    try {
      const rows = await fetchKlines(query);
      // backend 回 open_time DESC → 轉 ascending 才符合 klinecharts。
      callback(mapKlineRowsAscending(rows), { forward: rows.length === limit });
    } catch {
      // AppError / unknown 一律收斂；chart 不處理 rejection。
      callback([], false);
    }
  }

  function subscribeBar(params: DataLoaderSubscribeBarParams): void {
    const { symbol, period, callback } = params;
    let interval: string;
    try {
      interval = periodToBinanceInterval(period);
    } catch {
      return; // 非 1m：不訂閱 realtime。
    }
    const token = Symbol('kline-sub');
    activeToken = token;
    active = { token, ticker: symbol.ticker, interval, callback };
    quote.subscribe(symbol.ticker, interval);
  }

  function unsubscribeBar(params: DataLoaderUnsubscribeBarParams): void {
    let interval: string;
    try {
      interval = periodToBinanceInterval(params.period);
    } catch {
      return; // 非 1m：no-op。
    }
    // 只取消「當前 active 正好是此 symbol/interval」的訂閱；否則 no-op。
    // 切換時晚到的舊 unsubscribe 不得清掉新 subscription（race guard）。
    if (active === null || active.ticker !== params.symbol.ticker || active.interval !== interval) {
      return;
    }
    // 換 token 讓既有訂閱立即失效（防在途舊 tick）。
    activeToken = Symbol('kline-unsub');
    active = null;
    quote.unsubscribe();
  }

  const stopWatch = watch(
    quote.latestTick,
    tick => {
      if (tick === null) return;
      const sub = active;
      if (sub === null || sub.token !== activeToken) return; // stale token / 已 unsubscribe
      if (tick.symbol !== sub.ticker || tick.interval !== sub.interval) return; // symbol / interval 不匹配
      sub.callback(tickToKLineData(tick));
    },
    { flush: 'sync' }
  );

  function dispose(): void {
    stopWatch();
    active = null;
    activeToken = null;
  }

  return {
    dataLoader: { getBars, subscribeBar, unsubscribeBar },
    dispose
  };
}

/**
 * 薄綁定：接真 quote-socket store + `getKlines()`。
 * follower 無 socket → latestTick 恆 null → realtime 不更新（follower limitation，於 component 層呈現，**不**用 BroadcastChannel 補）。
 */
export function useKlineFeed(): KlineFeed {
  const quoteStore = useQuoteSocketStore();
  const { latestTick } = storeToRefs(quoteStore);
  const feed = createKlineFeed({
    fetchKlines: (query, signal) => getKlines(query, signal),
    quote: {
      latestTick,
      subscribe: (symbol, interval) => quoteStore.subscribe(symbol, interval),
      unsubscribe: () => quoteStore.unsubscribe()
    }
  });
  onScopeDispose(feed.dispose);
  return feed;
}
