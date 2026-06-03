import { describe, expect, it } from 'vitest';
import {
  compareLeaderTerm,
  LEADER_COUNTER_KEY,
  nextLeaderTerm,
  type LeaderTermDeps
} from '@/service/leader/leader-term';

function storageDeps(initial?: string): LeaderTermDeps & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(LEADER_COUNTER_KEY, initial);
  return {
    map,
    storage: {
      getItem: key => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key, value) => {
        map.set(key, value);
      }
    },
    now: () => 1_700_000_000_000
  };
}

describe('nextLeaderTerm', () => {
  it('counter = max(storage, lastSeen) + 1 並寫回 storage', () => {
    const deps = storageDeps('4');
    const result = nextLeaderTerm(deps, 'a', 2);
    expect(result).toEqual({ term: { counter: 5, ownerId: 'a' }, degraded: false });
    expect(deps.map.get(LEADER_COUNTER_KEY)).toBe('5');
  });

  it('lastSeen 大於 storage 時以 lastSeen 為基準', () => {
    const deps = storageDeps('1');
    const result = nextLeaderTerm(deps, 'a', 9);
    expect(result.term.counter).toBe(10);
    expect(result.degraded).toBe(false);
  });

  it('storage 不可用走 degrade path，仍產生可比較 term 並標記 degraded', () => {
    const deps: LeaderTermDeps = {
      storage: {
        getItem: () => {
          throw new Error('localStorage unavailable');
        },
        setItem: () => {
          throw new Error('localStorage unavailable');
        }
      },
      now: () => 1_700_000_000_000
    };
    const result = nextLeaderTerm(deps, 'a', 3);
    expect(result.degraded).toBe(true);
    expect(result.term.counter).toBe(1_700_000_000_000);
    expect(result.term.ownerId).toBe('a');
  });
});

describe('compareLeaderTerm', () => {
  it('counter 大者較新', () => {
    expect(compareLeaderTerm({ counter: 2, ownerId: 'z' }, { counter: 1, ownerId: 'a' })).toBeGreaterThan(0);
    expect(compareLeaderTerm({ counter: 1, ownerId: 'z' }, { counter: 2, ownerId: 'a' })).toBeLessThan(0);
  });

  it('counter 相同時 ownerId 字典序小者較新（deterministic tie-break）', () => {
    expect(compareLeaderTerm({ counter: 5, ownerId: 'a' }, { counter: 5, ownerId: 'b' })).toBeGreaterThan(0);
    expect(compareLeaderTerm({ counter: 5, ownerId: 'b' }, { counter: 5, ownerId: 'a' })).toBeLessThan(0);
  });

  it('完全相同回 0', () => {
    expect(compareLeaderTerm({ counter: 5, ownerId: 'a' }, { counter: 5, ownerId: 'a' })).toBe(0);
  });
});
