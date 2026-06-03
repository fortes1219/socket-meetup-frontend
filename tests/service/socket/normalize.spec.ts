import { describe, expect, it } from 'vitest';
import { normalizeSubscription } from '@/service/socket/normalize';

describe('normalizeSubscription', () => {
  it('trim + uppercase symbol、trim interval、組出 roomKey', () => {
    expect(normalizeSubscription({ symbol: ' btcusdt ', interval: ' 1m ' })).toEqual({
      symbol: 'BTCUSDT',
      interval: '1m',
      roomKey: 'BTCUSDT:1m'
    });
  });

  it('已正規化輸入保持不變', () => {
    expect(normalizeSubscription({ symbol: 'ETHUSDT', interval: '5m' }).roomKey).toBe('ETHUSDT:5m');
  });
});
