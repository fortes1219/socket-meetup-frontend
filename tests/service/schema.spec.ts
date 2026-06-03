import { describe, expect, it } from 'vitest';
import { ErrorBodySchema } from '@/service/schema/common';
import { PublicTradingPairSchema } from '@/service/schema/trading-pair';
import { KlineSchema, KlinesQuerySchema } from '@/service/schema/kline';

const validPair = { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 };
const validKline = {
  open_time: 1,
  close_time: 2,
  open: '1.0',
  high: '2.0',
  low: '0.5',
  close: '1.5',
  volume: '10',
  trades_count: 3
};

describe('PublicTradingPairSchema', () => {
  it('接受合法 payload', () => {
    expect(PublicTradingPairSchema.parse(validPair)).toEqual(validPair);
  });

  it('strict：未知欄位拋錯（contract drift 偵測）', () => {
    expect(() => PublicTradingPairSchema.parse({ ...validPair, extra: 1 })).toThrow();
  });
});

describe('KlineSchema', () => {
  it('接受合法 snake_case payload', () => {
    expect(KlineSchema.parse(validKline)).toEqual(validKline);
  });

  it('金額必須為 string，不接受 number', () => {
    expect(() => KlineSchema.parse({ ...validKline, open: 1 })).toThrow();
  });
});

describe('KlinesQuerySchema', () => {
  it('接受最小合法 query', () => {
    expect(KlinesQuerySchema.parse({ symbol: 'BTCUSDT', interval: '1m' })).toEqual({
      symbol: 'BTCUSDT',
      interval: '1m'
    });
  });

  it('symbol 不可為空字串', () => {
    expect(() => KlinesQuerySchema.parse({ symbol: '', interval: '1m' })).toThrow();
  });

  it('endTime 必須為 integer', () => {
    expect(() => KlinesQuerySchema.parse({ symbol: 'BTCUSDT', interval: '1m', endTime: 1.5 })).toThrow();
  });

  it('不發明 backend 沒承諾的 max limit（大 limit 仍通過）', () => {
    const parsed = KlinesQuerySchema.parse({ symbol: 'BTCUSDT', interval: '1m', limit: 100000 });
    expect(parsed.limit).toBe(100000);
  });
});

describe('ErrorBodySchema', () => {
  it('接受合法 error code', () => {
    expect(ErrorBodySchema.parse({ error: 'conflict', message: 'x' })).toEqual({
      error: 'conflict',
      message: 'x'
    });
  });

  it('拒絕非 enum code', () => {
    expect(() => ErrorBodySchema.parse({ error: 'nope', message: 'x' })).toThrow();
  });
});
