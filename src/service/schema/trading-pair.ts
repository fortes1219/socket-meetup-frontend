import { z } from 'zod';

/**
 * `GET /api/v1/trading-pairs` 公開交易對 runtime validator（REST snake_case，固定 4 欄）。
 * 只負責 runtime parse；endpoint DTO 型別由 `service/api/trading-pairs.ts` 從 ts-rest route infer。
 */
export const PublicTradingPairSchema = z
  .object({
    symbol: z.string(),
    base_asset: z.string(),
    quote_asset: z.string(),
    display_order: z.number().int()
  })
  .strict();
