import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@/service/request', () => ({
  request: (...args: unknown[]) => requestMock(...args)
}));

import {
  createTradingPair,
  deleteTradingPair,
  getAdminTradingPairs,
  patchTradingPair
} from '@/service/api/admin-trading-pairs';

const TOKEN = 'test-admin-token';
const validAdminPair = {
  id: '11111111-1111-1111-1111-111111111111',
  symbol: 'BTCUSDT',
  base_asset: 'BTC',
  quote_asset: 'USDT',
  enabled: false,
  display_order: 0,
  created_at: 1,
  updated_at: 2
};

beforeEach(() => {
  requestMock.mockReset();
});

describe('getAdminTradingPairs', () => {
  it('GET /admin/trading-pairs，帶 X-Admin-Token 與 include_disabled', async () => {
    requestMock.mockResolvedValue([validAdminPair]);
    const result = await getAdminTradingPairs(TOKEN);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/admin/trading-pairs',
        method: 'GET',
        headers: { 'X-Admin-Token': TOKEN },
        params: { include_disabled: true }
      })
    );
    expect(result).toEqual([validAdminPair]);
  });

  it('response 漂移 → contract_error', async () => {
    requestMock.mockResolvedValue([{ id: 'x' }]);
    await expect(getAdminTradingPairs(TOKEN)).rejects.toMatchObject({ code: 'contract_error' });
  });
});

describe('createTradingPair', () => {
  it('POST 帶 trim+upper body 與 token', async () => {
    requestMock.mockResolvedValue(validAdminPair);
    const result = await createTradingPair(TOKEN, ' ethusdt ');
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/admin/trading-pairs',
        method: 'POST',
        headers: { 'X-Admin-Token': TOKEN },
        data: { symbol: 'ETHUSDT' }
      })
    );
    expect(result).toEqual(validAdminPair);
  });

  it('symbol trim 後空 → 不打 request', async () => {
    await expect(createTradingPair(TOKEN, '   ')).rejects.toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
  });
});

describe('patchTradingPair', () => {
  it('PATCH /admin/trading-pairs/:id 帶 body 與 token', async () => {
    requestMock.mockResolvedValue({ ...validAdminPair, enabled: true });
    const result = await patchTradingPair(TOKEN, validAdminPair.id, { enabled: true });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/admin/trading-pairs/${validAdminPair.id}`,
        method: 'PATCH',
        headers: { 'X-Admin-Token': TOKEN },
        data: { enabled: true }
      })
    );
    expect(result.enabled).toBe(true);
  });

  it('display_order < 0 → 不打 request', async () => {
    await expect(patchTradingPair(TOKEN, validAdminPair.id, { display_order: -1 })).rejects.toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
  });
});

describe('deleteTradingPair', () => {
  it('DELETE /admin/trading-pairs/:id 帶 token，204 不 parse、回 void', async () => {
    requestMock.mockResolvedValue(undefined);
    await expect(deleteTradingPair(TOKEN, validAdminPair.id)).resolves.toBeUndefined();
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/admin/trading-pairs/${validAdminPair.id}`,
        method: 'DELETE',
        headers: { 'X-Admin-Token': TOKEN }
      })
    );
  });
});
