import { ref, type Ref } from 'vue';
import type { ControlAdapters } from '@/service/control/adapters';
import type { TradingPairsGateway } from '@/queries/trading-pairs-gateway';
import type { SocketEventThrottle, ThrottleConfig } from '@/composables/useSocketEventThrottle';
import type { PublicTradingPair } from '@/service/api/trading-pairs';
import { compareLeaderTerm, type LeaderTerm } from '@/service/leader/leader-term';
import {
  parseControlMessage,
  type ControlInvalidated,
  type ControlMessage,
  type ControlSyncRequest,
  type ControlUpdated
} from '@/service/control/messages';

export interface ControlCoordinatorOptions {
  awaitingTimeout?: number;
  throttleConfig?: ThrottleConfig;
}

export interface ControlCoordinatorDeps {
  adapters: ControlAdapters;
  gateway: TradingPairsGateway;
  throttle: SocketEventThrottle;
  isLeader: Readonly<Ref<boolean>>;
  leaderTerm: Readonly<Ref<LeaderTerm | null>>;
  options?: ControlCoordinatorOptions;
}

export interface ControlCoordinator {
  controlSequence: Ref<number>;
  lastAppliedSequence: Ref<number>;
  awaitingSequence: Ref<number | null>;
  pendingSnapshotPresent: Ref<boolean>;
  degraded: Ref<boolean>;
  /** 由 store 觀察 callUpdate nonce 後呼叫（leader path）。 */
  notifyCallUpdate(): void;
  /** 成為 leader（isLeader false→true）：reset controlSequence。 */
  notifyAcquire(): void;
  /** 測試 / 內部用；start() 會把 channel 訊息導到此。 */
  handleMessage(raw: unknown): void;
  /** 開始 / 重新開始；stop() 後可再 start()。 */
  start(): void;
  /** 清 timer / throttle / listener，但**不 close channel**（可再 start）。 */
  stop(): void;
  /** 終結：stop() 後 close channel；dispose 之後 start() 為 no-op。 */
  dispose(): void;
}

const REFRESH_KEY = { consumer: 'control', resource: 'trading-pairs', code: 'callUpdate' };
const SYNC_KEY = { consumer: 'control', resource: 'trading-pairs', code: 'sync' };

interface AwaitingSnapshot {
  leaderTerm: LeaderTerm;
  sequence: number;
}

interface PendingSnapshot {
  leaderTerm: LeaderTerm;
  throughSequence: number;
  data: PublicTradingPair[];
}

/**
 * 純 control coherence 引擎（trading-pairs only）。
 * IoC：只認 adapters / gateway / throttle 與注入的 isLeader / leaderTerm ref。
 */
