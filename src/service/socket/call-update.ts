import { CallUpdatePayloadSchema } from '@/service/schema/control';

/**
 * `/` callUpdate 的 consumer type。由 socket consumer boundary 對外，不從 schema 層流出。
 * 第二刀只作為 client-only state；control 協議（invalidate / snapshot）留第三刀。
 */
export interface CallUpdatePayload {
  resource: 'trading-pairs';
  timestamp: number;
}

/** `.strict()` 驗證 raw callUpdate；parse 失敗回 null（呼叫端記 invalid、不 throw）。 */
export function parseCallUpdate(raw: unknown): CallUpdatePayload | null {
  const result = CallUpdatePayloadSchema.safeParse(raw);
  if (!result.success) return null;
  return { resource: result.data.resource, timestamp: result.data.timestamp };
}
