import { QuoteKlineEventSchema } from '@/service/schema/quote';

/**
 * `/quote` 的 normalized consumer type（flat）。
 * `closed` 留給 store / debug，**不**傳 klinecharts（Phase D adapter 才轉 KLineData）。
 * 此型別由 socket consumer boundary 對外，不從 schema 層流出。
 */
export interface KlineTick {
  symbol: string;
  interval: string;
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closed: boolean;
}

/**
 * 對 raw `/quote` kline payload 做 `.strict()` 驗證後 flatten 成 KlineTick。
 * parse 失敗回 null（呼叫端負責記 invalid 計數、不更新 latestTick、不 throw 到 UI）。
 */
export function parseKlineTick(raw: unknown): KlineTick | null {
  const result = QuoteKlineEventSchema.safeParse(raw);
  if (!result.success) return null;
  const event = result.data;
  return {
    symbol: event.symbol,
    interval: event.interval,
    openTime: event.kline.openTime,
    open: event.kline.open,
    high: event.kline.high,
    low: event.kline.low,
    close: event.kline.close,
    volume: event.kline.volume,
    closed: event.kline.closed
  };
}
