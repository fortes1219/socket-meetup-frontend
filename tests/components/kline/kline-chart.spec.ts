import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';

// klinecharts 需真 canvas（happy-dom 無）→ 整個模組 mock；真 render 由 ST-0 + runtime smoke 驗。
const h = vi.hoisted(() => {
  const setSymbol = vi.fn();
  const setPeriod = vi.fn();
  const setDataLoader = vi.fn();
  const chart = { setSymbol, setPeriod, setDataLoader };
  const init = vi.fn<(container: HTMLElement) => typeof chart | null>(() => chart);
  return { setSymbol, setPeriod, setDataLoader, chart, init, dispose: vi.fn() };
});
vi.mock('klinecharts', () => ({ init: h.init, dispose: h.dispose }));

// useKlineFeed mock：固定 dataLoader sentinel，避免拉真 quote store / REST。
const { DATA_LOADER } = vi.hoisted(() => ({
  DATA_LOADER: { getBars: () => {}, subscribeBar: () => {}, unsubscribeBar: () => {} }
}));
vi.mock('@/composables/useKlineFeed', () => ({
  useKlineFeed: () => ({ dataLoader: DATA_LOADER, dispose: () => {} })
}));

// leader store mock：可控 isLeader（reactive，免起真 leader election / pinia）。
vi.mock('@/stores/leader-coordinator', async () => {
  const { reactive } = await import('vue');
  const store = reactive({ isLeader: false });
  return { useLeaderCoordinatorStore: () => store };
});

import { createPinia, setActivePinia } from 'pinia';
import KlineChart from '@/components/kline/KlineChart.vue';
import { useKlineChart } from '@/composables/useKlineChart';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useQuoteSocketStore } from '@/stores/quote-socket';
import type { KlineTick } from '@/service/socket/quote';

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const STUBS = {
  QCard: Passthrough,
  QCardSection: Passthrough,
  QBanner: Passthrough,
  QSeparator: Passthrough
};

const leaderStore = useLeaderCoordinatorStore() as unknown as { isLeader: boolean };

function tick(overrides: Partial<KlineTick> = {}): KlineTick {
  return {
    symbol: 'SHIBUSDT',
    interval: '1m',
    openTime: 1700000000000,
    open: '0',
    high: '0',
    low: '0',
    close: '0',
    volume: '0',
    closed: false,
    ...overrides
  };
}

beforeEach(() => {
  setActivePinia(createPinia()); // 現價走真 quote-socket store；leader/feed 仍 mock。
  vi.clearAllMocks();
  leaderStore.isLeader = false;
});

describe('KlineChart.vue', () => {
  it('mount：init 一次，setSymbol(SHIBUSDT+precision) / setPeriod(1m) / setDataLoader 各一次', async () => {
    mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(h.init).toHaveBeenCalledTimes(1);
    // SHIBUSDT 必須帶 pricePrecision=8，否則小價格圖被壓平。
    expect(h.setSymbol).toHaveBeenCalledWith({ ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 });
    expect(h.setPeriod).toHaveBeenCalledWith({ type: 'minute', span: 1 });
    expect(h.setDataLoader).toHaveBeenCalledTimes(1);
    expect(h.setDataLoader).toHaveBeenCalledWith(DATA_LOADER);
  });

  it('傳完整 SymbolInfo（BTCUSDT）→ 標題與 setSymbol metadata 一致', async () => {
    const btc = { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 2 };
    const wrapper = mount(KlineChart, { props: { symbol: btc }, global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.text()).toContain('BTCUSDT · 1m');
    expect(h.setSymbol).toHaveBeenCalledWith(btc);
  });

  it('unmount：dispose chart 一次', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    wrapper.unmount();
    expect(h.dispose).toHaveBeenCalledTimes(1);
    expect(h.dispose).toHaveBeenCalledWith(h.chart);
  });

  it('chart container 存在', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.find('[data-test="kline-container"]').exists()).toBe(true);
  });

  it('follower（isLeader=false）→ 顯示 follower-hint', async () => {
    leaderStore.isLeader = false;
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.find('[data-test="follower-hint"]').exists()).toBe(true);
  });

  it('leader（isLeader=true）→ 不顯示 follower-hint', async () => {
    leaderStore.isLeader = true;
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.find('[data-test="follower-hint"]').exists()).toBe(false);
  });
});

describe('KlineChart.vue 現價（latestTick）', () => {
  it('default 無 tick → 現價 --', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 --');
  });

  it('latestTick SHIBUSDT/1m close=0.00000491 → 0.00000491（pricePrecision=8）', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    quote.latestTick = tick({ symbol: 'SHIBUSDT', interval: '1m', close: '0.00000491' });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 0.00000491');
  });

  it('latestTick symbol/interval 不匹配 → 仍顯示 --', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    quote.latestTick = tick({ symbol: 'BTCUSDT', interval: '1m', close: '123.45' });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 --');
    quote.latestTick = tick({ symbol: 'SHIBUSDT', interval: '5m', close: '0.00000491' });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 --');
  });

  it('BTCUSDT SymbolInfo pricePrecision=2 + close=123.456 → 123.46', async () => {
    const btc = { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 2 };
    const wrapper = mount(KlineChart, { props: { symbol: btc }, global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    quote.latestTick = tick({ symbol: 'BTCUSDT', interval: '1m', close: '123.456' });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 123.46');
  });
});

// symbol fixed at mount for this slice：以下驗證 init 成功 / 失敗的 composable 狀態。
describe('useKlineChart 狀態（initialized / initError）', () => {
  const Harness = defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(null);
      const { initialized, initError } = useKlineChart(container, {
        symbol: { ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 },
        feed: { dataLoader: DATA_LOADER, dispose: () => {} }
      });
      return { container, initialized, initError };
    },
    template: '<div ref="container"></div>'
  });

  it('init 成功 → initialized=true、initError=null、init 收到 container element', async () => {
    const wrapper = mount(Harness);
    await nextTick();
    expect(wrapper.vm.initialized).toBe(true);
    expect(wrapper.vm.initError).toBeNull();
    expect(h.init).toHaveBeenCalledTimes(1);
    expect(h.init.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('init 回 null → initialized=false、initError 帶錯，不 throw', async () => {
    h.init.mockReturnValueOnce(null);
    const wrapper = mount(Harness);
    await nextTick();
    expect(wrapper.vm.initialized).toBe(false);
    expect(wrapper.vm.initError).toBeInstanceOf(Error);
  });
});
