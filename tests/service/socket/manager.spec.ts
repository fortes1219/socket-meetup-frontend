import { describe, expect, it, vi } from 'vitest';
import { createSocketHub } from '@/service/socket/manager';
import { createFakeManager } from '../../helpers/fake-socket';

describe('createSocketHub', () => {
  it('connect 只建一個 Manager，且 / 與 /quote 來自同一 Manager', () => {
    const fake = createFakeManager();
    const createManager = vi.fn(() => fake);
    const hub = createSocketHub({ createManager, origin: 'http://localhost' });

    hub.connect();

    expect(createManager).toHaveBeenCalledTimes(1);
    expect(fake.namespaces).toEqual(['/', '/quote']);
    expect(hub.rootSocket).toBe(fake.sockets.get('/'));
    expect(hub.quoteSocket).toBe(fake.sockets.get('/quote'));
    expect(hub.rootSocket?.connected).toBe(true);
    expect(hub.quoteSocket?.connected).toBe(true);
  });

  it('重複 connect 不會再建 Manager', () => {
    const createManager = vi.fn(() => createFakeManager());
    const hub = createSocketHub({ createManager, origin: 'http://localhost' });
    hub.connect();
    hub.connect();
    expect(createManager).toHaveBeenCalledTimes(1);
  });

  it('disconnect 關閉兩 socket 並丟棄 Manager（follower 無 TCP）', () => {
    const fake = createFakeManager();
    const hub = createSocketHub({ createManager: () => fake, origin: 'http://localhost' });
    hub.connect();
    const root = fake.sockets.get('/');
    const quote = fake.sockets.get('/quote');

    hub.disconnect();

    expect(root?.connected).toBe(false);
    expect(quote?.connected).toBe(false);
    expect(hub.hasManager()).toBe(false);
    expect(hub.rootSocket).toBeNull();
    expect(hub.quoteSocket).toBeNull();
  });

  it('沒有 connect 就不建立任何 Manager / socket', () => {
    const createManager = vi.fn(() => createFakeManager());
    const hub = createSocketHub({ createManager, origin: 'http://localhost' });
    expect(createManager).not.toHaveBeenCalled();
    expect(hub.hasManager()).toBe(false);
  });
});