export function createControlCoordinator(deps: ControlCoordinatorDeps): ControlCoordinator {
  const { adapters, gateway, throttle, isLeader, leaderTerm } = deps;
  const { channel, timers, clock, visibility } = adapters;
  const awaitingTimeout = deps.options?.awaitingTimeout ?? 3000;
  const throttleConfig = deps.options?.throttleConfig ?? { min: 2000, max: 6000, step: 500 };

  const controlSequence = ref(0);
  const lastAppliedSequence = ref(-1);
  const awaitingSequence = ref<number | null>(null);
  const pendingSnapshotPresent = ref(false);
  const degraded = ref(false);

  // leader 發布簿記（唯一寫入點 = publish）
  let lastPublishedTerm: LeaderTerm | null = null;
  let lastPublishedSequence = -1;
  let lastPublishedData: PublicTradingPair[] | null = null;

  // follower 狀態
  let knownLeaderTerm: LeaderTerm | null = null;
  let awaitingSnapshot: AwaitingSnapshot | null = null;
  let pendingSnapshot: PendingSnapshot | null = null;
  let awaitingTimer: unknown = null;

  let unsubscribeChannel: (() => void) | null = null;
  let unsubscribeVisibility: (() => void) | null = null;
  let started = false;
  let disposed = false;

  /** leaderTerm 為 null 時不得跑 leader-only flow（guardrail）。 */
  function leaderContext(): LeaderTerm | null {
    if (!isLeader.value) return null;
    const term = leaderTerm.value;
    if (term === null) {
      degraded.value = true;
      return null;
    }
    return term;
  }

  /** **唯一** 能送 control:updated 的出口：同步更新 lastPublished* + setQueryData + broadcast。 */
  function publish(term: LeaderTerm, throughSequence: number, data: PublicTradingPair[]): void {
    lastPublishedTerm = term;
    lastPublishedSequence = throughSequence;
    lastPublishedData = data;
    gateway.setTradingPairs(data);
    channel.post({
      type: 'control:updated',
      resource: 'trading-pairs',
      data,
      leaderTerm: term,
      throughSequence,
      updatedAt: clock.now()
    });
  }

  async function refreshAndPublish(): Promise<void> {
    const data = await gateway.fetchTradingPairs();
    const term = leaderContext();
    if (term === null) return;
    publish(term, controlSequence.value, data);
  }

  function notifyCallUpdate(): void {
    const term = leaderContext();
    if (term === null) return;
    controlSequence.value += 1;
    channel.post({
      type: 'control:invalidated',
      resource: 'trading-pairs',
      reason: 'callUpdate',
      leaderTerm: term,
      sequence: controlSequence.value,
      emittedAt: clock.now()
    });
    throttle.schedule(REFRESH_KEY, () => void refreshAndPublish(), throttleConfig);
  }

  function notifyAcquire(): void {
    if (leaderContext() === null) return;
    controlSequence.value = 0;
  }

  function handleSyncRequest(message: ControlSyncRequest): void {
    const term = leaderContext();
    if (term === null) return;
    const wantSequence =
      message.awaiting && compareLeaderTerm(message.awaiting.leaderTerm, term) === 0 ? message.awaiting.sequence : 0;
    if (
      lastPublishedTerm !== null &&
      lastPublishedData !== null &&
      compareLeaderTerm(lastPublishedTerm, term) === 0 &&
      lastPublishedSequence >= wantSequence
    ) {
      publish(term, lastPublishedSequence, lastPublishedData);
      return;
    }
    // 不得用舊 cache 假裝 fresh → 強制 authoritative refresh 後才 publish。
    throttle.schedule(SYNC_KEY, () => void refreshAndPublish(), throttleConfig);
  }

  function clearAwaitingTimer(): void {
    if (awaitingTimer !== null) {
      timers.clearTimeout(awaitingTimer);
      awaitingTimer = null;
    }
  }

  function startAwaitingTimer(): void {
    clearAwaitingTimer();
    awaitingTimer = timers.setTimeout(onAwaitingTimeout, awaitingTimeout);
  }

  function clearAwaiting(): void {
    awaitingSnapshot = null;
    awaitingSequence.value = null;
    clearAwaitingTimer();
  }

  function clearPending(): void {
    pendingSnapshot = null;
    pendingSnapshotPresent.value = false;
  }

  function adoptTermIfNewer(term: LeaderTerm): void {
    if (knownLeaderTerm === null || compareLeaderTerm(term, knownLeaderTerm) > 0) {
      knownLeaderTerm = term;
      lastAppliedSequence.value = -1;
    }
  }

  function isAcceptable(term: LeaderTerm, throughSequence: number): boolean {
    const cmp = knownLeaderTerm === null ? 1 : compareLeaderTerm(term, knownLeaderTerm);
    if (cmp < 0) return false; // stale term
    if (cmp > 0) return true; // 新任期 authoritative
    return throughSequence > lastAppliedSequence.value; // 同任期須前進
  }

  function applySnapshot(term: LeaderTerm, throughSequence: number, data: PublicTradingPair[]): void {
    adoptTermIfNewer(term);
    gateway.setTradingPairs(data);
    lastAppliedSequence.value = throughSequence;
    clearAwaiting();
    clearPending();
  }

  function pendingCoversAwaiting(): boolean {
    if (pendingSnapshot === null) return false;
    if (!isAcceptable(pendingSnapshot.leaderTerm, pendingSnapshot.throughSequence)) return false;
    if (awaitingSnapshot === null) return true;
    const cmp = compareLeaderTerm(pendingSnapshot.leaderTerm, awaitingSnapshot.leaderTerm);
    if (cmp > 0) return true;
    if (cmp < 0) return false;
    return pendingSnapshot.throughSequence >= awaitingSnapshot.sequence;
  }

  function broadcastSyncRequest(): void {
    channel.post({
      type: 'control:sync-request',
      resource: 'trading-pairs',
      awaiting: awaitingSnapshot
        ? { leaderTerm: awaitingSnapshot.leaderTerm, sequence: awaitingSnapshot.sequence }
        : undefined,
      requestedAt: clock.now()
    });
  }

  function isStaleInvalidated(message: ControlInvalidated): boolean {
    if (knownLeaderTerm === null) return false;
    const cmp = compareLeaderTerm(message.leaderTerm, knownLeaderTerm);
    if (cmp < 0) return true; // stale term
    return cmp === 0 && message.sequence <= lastAppliedSequence.value; // stale sequence：已套用過
  }

  function upsertAwaitingSnapshot(message: ControlInvalidated): AwaitingSnapshot {
    if (awaitingSnapshot === null || compareLeaderTerm(awaitingSnapshot.leaderTerm, message.leaderTerm) !== 0) {
      awaitingSnapshot = { leaderTerm: message.leaderTerm, sequence: message.sequence };
      return awaitingSnapshot;
    }
    awaitingSnapshot.sequence = Math.max(awaitingSnapshot.sequence, message.sequence);
    return awaitingSnapshot;
  }

  function handleInvalidated(message: ControlInvalidated): void {
    if (isStaleInvalidated(message)) return;
    adoptTermIfNewer(message.leaderTerm);
    const nextAwaiting = upsertAwaitingSnapshot(message);
    awaitingSequence.value = nextAwaiting.sequence;
    startAwaitingTimer();
  }

  function handleUpdated(message: ControlUpdated): void {
    if (!isAcceptable(message.leaderTerm, message.throughSequence)) return;
    if (visibility.isVisible()) {
      applySnapshot(message.leaderTerm, message.throughSequence, message.data);
      return;
    }
    // hidden：存 pendingSnapshot，不 setQueryData；visible 才套用。
    pendingSnapshot = {
      leaderTerm: message.leaderTerm,
      throughSequence: message.throughSequence,
      data: message.data
    };
    pendingSnapshotPresent.value = true;
    clearAwaitingTimer();
  }

  function onAwaitingTimeout(): void {
    awaitingTimer = null;
    if (awaitingSnapshot === null) return;
    // hidden：不送 sync-request，defer 到 visible（B2）。
    if (!visibility.isVisible()) return;
    if (pendingCoversAwaiting()) return;
    broadcastSyncRequest();
  }

  function onVisibilityChange(): void {
    if (!visibility.isVisible()) return;
    clearAwaitingTimer();
    if (pendingSnapshot !== null && pendingCoversAwaiting()) {
      applySnapshot(pendingSnapshot.leaderTerm, pendingSnapshot.throughSequence, pendingSnapshot.data);
      return;
    }
    if (awaitingSnapshot !== null) broadcastSyncRequest();
  }

  function dispatchSyncRequest(message: ControlMessage): void {
    if (!isLeader.value) return;
    handleSyncRequest(message as ControlSyncRequest);
  }

  function dispatchFollowerInvalidated(message: ControlMessage): void {
    if (isLeader.value) return; // leader 不處理 invalidated/updated（自家訊息也收不到）
    handleInvalidated(message as ControlInvalidated);
  }

  function dispatchFollowerUpdated(message: ControlMessage): void {
    if (isLeader.value) return; // leader 不處理 invalidated/updated（自家訊息也收不到）
    handleUpdated(message as ControlUpdated);
  }

  const messageHandlers: Record<ControlMessage['type'], (message: ControlMessage) => void> = {
    'control:sync-request': dispatchSyncRequest,
    'control:invalidated': dispatchFollowerInvalidated,
    'control:updated': dispatchFollowerUpdated
  };

  function handleMessage(raw: unknown): void {
    const message = parseControlMessage(raw);
    if (message === null) return;
    messageHandlers[message.type](message);
  }

  function start(): void {
    // dispose() 之後 start() 明確 no-op（不復活）。
    if (disposed || started) return;
    started = true;
    unsubscribeChannel = channel.subscribe(handleMessage);
    unsubscribeVisibility = visibility.subscribe(onVisibilityChange);
  }

  function stop(): void {
    if (!started) return;
    started = false;
    clearAwaitingTimer();
    throttle.stop();
    unsubscribeChannel?.();
    unsubscribeVisibility?.();
    unsubscribeChannel = null;
    unsubscribeVisibility = null;
  }

  function dispose(): void {
    if (disposed) return;
    stop();
    channel.close();
    disposed = true;
  }

  return {
    controlSequence,
    lastAppliedSequence,
    awaitingSequence,
    pendingSnapshotPresent,
    degraded,
    notifyCallUpdate,
    notifyAcquire,
    handleMessage,
    start,
    stop,
    dispose
  };
}
