import { describe, expect, it } from 'vitest';
import {
  klineRowToKLineData,
  mapKlineRowsAscending,
  tickToKLineData,
  periodToBinanceInterval
} from '@/service/kline/adapter';
import type { Kline } from '@/service/api/klines';
import type { KlineTick } from '@/service/socket/quote';

function row(overrides: Partial<Kline> = {}): Kline {
  return {
    open_time: 1700000000000,
    close_time: 1700000059999,
    open: '0.00001234',
    high: '0.00001240',
    low: '0.00001230',
    close: '0.00001238',
    volume: '123456.789',
    trades_count: 42,
    ...overrides
  };
}

function tick(overrides: Partial<KlineTick> = {}): KlineTick {
  return {
    symbol: 'SHIBUSDT',
    interval: '1m',
    openTime: 1700000120000,
    open: '0.00001238',
    high: '0.00001250',
    low: '0.00001238',
    close: '0.00001249',
    volume: '987.65',
    closed: false,
    ...overrides
  };
}

describe('klineRowToKLineData', () => {
  it('snake_case → KLineData，string → number，timestamp 用 open_time', () => {
    const data = klineRowToKLineData(row());
    expect(data).toEqual({
      timestamp: 1700000000000,
      open: 0.00001234,
      high: 0.0000124,
      low: 0.0000123,
      close: 0.00001238,
      volume: 123456.789
    });
  });

  it('不帶 close_time / trades_count', () => {
    const data = klineRowToKLineData(row());
    expect('close_time' in data).toBe(false);
    expect('trades_count' in data).toBe(false);
  });
});

describe('mapKlineRowsAscending', () => {
  it('DESC 輸入 → ascending（依 timestamp）輸出', () => {
    const rows = [
      row({ open_time: 1700000120000, close: '3' }),
      row({ open_time: 1700000060000, close: '2' }),
      row({ open_time: 1700000000000, close: '1' })
    ];
    const data = mapKlineRowsAscending(rows);
    expect(data.map(d => d.timestamp)).toEqual([1700000000000, 1700000060000, 1700000120000]);
    expect(data.map(d => d.close)).toEqual([1, 2, 3]);
  });

  it('不就地 mutate 輸入陣列', () => {
    const rows = [row({ open_time: 2 }), row({ open_time: 1 })];
    const before = rows.map(r => r.open_time);
    mapKlineRowsAscending(rows);
    expect(rows.map(r => r.open_time)).toEqual(before);
  });

  it('空陣列 → 空陣列', () => {
    expect(mapKlineRowsAscending([])).toEqual([]);
  });
});

describe('tickToKLineData', () => {
  it('camelCase → KLineData，string → number，timestamp 用 openTime', () => {
    const data = tickToKLineData(tick());
    expect(data).toEqual({
      timestamp: 1700000120000,
      open: 0.00001238,
      high: 0.0000125,
      low: 0.00001238,
      close: 0.00001249,
      volume: 987.65
    });
  });

  it('不傳 closed（KLineData 無此欄）', () => {
    const data = tickToKLineData(tick({ closed: true }));
    expect('closed' in data).toBe(false);
  });
});

describe('periodToBinanceInterval', () => {
  it('minute span 1 → 1m', () => {
    expect(periodToBinanceInterval({ type: 'minute', span: 1 })).toBe('1m');
  });

  it('非 1m 一律 throw（demo 僅支援 1m）', () => {
    expect(() => periodToBinanceInterval({ type: 'minute', span: 5 })).toThrow();
    expect(() => periodToBinanceInterval({ type: 'hour', span: 1 })).toThrow();
    expect(() => periodToBinanceInterval({ type: 'day', span: 1 })).toThrow();
  });
});
