import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStatusSocketStore } from '@/stores/status-socket';
import { createFakeSocket } from '../helpers/fake-socket';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('status-socket store', () => {
  it('合法 callUpdate 記錄 client-only state', () => {
    const store = useStatusSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);

    socket.fire('callUpdate', { resource: 'trading-pairs', timestamp: 1780000000000 });
    expect(store.lastCallUpdate).toEqual({ resource: 'trading-pairs', timestamp: 1780000000000 });
    expect(store.lastCallUpdateAt).toBe(1780000000000);
  });

  it('invalid callUpdate 不更新、不 throw、累計 invalidPayloadCount', () => {
    const store = useStatusSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);

    expect(() => socket.fire('callUpdate', { resource: 'other', timestamp: 1 })).not.toThrow();
    expect(store.lastCallUpdate).toBeNull();
    expect(store.invalidPayloadCount).toBe(1);
  });

  it('server 主動斷線亮 reconnectPromptPending 並記 reason', () => {
    const store = useStatusSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);
    socket.connect();
    socket.fire('connect');
    expect(store.connectionState).toBe('connected');

    socket.fire('disconnect', 'io server disconnect');
    expect(store.connectionState).toBe('disconnected');
    expect(store.lastDisconnectReason).toBe('io server disconnect');
    expect(store.reconnectPromptPending).toBe(true);
  });

  it('重複 bind 不重複註冊 listener', () => {
    const store = useStatusSocketStore();
    const socket = createFakeSocket();
    store.bind(socket);
    store.bind(socket);
    expect(socket.handlerCount('callUpdate')).toBe(1);
  });

  it('bind 時 socket 已 connected → connectionState 立即為 connected', () => {
    const store = useStatusSocketStore();
    const socket = createFakeSocket();
    socket.connect(); // bind 前已 connected
    store.bind(socket);
    expect(store.connectionState).toBe('connected');
  });
});
