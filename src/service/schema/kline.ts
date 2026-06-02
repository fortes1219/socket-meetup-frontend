import { z } from 'zod';

/**
 * `GET /api/v1/klines` 歷史 K 線 DTO（REST snake_case，金額為 decimal string）。
 * 注意：REST 是 `open_time`（snake_case），與 `/quote` socket 的 `openTime`（camelCase）刻意不同，不共用。
 */
export const KlineSchema = z
  .object({
    open_time: z.number().int(),
    close_time: z.number().int(),
    open: z.string(),
    high: z.string(),
    low: z.string(),
    close: z.string(),
    volume: z.string(),
    trades_count: z.number().int()
  })
  .strict();
export type Kline = z.infer<typeof KlineSchema>;

/**
 * `GET /api/v1/klines` query 參數。
 * `limit` 是 frontend local guard（positive int）；backend 未承諾 max limit，故此處不設上限。
 * `endTime` 維持 camelCase，對齊 backend wire。
 */
export const KlinesQuerySchema = z
  .object({
    symbol: z.string().min(1),
    interval: z.string().min(1),
    limit: z.number().int().positive().optional(),
    endTime: z.number().int().optional()
  })
  .strict();
export type KlinesQuery = z.infer<typeof KlinesQuerySchema>;
