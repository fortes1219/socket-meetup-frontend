import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { Period, SymbolInfo } from 'klinecharts';
import { createKlineFeed, type KlineFeedQuoteSource } from '@/composables/useKlineFeed';
import type { Kline } from '@/service/api/klines';
import type { KlineTick } from '@/service/socket/quote';

const SYMBOL: SymbolInfo = { ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 };
const PERIOD_1M: Period = { type: 'minute', span: 1 };
const PERIOD_5M: Period = { type: 'minute', span: 5 };

function row(openTime: number, close: string): Kline {
  return {
    open_time: openTime,
    close_time: openTime + 59999,
    open: '1',
    high: '1',
    low: '1',
    close,
    volume: '1',
    trades_count: 1
  };
}

function tick(overrides: Partial<KlineTick> = {}): KlineTick {
  return {
    symbol: 'SHIBUSDT',
    interval: '1m',
    openTime: 1700000000000,
    open: '1',
    high: '1',
    low: '1',
    close: '2',
    volume: '1',
    closed: false,
    ...overrides
  };
}

function setup(fetchImpl?: () => Promise<Kline[]>) {
  const latestTick = ref<KlineTick | null>(null);
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  const fetchKlines = vi.fn(fetchImpl ?? (() => Promise.resolve([])));
  const quote: KlineFeedQuoteSource = { latestTick, subscribe, unsubscribe };
  const feed = createKlineFeed({ fetchKlines, quote });
  return { feed, fetchKlines, subscribe, unsubscribe, latestTick };
}

