import { describe, expect, it } from 'vitest';
import { CallUpdatePayloadSchema } from '@/service/schema/control';
import { parseCallUpdate } from '@/service/socket/call-update';

describe('CallUpdatePayloadSchema', () => {
  it('接受合法 payload', () => {
    expect(CallUpdatePayloadSchema.parse({ resource: 'trading-pairs', timestamp: 1780000000000 })).toEqual({
      resource: 'trading-pairs',
      timestamp: 1780000000000
    });
  });

  it('strict：未知欄拋錯', () => {
    expect(() => CallUpdatePayloadSchema.parse({ resource: 'trading-pairs', timestamp: 1, extra: 1 })).toThrow();
  });

  it('resource 必須是 trading-pairs', () => {
    expect(() => CallUpdatePayloadSchema.parse({ resource: 'other', timestamp: 1 })).toThrow();
  });
});

describe('parseCallUpdate', () => {
  it('合法回 payload、非法回 null', () => {
    expect(parseCallUpdate({ resource: 'trading-pairs', timestamp: 5 })).toEqual({
      resource: 'trading-pairs',
      timestamp: 5
    });
    expect(parseCallUpdate({ resource: 'trading-pairs' })).toBeNull();
    expect(parseCallUpdate('nope')).toBeNull();
  });
});
