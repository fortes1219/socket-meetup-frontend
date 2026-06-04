import type { KLineData, Period } from 'klinecharts';
import type { Kline } from '@/service/api/klines';
import type { KlineTick } from '@/service/socket/quote';

/**
 * wire → klinecharts `KLineData` 轉換邊界（Phase D）。
 *
 * 設計約束：
 * - decimal string → number 只在此層（adapter）發生；`schema/` 維持 string，不做 `.transform()`。
 * - timestamp 一律 ms epoch（REST `open_time` / socket `openTime` / `KLineData.timestamp` 同單位，無換算）。
 * - 不 import klinecharts 值，只 `import type`，避免 adapter 與 render 耦合。
 * - klinecharts beta2 realtime 同 timestamp callback 為「整根 overwrite」（ST-0 實證），
 *   故 `tickToKLineData` 必須回完整 OHLCV，不可回 partial。
 */

/** demo 僅支援的 binance interval（D-B：backend ingestion 固定 1m）。 */
const DEMO_INTERVAL = '1m';

/** REST `Kline`（snake_case）→ `KLineData`。不帶 `close_time` / `trades_count`。 */
export function klineRowToKLineData(row: Kline): KLineData {
  return {
    timestamp: row.open_time,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume)
  };
}

/**
 * REST `Kline[]` → ascending（依 timestamp）`KLineData[]`。
 * backend 回 `open_time DESC`（最新在前），klinecharts 需 ascending，故在此 sort。
 * 不就地 mutate 輸入陣列。
 */
export function mapKlineRowsAscending(rows: Kline[]): KLineData[] {
  return rows.map(klineRowToKLineData).sort((a, b) => a.timestamp - b.timestamp);
}

/** socket `KlineTick`（camelCase）→ `KLineData`。不傳 `closed`（`KLineData` 無此欄）。 */
export function tickToKLineData(tick: KlineTick): KLineData {
  return {
    timestamp: tick.openTime,
    open: Number(tick.open),
    high: Number(tick.high),
    low: Number(tick.low),
    close: Number(tick.close),
    volume: Number(tick.volume)
  };
}

/**
 * klinecharts `Period` → binance interval string。
 * D-B：demo 僅接受 `{ type:'minute', span:1 }`；其餘 throw，由 UI 不提供其他選項雙重把關。
 */
export function periodToBinanceInterval(period: Period): string {
  if (period.type === 'minute' && period.span === 1) return DEMO_INTERVAL;
  throw new Error(`unsupported period: ${period.type}/${period.span}（demo 僅支援 1m）`);
}
