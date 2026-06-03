/**
 * Leader coordinator 的 browser-global adapter 介面。
 * BroadcastChannel / localStorage / visibility / timers / clock / random 一律經由此層注入，
 * 讓 election、jitter、hidden/visible、claim race 可 deterministic test。
 */

export interface ChannelAdapter {
  post(message: unknown): void;
  subscribe(handler: (message: unknown) => void): () => void;
  close(): void;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type TimerHandle = unknown;

export interface TimerAdapter {
  setTimeout(handler: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(handler: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

export interface Clock {
  now(): number;
}

export interface RandomSource {
  /** 回傳 [0, 1) 的數值。 */
  next(): number;
}

export interface VisibilityAdapter {
  isVisible(): boolean;
  subscribe(handler: () => void): () => void;
}

export interface LeaderAdapters {
  channel: ChannelAdapter;
  storage: StorageAdapter;
  timers: TimerAdapter;
  clock: Clock;
  random: RandomSource;
  visibility: VisibilityAdapter;
}

/** 以真實 browser global 建立 adapters（production 用；測試一律注入 fake）。 */
export function browserLeaderAdapters(channelName: string): LeaderAdapters {
  const bc = new BroadcastChannel(channelName);
  return {
    channel: {
      post: message => bc.postMessage(message),
      subscribe: handler => {
        const listener = (event: MessageEvent): void => handler(event.data);
        bc.addEventListener('message', listener);
        return () => bc.removeEventListener('message', listener);
      },
      close: () => bc.close()
    },
    storage: {
      getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value)
    },
    timers: {
      setTimeout: (handler, ms) => window.setTimeout(handler, ms),
      clearTimeout: handle => window.clearTimeout(handle as number),
      setInterval: (handler, ms) => window.setInterval(handler, ms),
      clearInterval: handle => window.clearInterval(handle as number)
    },
    clock: { now: () => Date.now() },
    random: { next: () => Math.random() },
    visibility: {
      isVisible: () => document.visibilityState === 'visible',
      subscribe: handler => {
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
      }
    }
  };
}
