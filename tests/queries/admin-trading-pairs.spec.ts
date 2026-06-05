import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';

const getAdminTradingPairsMock = vi.fn();
const createTradingPairMock = vi.fn();
const patchTradingPairMock = vi.fn();
const deleteTradingPairMock = vi.fn();
vi.mock('@/service/api/admin-trading-pairs', () => ({
  getAdminTradingPairs: (...a: unknown[]) => getAdminTradingPairsMock(...a),
  createTradingPair: (...a: unknown[]) => createTradingPairMock(...a),
  patchTradingPair: (...a: unknown[]) => patchTradingPairMock(...a),
  deleteTradingPair: (...a: unknown[]) => deleteTradingPairMock(...a)
}));

import { useAdminTradingPairsQuery } from '@/queries/use-admin-trading-pairs-query';
import { useCreatePair } from '@/queries/use-admin-trading-pairs-mutations';
import { useAdminTokenStore } from '@/stores/admin-token';
import type { AppError } from '@/service/error';

const ADMIN_KEY = tradingPairKeys.admin({ include_disabled: true });
const PUBLIC_KEY = tradingPairKeys.public();

const validAdminPair = {
  id: '11111111-1111-1111-1111-111111111111',
  symbol: 'ETHUSDT',
  base_asset: 'ETH',
  quote_asset: 'USDT',
  enabled: false,
  display_order: 0,
  created_at: 1,
  updated_at: 2
};

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { pinia, queryClient };
}

function keyOfCall(call: unknown[]): unknown {
  return (call[0] as { queryKey?: unknown })?.queryKey;
}

beforeEach(() => {
  getAdminTradingPairsMock.mockReset();
  createTradingPairMock.mockReset();
  patchTradingPairMock.mockReset();
  deleteTradingPairMock.mockReset();
});

describe('tradingPairKeys.admin', () => {
  it('帶 namespace + include_disabled，token 不在 key', () => {
    expect(ADMIN_KEY).toEqual(['trading-pairs', 'admin', { include_disabled: true }]);
  });
});

describe('useAdminTradingPairsQuery（token gating）', () => {
  it('無 token → disabled，不 fire；setToken 後才 fetch', async () => {
    const { pinia, queryClient } = setup();
    getAdminTradingPairsMock.mockResolvedValue([validAdminPair]);
    const tokenStore = useAdminTokenStore();

    const Probe = defineComponent({
      setup() {
        useAdminTradingPairsQuery();
        return () => h('div');
      }
    });
    mount(Probe, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } });
    await flushPromises();
    expect(getAdminTradingPairsMock).not.toHaveBeenCalled(); // 無 token → disabled

    tokenStore.setToken('test-admin-token');
    await flushPromises();
    expect(getAdminTradingPairsMock).toHaveBeenCalledTimes(1); // token 後 fetch
  });
});

describe('admin mutation invalidation', () => {
  function mountCreate(queryClient: QueryClient, pinia: ReturnType<typeof createPinia>) {
    let api!: ReturnType<typeof useCreatePair>;
    const Probe = defineComponent({
      setup() {
        api = useCreatePair();
        return () => h('div');
      }
    });
    mount(Probe, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } });
    return () => api;
  }

  it('success → 只 invalidate admin key，不碰 public key', async () => {
    const { pinia, queryClient } = setup();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    createTradingPairMock.mockResolvedValue(validAdminPair);
    const getApi = mountCreate(queryClient, pinia);

    await getApi().mutation.mutateAsync('ETHUSDT');

    const keys = invalidateSpy.mock.calls.map(keyOfCall);
    expect(keys).toContainEqual(ADMIN_KEY);
    expect(keys).not.toContainEqual(PUBLIC_KEY); // success path 不碰 public
    expect(getApi().broadcastFailed.value).toBe(false);
  });

  it('committed_broadcast_failed → 不 retry，admin + public 都 invalidate，broadcastFailed=true', async () => {
    const { pinia, queryClient } = setup();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const error: AppError = {
      source: 'backend',
      code: 'committed_broadcast_failed',
      message: 'broadcast failed',
      status: 500
    };
    createTradingPairMock.mockRejectedValue(error);
    const getApi = mountCreate(queryClient, pinia);

    await getApi()
      .mutation.mutateAsync('ETHUSDT')
      .catch(() => {});

    expect(createTradingPairMock).toHaveBeenCalledTimes(1); // retry:false
    const keys = invalidateSpy.mock.calls.map(keyOfCall);
    expect(keys).toContainEqual(ADMIN_KEY);
    expect(keys).toContainEqual(PUBLIC_KEY); // 此情境 fallback invalidate public
    expect(getApi().broadcastFailed.value).toBe(true);
  });

  it('一般 backend error（conflict）→ 不 retry、不 invalidate、broadcastFailed=false', async () => {
    const { pinia, queryClient } = setup();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const error: AppError = { source: 'backend', code: 'conflict', message: 'exists', status: 409 };
    createTradingPairMock.mockRejectedValue(error);
    const getApi = mountCreate(queryClient, pinia);

    await getApi()
      .mutation.mutateAsync('ETHUSDT')
      .catch(() => {});

    expect(createTradingPairMock).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(getApi().broadcastFailed.value).toBe(false);
    expect(getApi().mutation.error.value?.code).toBe('conflict');
  });
});
