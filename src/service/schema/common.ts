import { z } from 'zod';

/**
 * Backend 統一 ErrorBody 的 error code enum（完整 10 個）。
 * 僅放 wire schema；local error 分類在 service/error.ts。
 */
export const ErrorCodeEnum = z.enum([
  'unauthorized',
  'invalid_param',
  'empty_patch',
  'not_found',
  'conflict',
  'symbol_not_found',
  'upstream_error',
  'broadcast_failed',
  'committed_broadcast_failed',
  'internal_error'
]);
export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

/** Backend 統一錯誤回應 shape：`{ error, message }`。 */
export const ErrorBodySchema = z
  .object({
    error: ErrorCodeEnum,
    message: z.string()
  })
  .strict();
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