describe('createKlineFeed getBars', () => {
  it('init：symbol/interval=1m/limit=500、不帶 endTime', async () => {
    const { feed, fetchKlines } = setup();
    const callback = vi.fn();
    await feed.dataLoader.getBars({ type: 'init', timestamp: null, symbol: SYMBOL, period: PERIOD_1M, callback });
    expect(fetchKlines).toHaveBeenCalledWith({ symbol: 'SHIBUSDT', interval: '1m', limit: 500 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('forward：endTime = params.timestamp', async () => {
    const { feed, fetchKlines } = setup();
    const callback = vi.fn();
    await feed.dataLoader.getBars({
      type: 'forward',
      timestamp: 1699999000000,
      symbol: SYMBOL,
      period: PERIOD_1M,
      callback
    });
    expect(fetchKlines).toHaveBeenCalledWith({
      symbol: 'SHIBUSDT',
      interval: '1m',
      limit: 500,
      endTime: 1699999000000
    });
  });

  it('REST 回 DESC → callback ascending', async () => {
    const rows = [row(1700000120000, '3'), row(1700000060000, '2'), row(1700000000000, '1')];
    const { feed } = setup(() => Promise.resolve(rows));
    const callback = vi.fn();
    await feed.dataLoader.getBars({ type: 'init', timestamp: null, symbol: SYMBOL, period: PERIOD_1M, callback });
    const [bars] = callback.mock.calls[0];
    expect(bars.map((b: { timestamp: number }) => b.timestamp)).toEqual([1700000000000, 1700000060000, 1700000120000]);
  });

  it('hasMore = rows.length === 500', async () => {
    const exactly500 = Array.from({ length: 500 }, (_, i) => row(1700000000000 + i * 60000, '1'));
    const { feed } = setup(() => Promise.resolve(exactly500));
    const callback = vi.fn();
    await feed.dataLoader.getBars({ type: 'init', timestamp: null, symbol: SYMBOL, period: PERIOD_1M, callback });
    expect(callback.mock.calls[0][1]).toEqual({ forward: true });
  });

  it('rows < 500 → forward:false', async () => {
    const { feed } = setup(() => Promise.resolve([row(1700000000000, '1')]));
    const callback = vi.fn();
    await feed.dataLoader.getBars({ type: 'init', timestamp: null, symbol: SYMBOL, period: PERIOD_1M, callback });
    expect(callback.mock.calls[0][1]).toEqual({ forward: false });
  });

  it('backward → callback([], false)，不打 REST', async () => {
    const { feed, fetchKlines } = setup();
    const callback = vi.fn();
    await feed.dataLoader.getBars({
      type: 'backward',
      timestamp: 1700000000000,
      symbol: SYMBOL,
      period: PERIOD_1M,
      callback
    });
    expect(callback).toHaveBeenCalledWith([], false);
    expect(fetchKlines).not.toHaveBeenCalled();
  });

  it('update → callback([], false)，不打 REST', async () => {
    const { feed, fetchKlines } = setup();
    const callback = vi.fn();
    await feed.dataLoader.getBars({
      type: 'update',
      timestamp: 1700000000000,
      symbol: SYMBOL,
      period: PERIOD_1M,
      callback
    });
    expect(callback).toHaveBeenCalledWith([], false);
    expect(fetchKlines).not.toHaveBeenCalled();
  });

  it('非 1m period → callback([], false)，不打 REST', async () => {
    const { feed, fetchKlines } = setup();
    const callback = vi.fn();
    await feed.dataLoader.getBars({ type: 'init', timestamp: null, symbol: SYMBOL, period: PERIOD_5M, callback });
    expect(callback).toHaveBeenCalledWith([], false);
    expect(fetchKlines).not.toHaveBeenCalled();
  });

  it('getKlines throw → callback([], false)，rejection 不外漏', async () => {
    const { feed } = setup(() => Promise.reject(new Error('boom')));
    const callback = vi.fn();
    await expect(
      feed.dataLoader.getBars({ type: 'init', timestamp: null, symbol: SYMBOL, period: PERIOD_1M, callback })
    ).resolves.toBeUndefined();
    expect(callback).toHaveBeenCalledWith([], false);
  });
});

describe('createKlineFeed subscribeBar / unsubscribeBar', () => {
  it('valid tick → quote.subscribe(symbol, 1m) + callback(KLineData)', () => {
    const { feed, subscribe, latestTick } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback });
    expect(subscribe).toHaveBeenCalledWith('SHIBUSDT', '1m');
    latestTick.value = tick({ close: '0.001' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toMatchObject({ timestamp: 1700000000000, close: 0.001 });
  });

  it('非 1m period → 不訂閱、不 callback', () => {
    const { feed, subscribe, latestTick } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_5M, callback });
    expect(subscribe).not.toHaveBeenCalled();
    latestTick.value = tick();
    expect(callback).not.toHaveBeenCalled();
  });

  it('symbol 不匹配 → 不 callback', () => {
    const { feed, latestTick } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback });
    latestTick.value = tick({ symbol: 'BTCUSDT' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('interval 不匹配 → 不 callback', () => {
    const { feed, latestTick } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback });
    latestTick.value = tick({ interval: '5m' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('stale token：切到新 symbol 後舊 symbol tick 不寫入', () => {
    const { feed, latestTick } = setup();
    const shibCb = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback: shibCb });
    const btcCb = vi.fn();
    feed.dataLoader.subscribeBar!({
      symbol: { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 2 },
      period: PERIOD_1M,
      callback: btcCb
    });
    // 舊 SHIB tick 到達：當前訂閱已是 BTC → 兩個 callback 都不該收
    latestTick.value = tick({ symbol: 'SHIBUSDT' });
    expect(shibCb).not.toHaveBeenCalled();
    expect(btcCb).not.toHaveBeenCalled();
  });

  it('unsubscribe 後不 callback，並呼叫 quote.unsubscribe()', () => {
    const { feed, unsubscribe, latestTick } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback });
    feed.dataLoader.unsubscribeBar!({ symbol: SYMBOL, period: PERIOD_1M });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    latestTick.value = tick();
    expect(callback).not.toHaveBeenCalled();
  });

  it('unsubscribe 非當前 active 的 symbol → no-op（race guard）', () => {
    const { feed, unsubscribe, latestTick } = setup();
    const BTC: SymbolInfo = { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 2 };
    const shibCb = vi.fn();
    const btcCb = vi.fn();
    // 切換：subscribe SHIB → subscribe BTC（新 active）→ 舊 unsubscribe SHIB 晚到
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback: shibCb });
    feed.dataLoader.subscribeBar!({ symbol: BTC, period: PERIOD_1M, callback: btcCb });
    feed.dataLoader.unsubscribeBar!({ symbol: SYMBOL, period: PERIOD_1M });
    // 不得取消新 BTC 訂閱
    expect(unsubscribe).not.toHaveBeenCalled();
    latestTick.value = tick({ symbol: 'BTCUSDT' });
    expect(btcCb).toHaveBeenCalledTimes(1);
    latestTick.value = tick({ symbol: 'SHIBUSDT' });
    expect(shibCb).not.toHaveBeenCalled();
  });

  it('unsubscribe unsupported period → no-op，不 throw、不 quote.unsubscribe', () => {
    const { feed, unsubscribe } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback });
    expect(() => feed.dataLoader.unsubscribeBar!({ symbol: SYMBOL, period: PERIOD_5M })).not.toThrow();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('dispose 後 watch 停止，tick 不再 callback', () => {
    const { feed, latestTick } = setup();
    const callback = vi.fn();
    feed.dataLoader.subscribeBar!({ symbol: SYMBOL, period: PERIOD_1M, callback });
    feed.dispose();
    latestTick.value = tick();
    expect(callback).not.toHaveBeenCalled();
  });
});
