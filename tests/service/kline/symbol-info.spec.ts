import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KLINE_SYMBOL,
  KLINE_SYMBOL_PRECISION,
  UNKNOWN_PRECISION_FALLBACK,
  isKnownKlineSymbol,
  resolveKlineSymbolInfo,
  resolveSelectedSymbol
} from '@/service/kline/symbol-info';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

function pair(symbol: string, display_order: number): PublicTradingPair {
  return { symbol, base_asset: symbol.replace('USDT', ''), quote_asset: 'USDT', display_order };
}

const ALLOWLIST = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'DOGEUSDT', 'SHIBUSDT'];

describe('precision registry', () => {
  it('覆蓋 backend allowlist 6 個 symbol', () => {
    expect(Object.keys(KLINE_SYMBOL_PRECISION).sort()).toEqual([...ALLOWLIST].sort());
  });

  it('isKnownKlineSymbol：registry 內 true、未知 false', () => {
    expect(isKnownKlineSymbol('SHIBUSDT')).toBe(true);
    expect(isKnownKlineSymbol('BTCUSDT')).toBe(true);
    expect(isKnownKlineSymbol('XRPUSDT')).toBe(false);
  });

  it('resolveKlineSymbolInfo：SHIBUSDT → pricePrecision=8', () => {
    expect(resolveKlineSymbolInfo('SHIBUSDT')).toEqual({
      ticker: 'SHIBUSDT',
      pricePrecision: 8,
      volumePrecision: 2
    });
  });

  it('resolveKlineSymbolInfo：BTCUSDT → pricePrecision=2', () => {
    const info = resolveKlineSymbolInfo('BTCUSDT');
    expect(info.ticker).toBe('BTCUSDT');
    expect(info.pricePrecision).toBe(2);
  });

  it('resolveKlineSymbolInfo：未知 symbol → fallback precision（防呆，ticker 仍帶入）', () => {
    expect(resolveKlineSymbolInfo('XRPUSDT')).toEqual({
      ticker: 'XRPUSDT',
      pricePrecision: UNKNOWN_PRECISION_FALLBACK.pricePrecision,
      volumePrecision: UNKNOWN_PRECISION_FALLBACK.volumePrecision
    });
  });
});

describe('resolveSelectedSymbol', () => {
  const known3 = [pair('BTCUSDT', 0), pair('SHIBUSDT', 1), pair('ETHUSDT', 2)];

  it('list 空 → null', () => {
    expect(resolveSelectedSymbol({ urlSymbol: 'SHIBUSDT', pairs: [] })).toBeNull();
  });

  it('無任何 registry-known enabled → null', () => {
    expect(resolveSelectedSymbol({ urlSymbol: null, pairs: [pair('XRPUSDT', 0), pair('ADAUSDT', 1)] })).toBeNull();
  });

  it('URL 命中（known + enabled）→ 用之', () => {
    expect(resolveSelectedSymbol({ urlSymbol: 'ETHUSDT', pairs: known3 })).toBe('ETHUSDT');
  });

  it('URL lowercase → uppercase normalize（shibusdt → SHIBUSDT）', () => {
    expect(resolveSelectedSymbol({ urlSymbol: 'shibusdt', pairs: known3 })).toBe('SHIBUSDT');
  });

  it('URL 缺省 → 優先 BTCUSDT（在 list 時）', () => {
    expect(resolveSelectedSymbol({ urlSymbol: null, pairs: known3 })).toBe('BTCUSDT');
  });

  it('URL 缺省且無 BTCUSDT → display_order 第一個可選 symbol', () => {
    const noBtc = [pair('ETHUSDT', 2), pair('SHIBUSDT', 0), pair('BNBUSDT', 1)];
    expect(resolveSelectedSymbol({ urlSymbol: null, pairs: noBtc })).toBe('SHIBUSDT');
  });

  it('URL 為未知 / 不在 list → fallback（BTCUSDT 優先）', () => {
    expect(resolveSelectedSymbol({ urlSymbol: 'XRPUSDT', pairs: known3 })).toBe('BTCUSDT');
    expect(resolveSelectedSymbol({ urlSymbol: 'DOGEUSDT', pairs: known3 })).toBe('BTCUSDT'); // known 但不在此 list
  });

  it('enabled 含未知 symbol 時，未知 symbol 不會被選中', () => {
    const mixed = [pair('XRPUSDT', 0), pair('SOLUSDT', 1)];
    // URL 指向未知的 XRPUSDT → 不可選 → fallback 到唯一可選 SOLUSDT（無 BTCUSDT 時取 display_order 首）
    expect(resolveSelectedSymbol({ urlSymbol: 'XRPUSDT', pairs: mixed })).toBe('SOLUSDT');
  });

  it('DEFAULT_KLINE_SYMBOL = BTCUSDT', () => {
    expect(DEFAULT_KLINE_SYMBOL).toBe('BTCUSDT');
  });
});
