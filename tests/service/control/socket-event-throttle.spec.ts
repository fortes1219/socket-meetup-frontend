import { describe, expect, it } from 'vitest';
import {
  computeThrottleDelay,
  createSocketEventThrottle,
  throttleKeyOf,
  type ThrottleKey
} from '@/service/control/socket-event-throttle';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

interface FakeTimers {
  setTimeout: (handler: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  size: () => number;
  flush: () => void;
}

function fakeTimers(): FakeTimers {
  let id = 0;
  const tasks = new Map<number, () => void>();
  return {
    setTimeout: handler => {
      const handle = ++id;
      tasks.set(handle, handler);
      return handle;
    },
    clearTimeout: handle => {
      tasks.delete(handle as number);
    },
    size: () => tasks.size,
    flush: () => {
      for (const handler of [...tasks.values()]) handler();
    }
  };
}

const CONTROL_KEY: ThrottleKey = { consumer: 'control', resource: 'trading-pairs', code: 'callUpdate' };

describe('computeThrottleDelay 分布', () => {
  it('所有樣本落在 [2000, 6000)，尾端無集中於 6000 的尖峰', () => {
    const random = seededRandom(12345);
    const samples = Array.from({ length: 5000 }, () => computeThrottleDelay(random));

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(2000);
    expect(Math.max(...samples)).toBeLessThan(6000);

    // 不存在大量樣本精準集中在 max；最後 bucket [5500,6000) 與其他 bucket 量級相當
    const atMax = samples.filter(value => value === 6000).length;
    expect(atMax).toBe(0);

    const lastBucket = samples.filter(value => value >= 5500).length;
    const firstBucket = samples.filter(value => value < 2500).length;
    const ratio = lastBucket / firstBucket;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });
});

describe('throttleKeyOf', () => {
  it('組出 consumer:resource:code 複合 key', () => {
    expect(throttleKeyOf(CONTROL_KEY)).toBe('control:trading-pairs:callUpdate');
  });
});

describe('createSocketEventThrottle', () => {
  it('同 key 後到取消前一個 pending，只保留最新', () => {
    const timers = fakeTimers();
    const throttle = createSocketEventThrottle({
      random: () => 0,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    let runs = 0;
    throttle.schedule(CONTROL_KEY, () => {
      runs += 1;
    });
    throttle.schedule(CONTROL_KEY, () => {
      runs += 1;
    });

    expect(timers.size()).toBe(1);
    timers.flush();
    expect(runs).toBe(1);
  });

  it('不同 consumer 不互相 cancel', () => {
    const timers = fakeTimers();
    const throttle = createSocketEventThrottle({
      random: () => 0,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    throttle.schedule({ consumer: 'control', resource: 'trading-pairs', code: 'callUpdate' }, () => {});
    throttle.schedule({ consumer: 'status', resource: 'trading-pairs', code: 'callUpdate' }, () => {});

    expect(timers.size()).toBe(2);
  });

  it('cancel 只清掉對應 key', () => {
    const timers = fakeTimers();
    const throttle = createSocketEventThrottle({
      random: () => 0,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    throttle.schedule(CONTROL_KEY, () => {});
    throttle.schedule({ consumer: 'status', resource: 'trading-pairs', code: 'callUpdate' }, () => {});
    throttle.cancel(CONTROL_KEY);

    expect(timers.size()).toBe(1);
  });

  it('stop 清掉所有 pending timer', () => {
    const timers = fakeTimers();
    const throttle = createSocketEventThrottle({
      random: () => 0,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    throttle.schedule(CONTROL_KEY, () => {});
    throttle.schedule({ consumer: 'status', resource: 'trading-pairs', code: 'callUpdate' }, () => {});
    throttle.stop();

    expect(timers.size()).toBe(0);
  });
});
