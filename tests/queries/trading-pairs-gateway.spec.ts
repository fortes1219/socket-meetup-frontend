import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicTradingPairsMock = vi.fn();
vi.mock('@/service/api/trading-pairs', () => ({
  getPublicTradingPairs: () => getPublicTradingPairsMock()
}));

import { QueryClient } from '@tanstack/vue-query';
import { createTradingPairsGateway } from '@/queries/trading-pairs-gateway';
import { tradingPairKeys } from '@/queries/keys';

const DATA = [{ symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 }];

let queryClient: QueryClient;

beforeEach(() => {
  getPublicTradingPairsMock.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
});

describe('createTradingPairsGateway', () => {
  it('fetchTradingPairs 走 fetchQuery + getPublicTradingPairs 並寫入 cache', async () => {
    getPublicTradingPairsMock.mockResolvedValue(DATA);
    const gateway = createTradingPairsGateway(queryClient);

    const result = await gateway.fetchTradingPairs();

    expect(getPublicTradingPairsMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(DATA);
    expect(queryClient.getQueryData(tradingPairKeys.public())).toEqual(DATA);
  });

  it('setTradingPairs / getTradingPairs 對應 query key', () => {
    const gateway = createTradingPairsGateway(queryClient);
    expect(gateway.getTradingPairs()).toBeUndefined();
    gateway.setTradingPairs(DATA);
    expect(gateway.getTradingPairs()).toEqual(DATA);
    expect(getPublicTradingPairsMock).not.toHaveBeenCalled();
  });
});
