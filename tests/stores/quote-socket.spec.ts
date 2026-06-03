import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useQuoteSocketStore } from '@/stores/quote-socket';
import { createFakeSocket } from '../helpers/fake-socket';

const validKline = {
  symbol: 'BTCUSDT',
  interval: '1m',
  kline: {
    openTime: 1780131960000,
    open: '1',
    high: '2',
    low: '0.5',
    close: '1.5',
    volume: '10',
    closed: false
  }
};

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quote-socket store', () => {
  it('[必測1] 重複 bind 不重複註冊 listener，一筆 kline 只處理一次', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);
    store.bind(socket); // 第二次 no-op

    expect(socket.handlerCount('kline')).toBe(1);
    socket.fire('kline', { bad: true }); // invalid 便於計數
    expect(store.invalidPayloadCount).toBe(1); // 只 +1，未被處理兩次
  });

  it('[必測2] follower subscribe 不 emit；成為 leader/connected 後 re-emit 一次', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();

    store.subscribe('btcusdt', '1m'); // follower：未 bind
    expect(socket.emits).toHaveLength(0);
    expect(store.currentSubscription).toEqual({ symbol: 'BTCUSDT', interval: '1m', roomKey: 'BTCUSDT:1m' });

    store.bind(socket);
    socket.connect();
    socket.fire('connect'); // leader connected → re-subscribe
    expect(socket.emits).toEqual([{ event: 'subscribe', payload: { symbol: 'BTCUSDT', interval: '1m' } }]);
  });

  it('[必測3] unbind / leadership lost 後 connectionState 反映 disconnected，但保留 currentSubscription', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);
    socket.connect();
    socket.fire('connect');
    store.subscribe('ETHUSDT', '5m');
    expect(store.connectionState).toBe('connected');

    store.unbind();
    expect(store.connectionState).toBe('disconnected');
    expect(store.currentSubscription).toEqual({ symbol: 'ETHUSDT', interval: '5m', roomKey: 'ETHUSDT:5m' });
  });

  it('[必測4] invalid kline 不更新 latestTick、不 throw、累計 invalidPayloadCount，且不進 BroadcastChannel', () => {
    const broadcastSpy = vi.fn();
    vi.stubGlobal('BroadcastChannel', broadcastSpy);

    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);

    expect(() => socket.fire('kline', { symbol: 'BTCUSDT' })).not.toThrow();
    expect(store.latestTick).toBeNull();
    expect(store.invalidPayloadCount).toBe(1);

    socket.fire('kline', validKline);
    expect(store.latestTick?.openTime).toBe(1780131960000);

    expect(broadcastSpy).not.toHaveBeenCalled(); // kline tick 絕不進 BroadcastChannel
  });

  it('bind 時 socket 已 connected → 立即 handleConnect（re-emit subscribe + connected）', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.subscribe('shibusdt', '1m');
    socket.connect(); // bind 前已 connected

    store.bind(socket);

    expect(store.connectionState).toBe('connected');
    expect(socket.emits).toEqual([{ event: 'subscribe', payload: { symbol: 'SHIBUSDT', interval: '1m' } }]);
  });
});
