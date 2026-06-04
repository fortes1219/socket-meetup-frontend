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

import KlineChart from '@/components/kline/KlineChart.vue';
import { useKlineChart } from '@/composables/useKlineChart';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const STUBS = {
  QCard: Passthrough,
  QCardSection: Passthrough,
  QBanner: Passthrough,
  QSeparator: Passthrough
};

const leaderStore = useLeaderCoordinatorStore() as unknown as { isLeader: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  leaderStore.isLeader = false;
});

describe('KlineChart.vue', () => {
  it('mount：init 一次，setSymbol(SHIBUSDT) / setPeriod(1m) / setDataLoader 各一次', async () => {
    mount(KlineChart, { global: { stubs: STUBS } });
    await nextTick();
    expect(h.init).toHaveBeenCalledTimes(1);
    expect(h.setSymbol).toHaveBeenCalledWith({ ticker: 'SHIBUSDT' });
    expect(h.setPeriod).toHaveBeenCalledWith({ type: 'minute', span: 1 });
    expect(h.setDataLoader).toHaveBeenCalledTimes(1);
    expect(h.setDataLoader).toHaveBeenCalledWith(DATA_LOADER);
  });

  it('傳 symbol="BTCUSDT" → 標題顯示 BTCUSDT · 1m，setSymbol({ticker:"BTCUSDT"})', async () => {
    const wrapper = mount(KlineChart, { props: { symbol: 'BTCUSDT' }, global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.text()).toContain('BTCUSDT · 1m');
    expect(h.setSymbol).toHaveBeenCalledWith({ ticker: 'BTCUSDT' });
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

// symbol fixed at mount for this slice：以下驗證 init 成功 / 失敗的 composable 狀態。
describe('useKlineChart 狀態（initialized / initError）', () => {
  const Harness = defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(null);
      const { initialized, initError } = useKlineChart(container, {
        symbol: 'SHIBUSDT',
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
