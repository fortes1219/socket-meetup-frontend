import { z } from 'zod';

/**
 * `/quote` namespace `kline` event 的 runtime validator（**camelCase**，nested）。
 * 只負責 runtime parse；consumer type（KlineTick）由 `service/socket/quote.ts` 對外 export。
 * 注意：socket 是 `openTime`（camelCase），與 REST `open_time`（snake_case）刻意不同，不共用。
 */
export const QuoteKlineEventSchema = z
  .object({
    symbol: z.string(),
    interval: z.string(),
    kline: z
      .object({
        openTime: z.number().int(),
        open: z.string(),
        high: z.string(),
        low: z.string(),
        close: z.string(),
        volume: z.string(),
        closed: z.boolean()
      })
      .strict()
  })
  .strict();
