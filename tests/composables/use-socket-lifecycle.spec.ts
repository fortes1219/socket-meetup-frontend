import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, ref } from 'vue';
import type { SocketHub } from '@/service/socket/manager';
import { useSocketLifecycle, type BindableSocketStore } from '@/composables/useSocketLifecycle';
import { useQuoteSocketStore } from '@/stores/quote-socket';
import { useStatusSocketStore } from '@/stores/status-socket';
import { createFakeSocket, type FakeSocket } from '../helpers/fake-socket';

function fakeHub(root: FakeSocket, quote: FakeSocket) {
  let hasManager = false;
  const hub: SocketHub = {
    connect: vi.fn(() => {
      hasManager = true;
    }),
    disconnect: vi.fn(() => {
      hasManager = false;
    }),
    get rootSocket() {
      return hasManager ? root : null;
    },
    get quoteSocket() {
      return hasManager ? quote : null;
    },
    hasManager: () => hasManager
  };
  return hub;
}

let quoteStore: BindableSocketStore;
let statusStore: BindableSocketStore;

beforeEach(() => {
  quoteStore = { bind: vi.fn(), unbind: vi.fn() };
  statusStore = { bind: vi.fn(), unbind: vi.fn() };
});

describe('useSocketLifecycle', () => {
  it('follower（isLeader=false）不 connect、不開 socket', async () => {
    const root = createFakeSocket();
    const quote = createFakeSocket();
    const hub = fakeHub(root, quote);
    const isLeader = ref(false);
    const scope = effectScope();
    scope.run(() => useSocketLifecycle({ isLeader, hub, quoteStore, statusStore }));

    await nextTick();
    expect(hub.connect).not.toHaveBeenCalled();
    expect(quoteStore.bind).not.toHaveBeenCalled();
    scope.stop();
  });

  it('isLeader → connect 並 bind 兩 store；!isLeader → unbind 後 disconnect', async () => {
    const root = createFakeSocket();
    const quote = createFakeSocket();
    const hub = fakeHub(root, quote);
    const isLeader = ref(false);
    const scope = effectScope();
    scope.run(() => useSocketLifecycle({ isLeader, hub, quoteStore, statusStore }));

    isLeader.value = true;
    await nextTick();
    expect(hub.connect).toHaveBeenCalledTimes(1);
    expect(quoteStore.bind).toHaveBeenCalledWith(quote);
    expect(statusStore.bind).toHaveBeenCalledWith(root);

    isLeader.value = false;
    await nextTick();
    expect(quoteStore.unbind).toHaveBeenCalled();
    expect(statusStore.unbind).toHaveBeenCalled();
    expect(hub.disconnect).toHaveBeenCalled();

    scope.stop();
  });

  it('leadership flap：每次成為 leader 各 connect 一次', async () => {
    const root = createFakeSocket();
    const quote = createFakeSocket();
    const hub = fakeHub(root, quote);
    const isLeader = ref(false);
    const scope = effectScope();
    scope.run(() => useSocketLifecycle({ isLeader, hub, quoteStore, statusStore }));

    isLeader.value = true;
    await nextTick();
    isLeader.value = false;
    await nextTick();
    isLeader.value = true;
    await nextTick();

    expect(hub.connect).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('integration：hub.connect 同步 connected 時，真 store 立即 connected；handleConnect 不 auto-emit，resubscribe 才送', async () => {
    setActivePinia(createPinia());
    const root = createFakeSocket();
    const quote = createFakeSocket();
    let hasManager = false;
    const hub: SocketHub = {
      connect: () => {
        hasManager = true;
        root.connect();
        quote.connect();
      },
      disconnect: () => {
        hasManager = false;
        root.disconnect();
        quote.disconnect();
      },
      get rootSocket() {
        return hasManager ? root : null;
      },
      get quoteSocket() {
        return hasManager ? quote : null;
      },
      hasManager: () => hasManager
    };
    const realQuoteStore = useQuoteSocketStore();
    const realStatusStore = useStatusSocketStore();
    realQuoteStore.subscribe('shibusdt', '1m');

    const isLeader = ref(false);
    const scope = effectScope();
    scope.run(() => useSocketLifecycle({ isLeader, hub, quoteStore: realQuoteStore, statusStore: realStatusStore }));

    isLeader.value = true;
    await nextTick();

    expect(realQuoteStore.connectionState).toBe('connected');
    expect(realStatusStore.connectionState).toBe('connected');
    expect(quote.emits).toHaveLength(0); // handleConnect 不再 auto-emit（re-emit 交給 KlineChart resubscribe / resetData）
    realQuoteStore.resubscribe();
    expect(quote.emits).toEqual([{ event: 'subscribe', payload: { symbol: 'SHIBUSDT', interval: '1m' } }]);
    scope.stop();
  });
});
