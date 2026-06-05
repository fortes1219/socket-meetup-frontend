import type { ChannelAdapter, Clock, TimerAdapter } from '@/service/leader/adapters';

export interface VisibilityAdapter {
  isVisible(): boolean;
  subscribe(handler: () => void): () => void;
}

/** control-coordinator 的 browser-global adapter（沿用 leader 的通用介面，皆可注入做 deterministic test）。 */
export interface ControlAdapters {
  channel: ChannelAdapter;
  timers: TimerAdapter;
  clock: Clock;
  visibility: VisibilityAdapter;
}

export function browserControlAdapters(channelName: string): ControlAdapters {
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
    timers: {
      setTimeout: (handler, ms) => window.setTimeout(handler, ms),
      clearTimeout: handle => window.clearTimeout(handle as number),
      setInterval: (handler, ms) => window.setInterval(handler, ms),
      clearInterval: handle => window.clearInterval(handle as number)
    },
    clock: { now: () => Date.now() },
    visibility: {
      isVisible: () => document.visibilityState === 'visible',
      subscribe: handler => {
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
      }
    }
  };
}
