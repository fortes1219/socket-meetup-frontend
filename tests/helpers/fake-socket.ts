import type { ManagerLike, SocketLike } from '@/service/socket/manager';

export interface FakeSocket extends SocketLike {
  emits: Array<{ event: string; payload: unknown }>;
  /** 觸發已註冊的 handler（模擬 server → client event）。 */
  fire(event: string, ...args: unknown[]): void;
  handlerCount(event: string): number;
}

export function createFakeSocket(): FakeSocket {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const emits: Array<{ event: string; payload: unknown }> = [];

  const socket: FakeSocket = {
    connected: false,
    emits,
    connect() {
      socket.connected = true;
    },
    disconnect() {
      socket.connected = false;
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event, handler) {
      if (handler) handlers.get(event)?.delete(handler);
      else handlers.delete(event);
    },
    emit(event, payload) {
      emits.push({ event, payload });
    },
    fire(event, ...args) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
    handlerCount: event => handlers.get(event)?.size ?? 0
  };

  return socket;
}

export interface FakeManager extends ManagerLike {
  namespaces: string[];
  sockets: Map<string, FakeSocket>;
}

export function createFakeManager(): FakeManager {
  const sockets = new Map<string, FakeSocket>();
  const namespaces: string[] = [];
  return {
    namespaces,
    sockets,
    socket(namespace) {
      const existing = sockets.get(namespace);
      if (existing) return existing;
      const socket = createFakeSocket();
      sockets.set(namespace, socket);
      namespaces.push(namespace);
      return socket;
    }
  };
}
