import { z } from 'zod';

/** `GET /api/v1/trading-pairs` 公開交易對 DTO（REST snake_case，固定 4 欄）。 */
export const PublicTradingPairSchema = z
  .object({
    symbol: z.string(),
    base_asset: z.string(),
    quote_asset: z.string(),
    display_order: z.number().int()
  })
  .strict();
export type PublicTradingPair = z.infer<typeof PublicTradingPairSchema>;
