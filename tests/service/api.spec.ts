import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@/service/request', () => ({
  request: (...args: unknown[]) => requestMock(...args)
}));

import { getPublicTradingPairs } from '@/service/api/trading-pairs';
import { getKlines } from '@/service/api/klines';

const validPair = { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 };
const validKline = {
  open_time: 1,
  close_time: 2,
  open: '1',
  high: '2',
  low: '0.5',
  close: '1.5',
  volume: '10',
  trades_count: 3
};

beforeEach(() => {
  requestMock.mockReset();
});

describe('getPublicTradingPairs', () => {
  it('用對 url / method 並回傳 parse 後資料', async () => {
    requestMock.mockResolvedValue([validPair]);
    const result = await getPublicTradingPairs();
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/trading-pairs', method: 'GET' }));
    expect(result).toEqual([validPair]);
  });

  it('response 漂移時拋 contract_error', async () => {
    requestMock.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
    await expect(getPublicTradingPairs()).rejects.toMatchObject({
      source: 'contract',
      code: 'contract_error'
    });
  });

  it('透傳 signal', async () => {
    requestMock.mockResolvedValue([]);
    const controller = new AbortController();
    await getPublicTradingPairs(controller.signal);
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });
});

describe('getKlines', () => {
  it('request 前先 parse query：invalid query 不打 request', async () => {
    await expect(getKlines({ symbol: '', interval: '1m' })).rejects.toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('帶 parsed params 並回傳 parse 後資料', async () => {
    requestMock.mockResolvedValue([validKline]);
    const result = await getKlines({ symbol: 'BTCUSDT', interval: '1m', limit: 2 });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/klines',
        method: 'GET',
        params: { symbol: 'BTCUSDT', interval: '1m', limit: 2 }
      })
    );
    expect(result).toEqual([validKline]);
  });

  it('response 漂移時拋 contract_error', async () => {
    requestMock.mockResolvedValue([{ open_time: 1 }]);
    await expect(getKlines({ symbol: 'BTCUSDT', interval: '1m' })).rejects.toMatchObject({
      code: 'contract_error'
    });
  });
});
