import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';

const getPublicTradingPairsMock = vi.fn();
vi.mock('@/service/api/trading-pairs', () => ({
  getPublicTradingPairs: () => getPublicTradingPairsMock()
}));

import { useTradingPairsQuery } from '@/queries/use-trading-pairs-query';

const validPair = { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 };

beforeEach(() => {
  getPublicTradingPairsMock.mockReset();
});

describe('tradingPairKeys', () => {
  it('public() 穩定且帶 namespace', () => {
    expect(tradingPairKeys.public()).toEqual(['trading-pairs', 'public']);
  });
});

describe('useTradingPairsQuery', () => {
  it('掛 VueQueryPlugin 後吐出 query 資料', async () => {
    getPublicTradingPairsMock.mockResolvedValue([validPair]);

    const Probe = defineComponent({
      setup() {
        const query = useTradingPairsQuery();
        return () => h('div', JSON.stringify(query.data.value ?? null));
      }
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = mount(Probe, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] }
    });

    await vi.waitFor(() => {
      expect(getPublicTradingPairsMock).toHaveBeenCalled();
      expect(wrapper.text()).toContain('BTCUSDT');
    });
  });
});
