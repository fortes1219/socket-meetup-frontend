import { onScopeDispose, watch, type Ref } from 'vue';
import type { SocketHub } from '@/service/socket/manager';

/** quote/status store 的最小 bind/unbind 介面（避免循環依賴具體 store 型別）。 */
export interface BindableSocketStore {
  bind(socket: import('@/service/socket/manager').SocketLike): void;
  unbind(): void;
}

export interface SocketLifecycleDeps {
  isLeader: Readonly<Ref<boolean>>;
  hub: SocketHub;
  quoteStore: BindableSocketStore;
  statusStore: BindableSocketStore;
}

/**
 * 依 leader 身份開關 socket：
 * - isLeader → hub.connect()（建立單一 TCP）後 bind 兩 store
 * - !isLeader → unbind 兩 store 後 hub.disconnect()（follower 無 TCP）
 * scope dispose 時一律 unbind + disconnect。
 */
export function useSocketLifecycle(deps: SocketLifecycleDeps): void {
  const { isLeader, hub, quoteStore, statusStore } = deps;

  function bindConnectedSockets(): void {
    if (hub.quoteSocket) quoteStore.bind(hub.quoteSocket);
    if (hub.rootSocket) statusStore.bind(hub.rootSocket);
  }

  function setupLeaderSockets(): void {
    hub.connect();
    bindConnectedSockets();
  }

  function teardown(): void {
    quoteStore.unbind();
    statusStore.unbind();
    hub.disconnect();
  }

  const lifecycleByRole: Record<'leader' | 'follower', () => void> = {
    leader: setupLeaderSockets,
    follower: teardown
  };

  watch(isLeader, leader => lifecycleByRole[leader ? 'leader' : 'follower'](), { immediate: true });

  onScopeDispose(teardown);
}
