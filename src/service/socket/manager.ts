import { Manager } from 'socket.io-client';

/** socket.io Socket 的最小介面（便於注入 fake，測試不需真 TCP）。 */
export interface SocketLike {
  connected: boolean;
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler?: (...args: unknown[]) => void): void;
  emit(event: string, payload: unknown): void;
}

export interface ManagerLike {
  socket(namespace: string): SocketLike;
}

export interface SocketHubDeps {
  createManager?: (uri: string) => ManagerLike;
  origin?: string;
}

export interface SocketHub {
  connect(): void;
  disconnect(): void;
  readonly rootSocket: SocketLike | null;
  readonly quoteSocket: SocketLike | null;
  hasManager(): boolean;
}

const SOCKET_PATH = '/socket.io';

function defaultOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Explicit singleton Socket.IO hub。
 * - **只在成為 leader（connect）時** `new Manager`，建立**單一 TCP**；同一 Manager 建 `/` 與 `/quote` namespace socket。
 * - disconnect 時關閉兩 socket 並丟棄 Manager（follower 無 TCP）。
 * - 不靠 `io()` / `io('/quote')` 隱式 cache。
 * - transports 鎖 `websocket`：demo 期間 fail-fast 驗 WS path，不用 polling fallback 掩蓋 proxy 問題。
 */
export function createSocketHub(deps: SocketHubDeps = {}): SocketHub {
  const origin = deps.origin ?? defaultOrigin();
  const createManager =
    deps.createManager ??
    ((uri: string) =>
      new Manager(uri, {
        path: SOCKET_PATH,
        autoConnect: false,
        reconnection: true,
        transports: ['websocket']
      }) as unknown as ManagerLike);

  let manager: ManagerLike | null = null;
  let root: SocketLike | null = null;
  let quote: SocketLike | null = null;

  function connect(): void {
    if (manager !== null) return;
    manager = createManager(origin);
    root = manager.socket('/');
    quote = manager.socket('/quote');
    root.connect();
    quote.connect();
  }

  function disconnect(): void {
    if (manager === null) return;
    quote?.disconnect();
    root?.disconnect();
    manager = null;
    root = null;
    quote = null;
  }

  return {
    connect,
    disconnect,
    get rootSocket() {
      return root;
    },
    get quoteSocket() {
      return quote;
    },
    hasManager: () => manager !== null
  };
}

let singleton: SocketHub | null = null;

/** App 共用的單例 hub。 */
export function getSocketHub(): SocketHub {
  if (singleton === null) singleton = createSocketHub();
  return singleton;
}
