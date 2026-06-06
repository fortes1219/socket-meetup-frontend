import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, type Ref } from 'vue';
import type { SymbolInfo } from 'klinecharts';
import type { AppError } from '@/service/error';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

const useCoordinationBootstrapMock = vi.hoisted(() => vi.fn());
vi.mock('@/views/home/composables/useCoordinationBootstrap', () => ({
  useCoordinationBootstrap: useCoordinationBootstrapMock
}));

// Home 唯一來源：mock useSelectedSymbol（含 query state + selection）。
vi.mock('@/views/home/composables/useSelectedSymbol', async () => {
  const { ref } = await import('vue');
  const state = {
    pairs: ref<PublicTradingPair[]>([]),
    isPending: ref(false),
    isError: ref(false),
    error: ref<AppError | null>(null),
    selectedSymbol: ref<string | null>(null),
    selectedSymbolInfo: ref<SymbolInfo | null>(null),
    selectSymbol: vi.fn()
  };
  return { useSelectedSymbol: () => state };
});

import Home from '@/views/home/Home.vue';
import KlineChart from '@/views/home/components/KlineChart.vue';
import SymbolSelector from '@/views/home/components/SymbolSelector.vue';
import { useSelectedSymbol } from '@/views/home/composables/useSelectedSymbol';

interface MockState {
  pairs: Ref<PublicTradingPair[]>;
  isPending: Ref<boolean>;
  isError: Ref<boolean>;
  error: Ref<AppError | null>;
  selectedSymbol: Ref<string | null>;
  selectedSymbolInfo: Ref<SymbolInfo | null>;
  selectSymbol: ReturnType<typeof vi.fn>;
}
const state = useSelectedSymbol() as unknown as MockState;

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
  SymbolSelector: true,
  KlineChart: true,
  ControlDebugPanel: true
};

function mountHome() {
  return mount(Home, { global: { stubs: STUBS } });
}

function reset() {
  useCoordinationBootstrapMock.mockClear();
  state.pairs.value = [];
  state.isPending.value = false;
  state.isError.value = false;
  state.error.value = null;
  state.selectedSymbol.value = null;
  state.selectedSymbolInfo.value = null;
}

function pair(symbol: string, order: number): PublicTradingPair {
  return { symbol, base_asset: symbol.replace('USDT', ''), quote_asset: 'USDT', display_order: order };
}

describe('Home trading-pairs 四態', () => {
  it('mount 時啟動 realtime coordination bootstrap', async () => {
    reset();
    mountHome();
    await nextTick();
    expect(useCoordinationBootstrapMock).toHaveBeenCalledTimes(1);
  });

  it('loading', async () => {
    reset();
    state.isPending.value = true;
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="state-pending"]').exists()).toBe(true);
  });

  it('success-data', async () => {
    reset();
    state.pairs.value = [pair('BTCUSDT', 0)];
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="state-data"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('BTCUSDT');
  });

  it('success-empty', async () => {
    reset();
    state.pairs.value = [];
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

describe('Home chart 接入', () => {
  it('data + selectedSymbolInfo → 渲染 SymbolSelector + KlineChart，KlineChart 收到 symbol', async () => {
    reset();
    state.pairs.value = [pair('BTCUSDT', 0), pair('ETHUSDT', 1)];
    state.selectedSymbol.value = 'BTCUSDT';
    state.selectedSymbolInfo.value = { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 };
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="chart-precondition"]').exists()).toBe(false);
    const chart = wrapper.findComponent(KlineChart);
    expect(chart.exists()).toBe(true);
    expect(chart.props('symbol')).toEqual({ ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 });
  });

  it('SymbolSelector emit select → 呼叫 useSelectedSymbol().selectSymbol(symbol)', async () => {
    reset();
    state.pairs.value = [pair('BTCUSDT', 0), pair('ETHUSDT', 1)];
    state.selectedSymbol.value = 'BTCUSDT';
    state.selectedSymbolInfo.value = { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 };
    const wrapper = mountHome();
    await nextTick();
    wrapper.findComponent(SymbolSelector).vm.$emit('select', 'ETHUSDT');
    expect(state.selectSymbol).toHaveBeenCalledWith('ETHUSDT');
  });

  it('selectedSymbolInfo null（無可選 known symbol）→ 不渲染 chart，顯示 precondition', async () => {
    reset();
    state.pairs.value = [pair('XRPUSDT', 0)]; // 非 registry-known
    state.selectedSymbol.value = null;
    state.selectedSymbolInfo.value = null;
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="chart-precondition"]').exists()).toBe(true);
    expect(wrapper.findComponent(KlineChart).exists()).toBe(false);
  });

  it('pending → 不渲染 chart 也不顯示 precondition', async () => {
    reset();
    state.isPending.value = true;
    const wrapper = mountHome();
    await nextTick();
    expect(wrapper.find('[data-test="chart-precondition"]').exists()).toBe(false);
    expect(wrapper.findComponent(KlineChart).exists()).toBe(false);
  });
});
