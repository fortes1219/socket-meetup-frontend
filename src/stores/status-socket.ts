import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { SocketLike } from '@/service/socket/manager';
import { parseCallUpdate, type CallUpdatePayload } from '@/service/socket/call-update';
import type { SocketConnectionState } from '@/stores/quote-socket';

/**
 * `/` namespace client-only state。
 * 第二刀只記錄 lastCallUpdate / 連線狀態；**不**做 invalidateQueries / refetch / setQueryData /
 * BroadcastChannel / control 協議（全留第三刀）。
 */
export const useStatusSocketStore = defineStore('status-socket', () => {
  const connectionState = ref<SocketConnectionState>('disconnected');
  const lastCallUpdate = shallowRef<CallUpdatePayload | null>(null);
  const lastCallUpdateAt = ref<number | null>(null);
  const lastDisconnectReason = ref<string | null>(null);
  /** D7 trigger flag：非 silent（server 主動）斷線時亮起，Dialog UI 延後 Phase C。 */
  const reconnectPromptPending = ref(false);
  const invalidPayloadCount = ref(0);

  let socket: SocketLike | null = null;
  let bound = false;

  function handleCallUpdate(raw: unknown): void {
    const payload = parseCallUpdate(raw);
    if (payload === null) {
      invalidPayloadCount.value += 1;
      return;
    }
    lastCallUpdate.value = payload;
    lastCallUpdateAt.value = payload.timestamp;
  }

  function handleConnect(): void {
    connectionState.value = 'connected';
    reconnectPromptPending.value = false;
  }

  function handleDisconnect(reason: unknown): void {
    connectionState.value = 'disconnected';
    lastDisconnectReason.value = typeof reason === 'string' ? reason : null;
    if (reason === 'io server disconnect') reconnectPromptPending.value = true;
  }

  function bind(target: SocketLike): void {
    if (bound) return;
    socket = target;
    bound = true;
    connectionState.value = 'connecting';
    target.on('callUpdate', handleCallUpdate);
    target.on('connect', handleConnect);
    target.on('disconnect', handleDisconnect);
    // socket 可能在 bind 前就已 connected → 同步補一次，避免錯過 connect event。
    if (target.connected) handleConnect();
  }

  function unbind(): void {
    if (!bound || socket === null) return;
    socket.off('callUpdate', handleCallUpdate);
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
    socket = null;
    bound = false;
    connectionState.value = 'disconnected';
  }

  return {
    connectionState,
    lastCallUpdate,
    lastCallUpdateAt,
    lastDisconnectReason,
    reconnectPromptPending,
    invalidPayloadCount,
    bind,
    unbind
  };
});
