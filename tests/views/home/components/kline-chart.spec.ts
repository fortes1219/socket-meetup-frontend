import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref, type Ref } from 'vue';

// klinecharts 需真 canvas（happy-dom 無）→ 整個模組 mock；真 render 由 ST-0 + runtime smoke 驗。
const h = vi.hoisted(() => {
  const setStyles = vi.fn();
  const setSymbol = vi.fn();
  const setPeriod = vi.fn();
  const setDataLoader = vi.fn();
  const resetData = vi.fn();
  const chart = { setStyles, setSymbol, setPeriod, setDataLoader, resetData };
  const init = vi.fn<(container: HTMLElement) => typeof chart | null>(() => chart);
  return { setStyles, setSymbol, setPeriod, setDataLoader, resetData, chart, init, dispose: vi.fn() };
});
vi.mock('klinecharts', () => ({ init: h.init, dispose: h.dispose }));

// useKlineFeed mock：固定 dataLoader sentinel，避免拉真 quote store / REST。
const { DATA_LOADER, HISTORY_CLOSE } = vi.hoisted(() => ({
  DATA_LOADER: { getBars: () => {}, subscribeBar: () => {}, unsubscribeBar: () => {} },
  HISTORY_CLOSE: { value: null as { symbol: string; interval: string; close: string } | null }
}));
vi.mock('@/composables/useKlineFeed', () => ({
  useKlineFeed: () => ({ dataLoader: DATA_LOADER, latestHistoryClose: HISTORY_CLOSE, dispose: () => {} })
}));

// leader store mock：可控 isLeader（reactive，免起真 leader election / pinia）。
vi.mock('@/stores/leader-coordinator', async () => {
  const { reactive } = await import('vue');
  const store = reactive({ isLeader: false, isSuspended: false, resumeLeadership: vi.fn() });
  return { useLeaderCoordinatorStore: () => store };
});

import { createPinia, setActivePinia } from 'pinia';
import type { SymbolInfo } from 'klinecharts';
import KlineChart from '@/views/home/components/KlineChart.vue';
import { useKlineChart } from '@/composables/useKlineChart';
import { KLINE_CHART_STYLES } from '@/service/kline/chart-styles';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useQuoteSocketStore } from '@/stores/quote-socket';
import type { KlineTick } from '@/service/socket/quote';

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot />{{ $attrs.label }}</button>'
});
const STUBS = {
  QCard: Passthrough,
  QCardSection: Passthrough,
  QBanner: Passthrough,
  QDialog: Passthrough,
  QCardActions: Passthrough,
  QBtn: ButtonStub,
  QSeparator: Passthrough
};

const leaderStore = useLeaderCoordinatorStore() as unknown as {
  isLeader: boolean;
  isSuspended: boolean;
  resumeLeadership: ReturnType<typeof vi.fn>;
};
const historyCloseRef = HISTORY_CLOSE as unknown as Ref<{ symbol: string; interval: string; close: string } | null>;

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
  HISTORY_CLOSE.value = null;
  leaderStore.isLeader = false;
  leaderStore.isSuspended = false;
  leaderStore.resumeLeadership.mockClear();
});

