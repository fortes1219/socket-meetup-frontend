import type {
  ChannelAdapter,
  Clock,
  RandomSource,
  StorageAdapter,
  TimerAdapter,
  TimerHandle
} from '@/service/leader/adapters';
import type { VisibilityAdapter as LeaderVisibilityAdapter } from '@/service/leader/adapters';
import type { VisibilityAdapter as ControlVisibilityAdapter } from '@/service/control/adapters';

interface ScheduledTimer {
  id: number;
  fireAt: number;
  fn: () => void;
  interval: number | null;
}

interface BusChannel {
  id: string;
  active: boolean;
  handler: ((message: unknown) => void) | null;
}

/** 受控環境：共享 wall clock + timer scheduler + message bus + storage，驅動多個 coordinator instance。 */
export interface FakeLeaderEnv {
  clock: Clock;
  timers: TimerAdapter;
  storage: StorageAdapter & { map: Map<string, string> };
  advance(ms: number): void;
  makeChannel(id: string): ChannelAdapter;
  disconnect(id: string): void;
  reconnect(id: string): void;
  makeVisibility(
    initial: boolean
  ): LeaderVisibilityAdapter & { set(visible: boolean): void; setSilent(visible: boolean): void };
  makeControlVisibility(initial: boolean): ControlVisibilityAdapter & { set(visible: boolean): void };
  seededRandom(seed: number): RandomSource;
}

export function createFakeLeaderEnv(): FakeLeaderEnv {
  let currentTime = 0;
  let timerId = 0;
  const scheduled: ScheduledTimer[] = [];

  const clock: Clock = { now: () => currentTime };

  const timers: TimerAdapter = {
    setTimeout: (fn, ms) => {
      const id = ++timerId;
      scheduled.push({ id, fireAt: currentTime + ms, fn, interval: null });
      return id;
    },
    clearTimeout: handle => removeTimer(handle),
    setInterval: (fn, ms) => {
      const id = ++timerId;
      scheduled.push({ id, fireAt: currentTime + ms, fn, interval: ms });
      return id;
    },
    clearInterval: handle => removeTimer(handle)
  };

  function removeTimer(handle: TimerHandle): void {
    const index = scheduled.findIndex(timer => timer.id === handle);
    if (index >= 0) scheduled.splice(index, 1);
  }

  function advance(ms: number): void {
    const target = currentTime + ms;
    for (;;) {
      const next = scheduled.filter(timer => timer.fireAt <= target).sort((a, b) => a.fireAt - b.fireAt)[0];
      if (!next) break;
      currentTime = next.fireAt;
      if (next.interval === null) {
        removeTimer(next.id);
      } else {
        next.fireAt = currentTime + next.interval;
      }
      next.fn();
    }
    currentTime = target;
  }

  const channels: BusChannel[] = [];

  function makeChannel(id: string): ChannelAdapter {
    const entry: BusChannel = { id, active: true, handler: null };
    channels.push(entry);
    return {
      post: message => {
        if (!entry.active) return;
        for (const other of channels) {
          if (other === entry || !other.active || other.handler === null) continue;
          other.handler(message);
        }
      },
      subscribe: handler => {
        entry.handler = handler;
        return () => {
          entry.handler = null;
        };
      },
      close: () => {
        entry.active = false;
        entry.handler = null;
      }
    };
  }

  function disconnect(id: string): void {
    for (const channel of channels) if (channel.id === id) channel.active = false;
  }

  function reconnect(id: string): void {
    for (const channel of channels) if (channel.id === id) channel.active = true;
  }

  const map = new Map<string, string>();
  const storage: StorageAdapter & { map: Map<string, string> } = {
    map,
    getItem: key => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    }
  };

  function makeVisibility(
    initial: boolean
  ): LeaderVisibilityAdapter & { set(visible: boolean): void; setSilent(visible: boolean): void } {
    let visible = initial;
    const handlers = new Set<() => void>();
    return {
      isVisible: () => visible,
      subscribe: handler => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      set: next => {
        visible = next;
        for (const handler of handlers) handler();
      },
      setSilent: next => {
        visible = next;
      }
    };
  }

  function makeControlVisibility(initial: boolean): ControlVisibilityAdapter & { set(visible: boolean): void } {
    let visible = initial;
    const handlers = new Set<() => void>();
    return {
      isVisible: () => visible,
      subscribe: handler => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      set: next => {
        visible = next;
        for (const handler of handlers) handler();
      }
    };
  }

  function seededRandom(seed: number): RandomSource {
    let state = seed >>> 0;
    return {
      next: () => {
        state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      }
    };
  }

  return {
    clock,
    timers,
    storage,
    advance,
    makeChannel,
    disconnect,
    reconnect,
    makeVisibility,
    makeControlVisibility,
    seededRandom
  };
}
