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

/**
 * `GET /admin/trading-pairs` 後台交易對 runtime validator（含 enabled / display_order / timestamps）。
 * 只負責 runtime parse；endpoint DTO 型別由 `service/api/admin-trading-pairs.ts` 從 ts-rest route infer。
 */
export const AdminTradingPairSchema = z
  .object({
    id: z.string().uuid(),
    symbol: z.string(),
    base_asset: z.string(),
    quote_asset: z.string(),
    enabled: z.boolean(),
    display_order: z.number().int().nonnegative(),
    created_at: z.number().int(),
    updated_at: z.number().int()
  })
  .strict();

/** `POST /admin/trading-pairs` body：symbol trim+upper、trim 後非空（前端 local normalize，server 亦驗）。 */
export const CreateTradingPairBodySchema = z
  .object({
    symbol: z
      .string()
      .transform(value => value.trim().toUpperCase())
      .refine(value => value.length > 0, { message: 'symbol must not be empty after trim' })
  })
  .strict();

/** `PATCH /admin/trading-pairs/:id` body：enabled / display_order(>=0)；至少一欄由呼叫端保證（server 擋 empty_patch）。 */
export const PatchTradingPairBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    display_order: z.number().int().nonnegative().optional()
  })
  .strict();

/** admin list query：`include_disabled?`（預設由 api 帶 true）。 */
export const AdminListQuerySchema = z
  .object({
    include_disabled: z.boolean().optional()
  })
  .strict();
