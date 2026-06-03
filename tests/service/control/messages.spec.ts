import { describe, expect, it } from 'vitest';
import {
  ControlInvalidatedSchema,
  ControlSyncRequestSchema,
  ControlUpdatedSchema,
  LeaderTermSchema
} from '@/service/schema/control';
import { parseControlMessage } from '@/service/control/messages';

const TERM = { counter: 1, ownerId: 'a' };
const PAIR = { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 };

const invalidated = {
  type: 'control:invalidated',
  resource: 'trading-pairs',
  reason: 'callUpdate',
  leaderTerm: TERM,
  sequence: 2,
  emittedAt: 100
};
const updated = {
  type: 'control:updated',
  resource: 'trading-pairs',
  data: [PAIR],
  leaderTerm: TERM,
  throughSequence: 2,
  updatedAt: 100
};
const syncRequest = {
  type: 'control:sync-request',
  resource: 'trading-pairs',
  awaiting: { leaderTerm: TERM, sequence: 2 },
  requestedAt: 100
};

describe('control schemas（strict）', () => {
  it('LeaderTermSchema 拒負數 / 非整數 / 空 ownerId', () => {
    expect(LeaderTermSchema.parse(TERM)).toEqual(TERM);
    expect(() => LeaderTermSchema.parse({ counter: -1, ownerId: 'a' })).toThrow();
    expect(() => LeaderTermSchema.parse({ counter: 1.5, ownerId: 'a' })).toThrow();
    expect(() => LeaderTermSchema.parse({ counter: 1, ownerId: '' })).toThrow();
  });

  it('三類訊息接受合法、拒未知欄', () => {
    expect(ControlInvalidatedSchema.parse(invalidated)).toEqual(invalidated);
    expect(ControlUpdatedSchema.parse(updated)).toEqual(updated);
    expect(ControlSyncRequestSchema.parse(syncRequest)).toEqual(syncRequest);
    expect(() => ControlInvalidatedSchema.parse({ ...invalidated, extra: 1 })).toThrow();
    expect(() => ControlUpdatedSchema.parse({ ...updated, data: [{ ...PAIR, extra: 1 }] })).toThrow();
  });

  it('sync-request 的 awaiting 可省略', () => {
    expect(
      ControlSyncRequestSchema.parse({ type: 'control:sync-request', resource: 'trading-pairs', requestedAt: 1 })
    ).toEqual({ type: 'control:sync-request', resource: 'trading-pairs', requestedAt: 1 });
  });
});

describe('parseControlMessage', () => {
  it('合法回 typed message', () => {
    expect(parseControlMessage(invalidated)?.type).toBe('control:invalidated');
    expect(parseControlMessage(updated)?.type).toBe('control:updated');
    expect(parseControlMessage(syncRequest)?.type).toBe('control:sync-request');
  });

  it('未知 type / 非法 → null', () => {
    expect(parseControlMessage({ type: 'control:other' })).toBeNull();
    expect(parseControlMessage({ type: 'control:updated', data: 'nope' })).toBeNull();
    expect(parseControlMessage(null)).toBeNull();
  });
});
