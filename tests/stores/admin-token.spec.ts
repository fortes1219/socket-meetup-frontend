import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAdminTokenStore } from '@/stores/admin-token';

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin-token store', () => {
  it('setToken / clearToken / hasToken', () => {
    const store = useAdminTokenStore();
    expect(store.hasToken).toBe(false);

    store.setToken('  abc  ');
    expect(store.token).toBe('abc'); // trim
    expect(store.hasToken).toBe(true);

    store.clearToken();
    expect(store.token).toBe('');
    expect(store.hasToken).toBe(false);
  });

  it('絕不寫入 localStorage / sessionStorage（in-memory only）', () => {
    const localSpy = vi.spyOn(Storage.prototype, 'setItem');
    const store = useAdminTokenStore();
    store.setToken('test-admin-token');
    store.clearToken();
    expect(localSpy).not.toHaveBeenCalled();
  });
});
