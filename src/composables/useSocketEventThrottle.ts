import { onScopeDispose } from 'vue';

/** Throttle cancellation key：consumer + resource + code，避免不同 consumer 互相 cancel（D3）。 */
export interface ThrottleKey {
  consumer: string;
  resource: string;
  code: string;
}

export interface ThrottleConfig {
  min?: number;
  max?: number;
  step?: number;
}

export interface ThrottleDeps {
  random?: () => number;
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

const DEFAULT_MIN = 2000;
const DEFAULT_MAX = 6000;
const DEFAULT_STEP = 500;

/**
 * 計算 delay：step bucket + bucket 內 jitter。
 * 每個 bucket（含最後一個）都在 [bucketStart, bucketStart + step) 內 jitter，
 * 因此**不會**產生 `baseDelay === max && jitter === 0` 的尾端集中尖峰（D2）。
 * 結果範圍：[min, max)（嚴格小於 max）。
 */
export function computeThrottleDelay(random: () => number, config: ThrottleConfig = {}): number {
  const min = config.min ?? DEFAULT_MIN;
  const max = config.max ?? DEFAULT_MAX;
  const step = config.step ?? DEFAULT_STEP;
  const span = Math.max(0, max - min);
  const bucketCount = Math.max(1, Math.floor(span / step));
  const bucketIndex = Math.min(bucketCount - 1, Math.floor(random() * bucketCount));
  const bucketStart = min + bucketIndex * step;
  const jitter = random() * step;
  return Math.min(max, bucketStart + jitter);
}

/** 組出 dedupe / cancellation 用的複合 key。 */
export function throttleKeyOf(key: ThrottleKey): string {
  return `${key.consumer}:${key.resource}:${key.code}`;
}

export interface SocketEventThrottle {
  /** 排程；同 key 後到取消前一個 pending，只保留最新（D2 dedupe）。 */
  schedule(key: ThrottleKey, task: () => void, config?: ThrottleConfig): void;
  cancel(key: ThrottleKey): void;
  /** 清掉所有 pending timer（unmount / stop）。 */
  stop(): void;
}

/**
 * 純 factory（可在非 component scope 使用，例如 control-coordinator）。
 * random / setTimeout / clearTimeout 皆可注入，分布測試需用可重現 random。
 */
export function createSocketEventThrottle(deps: ThrottleDeps = {}): SocketEventThrottle {
  const random = deps.random ?? Math.random;
  const setTimer = deps.setTimeout ?? ((handler: () => void, ms: number) => globalThis.setTimeout(handler, ms));
  const clearTimer = deps.clearTimeout ?? ((handle: unknown) => globalThis.clearTimeout(handle as number));
  const pending = new Map<string, unknown>();

  function cancel(key: ThrottleKey): void {
    const composite = throttleKeyOf(key);
    const handle = pending.get(composite);
    if (handle !== undefined) {
      clearTimer(handle);
      pending.delete(composite);
    }
  }

  function schedule(key: ThrottleKey, task: () => void, config?: ThrottleConfig): void {
    const composite = throttleKeyOf(key);
    const existing = pending.get(composite);
    if (existing !== undefined) clearTimer(existing);
    const delay = computeThrottleDelay(random, config);
    const handle = setTimer(() => {
      pending.delete(composite);
      task();
    }, delay);
    pending.set(composite, handle);
  }

  function stop(): void {
    for (const handle of pending.values()) clearTimer(handle);
    pending.clear();
  }

  return { schedule, cancel, stop };
}

/** Component scope 內使用：scope dispose 時自動清 pending timer。 */
export function useSocketEventThrottle(deps?: ThrottleDeps): SocketEventThrottle {
  const throttle = createSocketEventThrottle(deps);
  onScopeDispose(() => throttle.stop());
  return throttle;
}
