import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { SocketLike } from '@/service/socket/manager';
import { normalizeSubscription, type NormalizedSubscription } from '@/service/socket/normalize';
import { parseKlineTick, type KlineTick } from '@/service/socket/quote';

export type SocketConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * `/quote` client-only state。
 * - 只 leader tab 透過 bind() 接上 socket；follower 不 bind、不 emit、不開 socket。
 * - kline tick 經 `.strict()` parse 後只存 latestTick，**絕不進 BroadcastChannel**。
 */
export const useQuoteSocketStore = defineStore('quote-socket', () => {
  const connectionState = ref<SocketConnectionState>('disconnected');
  const currentSubscription = shallowRef<NormalizedSubscription | null>(null);
  const latestTick = shallowRef<KlineTick | null>(null);
  const invalidPayloadCount = ref(0);

  let socket: SocketLike | null = null;
  let bound = false;

  function handleKline(raw: unknown): void {
    const tick = parseKlineTick(raw);
    if (tick === null) {
      invalidPayloadCount.value += 1;
      return;
    }
    latestTick.value = tick;
  }

  function emitCurrentSubscription(): void {
    const subscription = currentSubscription.value;
    if (subscription === null || socket === null || !socket.connected) return;
    socket.emit('subscribe', { symbol: subscription.symbol, interval: subscription.interval });
  }

  function handleConnect(): void {
    connectionState.value = 'connected';
    // reconnect 後 server room 已清，必須重新 subscribe（§backend-contracts §8#7）。
    emitCurrentSubscription();
  }

  function handleDisconnect(): void {
    connectionState.value = 'disconnected';
  }

  /** leader connected 後綁定 socket；重複 bind 為 no-op（避免重複註冊 listener）。 */
  function bind(target: SocketLike): void {
    if (bound) return;
    socket = target;
    bound = true;
    connectionState.value = 'connecting';
    target.on('kline', handleKline);
    target.on('connect', handleConnect);
    target.on('disconnect', handleDisconnect);
    // socket 可能在 bind 前就已 connected → 同步補一次，避免錯過 connect event。
    if (target.connected) handleConnect();
  }

  function unbind(): void {
    if (!bound || socket === null) return;
    socket.off('kline', handleKline);
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
    socket = null;
    bound = false;
    connectionState.value = 'disconnected';
  }

  /** 記錄 currentSubscription；只有 bound 且 connected（= leader）才 emit。 */
  function subscribe(symbol: string, interval: string): void {
    currentSubscription.value = normalizeSubscription({ symbol, interval });
    emitCurrentSubscription();
  }

  function unsubscribe(): void {
    const subscription = currentSubscription.value;
    currentSubscription.value = null;
    if (subscription === null || socket === null || !socket.connected) return;
    socket.emit('unsubscribe', { symbol: subscription.symbol, interval: subscription.interval });
  }

  return {
    connectionState,
    currentSubscription,
    latestTick,
    invalidPayloadCount,
    bind,
    unbind,
    subscribe,
    unsubscribe
  };
});
