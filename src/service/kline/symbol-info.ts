import type { SymbolInfo } from 'klinecharts';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

/**
 * Frontend-owned demo precision registry —— **不是 backend contract**。
 * PublicTradingPair DTO 無 price/volume precision，klinecharts setSymbol 需要 precision 才不會把
 * 小價格圖壓成平線，故在前端維護此對照表，覆蓋 backend `BINANCE_KLINE_SYMBOLS` allowlist（固定 1m ingestion）。
 *
 * ⚠ backend allowlist 變更時，此表必須同步（precision registry drift，見 handoff risk）。
 * precision 為 demo 近似值，非交易所權威 tick size。
 */
export const KLINE_SYMBOL_PRECISION: Record<string, { pricePrecision: number; volumePrecision: number }> = {
  BTCUSDT: { pricePrecision: 2, volumePrecision: 5 },
  ETHUSDT: { pricePrecision: 2, volumePrecision: 4 },
  BNBUSDT: { pricePrecision: 2, volumePrecision: 3 },
  SOLUSDT: { pricePrecision: 2, volumePrecision: 2 },
  DOGEUSDT: { pricePrecision: 5, volumePrecision: 0 },
  SHIBUSDT: { pricePrecision: 8, volumePrecision: 2 }
};

/**
 * 未知 symbol 的防呆 precision。
 * 正常選取路徑不會用到（selector 禁止選未知 symbol）；若觸發代表 precision drift，UI/debug 須可觀測。
 */
export const UNKNOWN_PRECISION_FALLBACK = { pricePrecision: 8, volumePrecision: 2 } as const;

/** demo 預設 symbol；resolveSelectedSymbol 缺省時優先它。 */
export const DEFAULT_KLINE_SYMBOL = 'BTCUSDT';

/** symbol 是否在 demo registry（= 有 realtime 支援 + 已知 precision）。 */
export function isKnownKlineSymbol(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(KLINE_SYMBOL_PRECISION, symbol);
}

/**
 * 解析完整 `SymbolInfo`（必帶 precision，供 klinecharts `setSymbol` 用）。
 * registry 命中 → 對的 precision；未命中 → `UNKNOWN_PRECISION_FALLBACK`（防呆，不代表正常路徑）。
 */
export function resolveKlineSymbolInfo(symbol: string): SymbolInfo {
  const precision = KLINE_SYMBOL_PRECISION[symbol] ?? UNKNOWN_PRECISION_FALLBACK;
  return { ticker: symbol, pricePrecision: precision.pricePrecision, volumePrecision: precision.volumePrecision };
}

export interface ResolveSelectedSymbolInput {
  /** URL query `?symbol=` 原值（可能 lowercase / null）。 */
  urlSymbol: string | null;
  /** public enabled trading pairs（TanStack Query 最新資料）。 */
  pairs: PublicTradingPair[];
}

/**
 * 依 URL query + public enabled list 解析要顯示的 stable symbol key（D-1）。
 * - uppercase normalize：`shibusdt → SHIBUSDT`。
 * - 只考慮「在 public list 且 registry-known（有 realtime + precision）」的 symbol；未知 symbol 不可被選。
 * - URL 命中 → 用之；URL 缺省/不在可選集 → 優先 BTCUSDT，否則 display_order 第一個可選 symbol。
 * - 無可選 symbol（list 空，或無任何 registry-known enabled）→ null（呼叫端顯示 empty/precondition state，不渲染 chart）。
 *
 * 純函數：不碰 router；URL 寫回 / normalize 由 useSelectedSymbol 在 query data ready 後處理。
 */
export function resolveSelectedSymbol({ urlSymbol, pairs }: ResolveSelectedSymbolInput): string | null {
  const selectable = pairs
    .filter(pair => isKnownKlineSymbol(pair.symbol))
    .slice()
    .sort((a, b) => a.display_order - b.display_order || a.symbol.localeCompare(b.symbol));
  if (selectable.length === 0) return null;

  const wanted = urlSymbol?.trim().toUpperCase() ?? null;
  if (wanted !== null && selectable.some(pair => pair.symbol === wanted)) return wanted;

  if (selectable.some(pair => pair.symbol === DEFAULT_KLINE_SYMBOL)) return DEFAULT_KLINE_SYMBOL;
  return selectable[0].symbol;
}
