import { z } from 'zod';

/**
 * `/` namespace `callUpdate` event 的 runtime validator。
 * 只負責 runtime parse；consumer type（CallUpdatePayload）由 `service/socket/call-update.ts` 對外 export。
 * demo 唯一 control resource 為 `trading-pairs`。
 */
export const CallUpdatePayloadSchema = z
  .object({
    resource: z.literal('trading-pairs'),
    timestamp: z.number().int()
  })
  .strict();
