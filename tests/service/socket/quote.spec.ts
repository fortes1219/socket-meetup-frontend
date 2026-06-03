import { describe, expect, it } from 'vitest';
import { QuoteKlineEventSchema } from '@/service/schema/quote';
import { parseKlineTick } from '@/service/socket/quote';

const validEvent = {
  symbol: 'BTCUSDT',
  interval: '1m',
  kline: {
    openTime: 1780131960000,
    open: '73514.00000000',
    high: '73514.01000000',
    low: '73514.00000000',
    close: '73514.01000000',
    volume: '0.21389000',
    closed: false
  }
};

describe('QuoteKlineEventSchema', () => {
  it('接受合法 camelCase payload', () => {
    expect(QuoteKlineEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it('strict：nested kline 多未知欄拋錯', () => {
    expect(() => QuoteKlineEventSchema.parse({ ...validEvent, kline: { ...validEvent.kline, extra: 1 } })).toThrow();
  });

  it('金額必須為 string', () => {
    expect(() => QuoteKlineEventSchema.parse({ ...validEvent, kline: { ...validEvent.kline, open: 1 } })).toThrow();
  });
});

describe('parseKlineTick', () => {
  it('flatten 成 KlineTick', () => {
    expect(parseKlineTick(validEvent)).toEqual({
      symbol: 'BTCUSDT',
      interval: '1m',
      openTime: 1780131960000,
      open: '73514.00000000',
      high: '73514.01000000',
      low: '73514.00000000',
      close: '73514.01000000',
      volume: '0.21389000',
      closed: false
    });
  });

  it('非法 payload 回 null', () => {
    expect(parseKlineTick({ symbol: 'BTCUSDT' })).toBeNull();
    expect(parseKlineTick(null)).toBeNull();
  });
});
