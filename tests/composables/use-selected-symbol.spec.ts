import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

// 唯一 query owner：mock 掉，由測試控制 pairs / pending / error。
vi.mock('@/queries/use-trading-pairs-query', async () => {
  const { ref } = await import('vue');
  const state = {
    data: ref<unknown>(undefined),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null)
  };
  return { useTradingPairsQuery: () => state };
});

import { useSelectedSymbol, type UseSelectedSymbol } from '@/composables/useSelectedSymbol';
import { useTradingPairsQuery } from '@/queries/use-trading-pairs-query';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

interface MockQuery {
  data: { value: PublicTradingPair[] | undefined };
  isPending: { value: boolean };
  isError: { value: boolean };
  error: { value: unknown };
}
const state = useTradingPairsQuery() as unknown as MockQuery;

function pair(symbol: string, displayOrder: number): PublicTradingPair {
  return { symbol, base_asset: symbol.replace('USDT', ''), quote_asset: 'USDT', display_order: displayOrder };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: defineComponent({ template: '<div />' }) }]
  });
}

let api: UseSelectedSymbol;
async function mountComposable(router: Router) {
  const Harness = defineComponent({
    setup() {
      api = useSelectedSymbol();
      return () => null;
    }
  });
  mount(Harness, { global: { plugins: [router] } });
  await flushPromises();
}

beforeEach(() => {
  state.data.value = undefined;
  state.isPending.value = false;
  state.isError.value = false;
  state.error.value = null;
});

describe('useSelectedSymbol', () => {
  it('lowercase URL → uppercase normalize（replace 一次，不 loop）', async () => {
    const router = makeRouter();
    await router.push('/?symbol=btcusdt');
    state.data.value = [pair('BTCUSDT', 0), pair('SHIBUSDT', 1)];
    const replaceSpy = vi.spyOn(router, 'replace');
    await mountComposable(router);
    expect(router.currentRoute.value.query.symbol).toBe('BTCUSDT');
    expect(replaceSpy).toHaveBeenCalledTimes(1); // 只 normalize 一次，後續 canonical 不再 replace
  });

  it('pending（data 未到）→ 不 replace URL', async () => {
    const router = makeRouter();
    await router.push('/?symbol=btcusdt');
    state.isPending.value = true;
    state.data.value = undefined;
    const replaceSpy = vi.spyOn(router, 'replace');
    await mountComposable(router);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.query.symbol).toBe('btcusdt'); // 未被改
  });

  it('URL 缺省 → normalize 成預設 BTCUSDT', async () => {
    const router = makeRouter();
    await router.push('/');
    state.data.value = [pair('BTCUSDT', 0), pair('SHIBUSDT', 1)];
    await mountComposable(router);
    expect(router.currentRoute.value.query.symbol).toBe('BTCUSDT');
    expect(api.selectedSymbol.value).toBe('BTCUSDT');
    expect(api.selectedSymbolInfo.value).toEqual({ ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 5 });
  });

  it('selectSymbol 用 push + uppercase（ethusdt → ETHUSDT）', async () => {
    const router = makeRouter();
    await router.push('/?symbol=BTCUSDT');
    state.data.value = [pair('BTCUSDT', 0), pair('ETHUSDT', 1)];
    await mountComposable(router);
    const pushSpy = vi.spyOn(router, 'push');
    api.selectSymbol('ethusdt');
    await flushPromises();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.query.symbol).toBe('ETHUSDT');
  });

  it('empty list → selectedSymbol/Info null、不 replace', async () => {
    const router = makeRouter();
    await router.push('/');
    state.data.value = [];
    const replaceSpy = vi.spyOn(router, 'replace');
    await mountComposable(router);
    expect(api.selectedSymbol.value).toBeNull();
    expect(api.selectedSymbolInfo.value).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('selectedPair 從最新 pairs 派生', async () => {
    const router = makeRouter();
    await router.push('/?symbol=ETHUSDT');
    state.data.value = [pair('BTCUSDT', 0), pair('ETHUSDT', 1)];
    await mountComposable(router);
    expect(api.selectedPair.value).toEqual(pair('ETHUSDT', 1));
  });
});
