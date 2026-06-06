import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';

vi.mock('@/stores/leader-coordinator', async () => {
  const { reactive } = await import('vue');
  const store = reactive({ role: 'leader', isLeader: true, isSuspended: false });
  return { useLeaderCoordinatorStore: () => store };
});
vi.mock('@/stores/status-socket', async () => {
  const { reactive } = await import('vue');
  const store = reactive({
    lastCallUpdateNonce: 2,
    lastCallUpdate: { resource: 'trading-pairs' },
    lastCallUpdateAt: 1
  });
  return { useStatusSocketStore: () => store };
});
vi.mock('@/stores/control-coordinator', async () => {
  const { reactive } = await import('vue');
  const store = reactive({ controlSequence: 3, lastAppliedSequence: 3 });
  return { useControlCoordinatorStore: () => store };
});

// 讀 cache 不應呼叫 public query / api。若被呼叫即違反 read-only。
const getPublicTradingPairsMock = vi.fn();
vi.mock('@/service/api/trading-pairs', () => ({
  getPublicTradingPairs: (...a: unknown[]) => getPublicTradingPairsMock(...a)
}));
const useTradingPairsQueryMock = vi.fn();
vi.mock('@/queries/use-trading-pairs-query', () => ({
  useTradingPairsQuery: (...a: unknown[]) => useTradingPairsQueryMock(...a)
}));

import ControlDebugPanel from '@/views/home/components/ControlDebugPanel.vue';

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const STUBS = { QCard: Passthrough, QCardSection: Passthrough };

function mountPanel(queryClient: QueryClient) {
  return mount(ControlDebugPanel, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]], stubs: STUBS }
  });
}

describe('ControlDebugPanel（read-only，不建 query observer）', () => {
  it('mount 不呼叫 useTradingPairsQuery / getPublicTradingPairs', async () => {
    const queryClient = new QueryClient();
    mountPanel(queryClient);
    await nextTick();
    expect(useTradingPairsQueryMock).not.toHaveBeenCalled();
    expect(getPublicTradingPairsMock).not.toHaveBeenCalled();
  });

  it('顯示 store debug 欄位', async () => {
    const queryClient = new QueryClient();
    const wrapper = mountPanel(queryClient);
    await nextTick();
    expect(wrapper.find('[data-test="debug-role"]').text()).toContain('role: leader');
    expect(wrapper.find('[data-test="debug-nonce"]').text()).toContain('lastCallUpdateNonce: 2');
    expect(wrapper.find('[data-test="debug-resource"]').text()).toContain('received resource: trading-pairs');
    expect(wrapper.find('[data-test="debug-sequence"]').text()).toContain('controlSequence: 3');
  });

  it('cache 有 public key → 顯示 dataUpdatedAt（非 N/A）', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(tradingPairKeys.public(), []); // 填 cache，不經 observer/fetch
    const wrapper = mountPanel(queryClient);
    await nextTick();
    const text = wrapper.find('[data-test="debug-query"]').text();
    expect(text).toContain('public status: success');
    expect(text).not.toContain('dataUpdatedAt: N/A');
    expect(getPublicTradingPairsMock).not.toHaveBeenCalled();
  });

  it('cache 無 public key → 顯示 N/A', async () => {
    const queryClient = new QueryClient();
    const wrapper = mountPanel(queryClient);
    await nextTick();
    const text = wrapper.find('[data-test="debug-query"]').text();
    expect(text).toContain('public status: N/A');
    expect(text).toContain('dataUpdatedAt: N/A');
  });
});
