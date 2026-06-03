import type { LeaderTerm } from '@/service/leader/leader-term';
import type { PublicTradingPair } from '@/service/api/trading-pairs';
import { ControlMessageSchema } from '@/service/schema/control';

/** control 訊息 consumer types（由此 boundary 對外，不從 schema 流出）。 */
export interface ControlInvalidated {
  type: 'control:invalidated';
  resource: 'trading-pairs';
  reason: 'callUpdate';
  leaderTerm: LeaderTerm;
  sequence: number;
  emittedAt: number;
}

export interface ControlUpdated {
  type: 'control:updated';
  resource: 'trading-pairs';
  data: PublicTradingPair[];
  leaderTerm: LeaderTerm;
  throughSequence: number;
  updatedAt: number;
}

export interface ControlSyncRequest {
  type: 'control:sync-request';
  resource: 'trading-pairs';
  awaiting?: { leaderTerm: LeaderTerm; sequence: number };
  requestedAt: number;
}

export type ControlMessage = ControlInvalidated | ControlUpdated | ControlSyncRequest;

/** `.strict()` 驗證跨 tab control 訊息；非法回 null（呼叫端丟棄、不 throw）。 */
export function parseControlMessage(raw: unknown): ControlMessage | null {
  const result = ControlMessageSchema.safeParse(raw);
  return result.success ? (result.data as ControlMessage) : null;
}