describe('KlineChart.vue', () => {
  it('mount：init 一次，setSymbol(預設 BTCUSDT registry precision) / setPeriod(1m) / setDataLoader 各一次', async () => {
    mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(h.init).toHaveBeenCalledTimes(1);
    expect(h.setStyles).toHaveBeenCalledWith(KLINE_CHART_STYLES);
    // 預設 symbol 由 registry 派生：BTCUSDT pricePrecision=2。
    expect(h.setSymbol).toHaveBeenCalledWith({ ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 });
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

  it('被動讓位 suspended → 顯示 reconnect prompt，點擊後 resumeLeadership', async () => {
    leaderStore.isLeader = false;
    leaderStore.isSuspended = true;
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();

    const inlineButton = wrapper.find('[data-test="resume-leader-inline"]');
    const dialogButton = wrapper.find('[data-test="resume-leader"]');
    expect(wrapper.text()).toContain('Realtime 已由其他視窗接手');
    expect(inlineButton.exists()).toBe(true);
    expect(dialogButton.exists()).toBe(true);

    await inlineButton.trigger('click');
    expect(leaderStore.resumeLeadership).toHaveBeenCalledTimes(1);
  });
});

describe('KlineChart.vue 現價（latestTick）', () => {
  it('default 無 tick → 現價 --', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 --');
  });

  it('無 realtime tick 時，以 history 最新 close 顯示現價 fallback', async () => {
    HISTORY_CLOSE.value = { symbol: 'BTCUSDT', interval: '1m', close: '63840.24' };
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 63840.24');
  });

  it('latestTick SHIBUSDT/1m close=0.00000491 → 0.00000491（pricePrecision=8）', async () => {
    const shib = { ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 };
    const wrapper = mount(KlineChart, { props: { symbol: shib }, global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    quote.latestTick = tick({ symbol: 'SHIBUSDT', interval: '1m', close: '0.00000491' });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 0.00000491');
  });

  it('realtime tick 優先於 history fallback', async () => {
    HISTORY_CLOSE.value = { symbol: 'BTCUSDT', interval: '1m', close: '63840.24' };
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    quote.latestTick = tick({ symbol: 'BTCUSDT', interval: '1m', close: '63841.99' });
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 63841.99');
  });

  it('latestTick symbol/interval 不匹配 → 仍顯示 --', async () => {
    const shib = { ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 };
    const wrapper = mount(KlineChart, { props: { symbol: shib }, global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    quote.latestTick = tick({ symbol: 'BTCUSDT', interval: '1m', close: '123.45' }); // symbol 不匹配
    await nextTick();
    expect(wrapper.find('[data-test="current-price"]').text()).toContain('現價 --');
    quote.latestTick = tick({ symbol: 'SHIBUSDT', interval: '5m', close: '0.00000491' }); // interval 不匹配
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

describe('useKlineChart reactive setSymbol（value-equality guard）', () => {
  function makeHarness(symbolRef: { value: SymbolInfo }) {
    return defineComponent({
      setup() {
        const container = ref<HTMLElement | null>(null);
        useKlineChart(container, {
          symbol: () => symbolRef.value,
          feed: { dataLoader: DATA_LOADER, latestHistoryClose: historyCloseRef, dispose: () => {} }
        });
        return { container };
      },
      template: '<div ref="container"></div>'
    });
  }

  it('同值不同 object reference → 不重複 setSymbol', async () => {
    const symbolRef = ref<SymbolInfo>({ ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 });
    mount(makeHarness(symbolRef));
    await nextTick();
    expect(h.setSymbol).toHaveBeenCalledTimes(1);
    symbolRef.value = { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 }; // 新 object、同值
    await nextTick();
    expect(h.setSymbol).toHaveBeenCalledTimes(1); // 不增加，不觸發 reset flow
  });

  it('值改變（ticker/precision）→ 再 setSymbol 一次（帶完整新 SymbolInfo）', async () => {
    const symbolRef = ref<SymbolInfo>({ ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 });
    mount(makeHarness(symbolRef));
    await nextTick();
    symbolRef.value = { ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 };
    await nextTick();
    expect(h.setSymbol).toHaveBeenCalledTimes(2);
    expect(h.setSymbol).toHaveBeenLastCalledWith({ ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 });
  });
});

describe('KlineChart.vue socket resume 狀態機', () => {
  it('首次 connected → resubscribe 一次，不 resetData', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    const resubscribeSpy = vi.spyOn(quote, 'resubscribe');

    quote.connectionState = 'connected';
    await nextTick();

    expect(resubscribeSpy).toHaveBeenCalledTimes(1);
    expect(h.resetData).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('connected → disconnected → connected（resume）→ resetData 一次', async () => {
    const wrapper = mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    const quote = useQuoteSocketStore();
    const resubscribeSpy = vi.spyOn(quote, 'resubscribe');

    quote.connectionState = 'connected';
    await nextTick();
    quote.connectionState = 'disconnected';
    await nextTick();
    quote.connectionState = 'connected';
    await nextTick();

    expect(resubscribeSpy).toHaveBeenCalledTimes(1);
    expect(h.resetData).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe('useKlineChart 狀態（initialized / initError）', () => {
  const Harness = defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(null);
      const { initialized, initError } = useKlineChart(container, {
        symbol: { ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 },
        feed: { dataLoader: DATA_LOADER, latestHistoryClose: historyCloseRef, dispose: () => {} }
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
