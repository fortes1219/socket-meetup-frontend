import { z } from 'zod';
import { PublicTradingPairSchema } from '@/service/schema/trading-pair';

/**
 * `/` namespace `callUpdate` event 的 runtime validator。
 * 只負責 runtime parse；consumer type（CallUpdatePayload）由 `service/socket/call-update.ts` 對外 export。
 */
export const CallUpdatePayloadSchema = z
  .object({
    resource: z.literal('trading-pairs'),
    timestamp: z.number().int()
  })
  .strict();

/** Leader term wire validator（跨 tab control snapshot 用）。 */
export const LeaderTermSchema = z
  .object({
    counter: z.number().int().nonnegative(),
    ownerId: z.string().min(1)
  })
  .strict();

/** BroadcastChannel control 訊息 validators（皆 `.strict()`；consumer type 在 service/control/messages.ts）。 */
export const ControlInvalidatedSchema = z
  .object({
    type: z.literal('control:invalidated'),
    resource: z.literal('trading-pairs'),
    reason: z.literal('callUpdate'),
    leaderTerm: LeaderTermSchema,
    sequence: z.number().int().nonnegative(),
    emittedAt: z.number().int()
  })
  .strict();

export const ControlUpdatedSchema = z
  .object({
    type: z.literal('control:updated'),
    resource: z.literal('trading-pairs'),
    data: PublicTradingPairSchema.array(),
    leaderTerm: LeaderTermSchema,
    throughSequence: z.number().int().nonnegative(),
    updatedAt: z.number().int()
  })
  .strict();

export const ControlSyncRequestSchema = z
  .object({
    type: z.literal('control:sync-request'),
    resource: z.literal('trading-pairs'),
    awaiting: z.object({ leaderTerm: LeaderTermSchema, sequence: z.number().int().nonnegative() }).strict().optional(),
    requestedAt: z.number().int()
  })
  .strict();

export const ControlMessageSchema = z.discriminatedUnion('type', [
  ControlInvalidatedSchema,
  ControlUpdatedSchema,
  ControlSyncRequestSchema
]);
