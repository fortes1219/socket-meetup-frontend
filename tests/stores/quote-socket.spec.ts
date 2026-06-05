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

  it('[必測2] follower subscribe 不 emit；connected 後 handleConnect 不自動 emit，resubscribe() 才 re-emit 一次', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();

    store.subscribe('btcusdt', '1m'); // follower：未 bind
    expect(socket.emits).toHaveLength(0);
    expect(store.currentSubscription).toEqual({ symbol: 'BTCUSDT', interval: '1m', roomKey: 'BTCUSDT:1m' });

    store.bind(socket);
    socket.connect();
    socket.fire('connect'); // handleConnect 只設 connected，**不** emit
    expect(socket.emits).toHaveLength(0);
    expect(store.connectionState).toBe('connected');

    store.resubscribe(); // KlineChart first-connect 補送
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

  it('bind 時 socket 已 connected → connectionState connected，但 handleConnect 不 emit', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.subscribe('shibusdt', '1m');
    socket.connect(); // bind 前已 connected

    store.bind(socket);

    expect(store.connectionState).toBe('connected');
    expect(socket.emits).toHaveLength(0); // handleConnect 不再 emit（re-emit 交給 resubscribe / resetData）
  });
});

describe('quote-socket resubscribe（刀2：first-connect re-emit 出口）', () => {
  it('currentSubscription null + connected → resubscribe no-op（不 emit）', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);
    socket.connect();
    socket.fire('connect');

    store.resubscribe();
    expect(socket.emits).toHaveLength(0);
  });

  it('currentSubscription exists + connected → resubscribe emit 一次', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.subscribe('ethusdt', '1m'); // follower 記 intent，未 emit
    expect(socket.emits).toHaveLength(0);

    store.bind(socket);
    socket.connect();
    socket.fire('connect'); // 不 auto-emit
    store.resubscribe(); // 補送一次
    expect(socket.emits).toEqual([{ event: 'subscribe', payload: { symbol: 'ETHUSDT', interval: '1m' } }]);
  });

  it('not connected → resubscribe no-op', () => {
    const store = useQuoteSocketStore();
    const socket = createFakeSocket();
    store.subscribe('ethusdt', '1m');
    store.bind(socket); // bound 但 socket 未 connect

    store.resubscribe();
    expect(socket.emits).toHaveLength(0);
  });
});
