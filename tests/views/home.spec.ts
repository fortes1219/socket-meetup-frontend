import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, type Ref } from 'vue';
import type { AppError } from '@/service/error';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

vi.mock('@/queries/use-trading-pairs-query', async () => {
  const { ref } = await import('vue');
  const state = {
    data: ref<PublicTradingPair[] | undefined>(undefined),
    isPending: ref(false),
    isError: ref(false),
    error: ref<AppError | null>(null)
  };
  return { useTradingPairsQuery: () => state };
});

import Home from '@/views/Home.vue';
import { useTradingPairsQuery } from '@/queries/use-trading-pairs-query';

interface MockState {
  data: Ref<PublicTradingPair[] | undefined>;
  isPending: Ref<boolean>;
  isError: Ref<boolean>;
  error: Ref<AppError | null>;
}

const state = useTradingPairsQuery() as unknown as MockState;

// Quasar chrome 在單元測試以 slot-passthrough stub 取代，避免註冊整套 Quasar 與 ResizeObserver 依賴。
const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const STUBS = {
  QLayout: Passthrough,
  QHeader: Passthrough,
  QToolbar: Passthrough,
  QToolbarTitle: Passthrough,
  QIcon: Passthrough,
  QChip: Passthrough,
  QPageContainer: Passthrough,
  QPage: Passthrough,
  QCard: Passthrough,
  QCardSection: Passthrough,
  QSeparator: Passthrough,
  QSpinner: Passthrough,
  QList: Passthrough,
  QItem: Passthrough,
  QItemSection: Passthrough,
  // KlineChart 有自己的 store / chart 依賴與測試；Home 四態 smoke 不需深掛載它。
  KlineChart: true
};

function mountHome() {
  return mount(Home, { global: { stubs: STUBS } });
}

function reset() {
  state.data.value = undefined;
  state.isPending.value = false;
  state.isError.value = false;
  state.error.value = null;
}

describe('Home trading-pairs 四態', () => {
  it('loading', async () => {
    reset();
    state.isPending.value = true;
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="state-pending"]').exists()).toBe(true);
  });

  it('success-data', async () => {
    reset();
    state.data.value = [{ symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 }];
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="state-data"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('BTCUSDT');
  });

  it('success-empty', async () => {
    reset();
    state.data.value = [];
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="state-empty"]').exists()).toBe(true);
  });

  it('error', async () => {
    reset();
    state.isError.value = true;
    state.error.value = { source: 'backend', code: 'internal_error', message: 'boom', status: 500 };
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="state-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('internal_error');
  });
});
