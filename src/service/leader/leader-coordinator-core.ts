import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue';
import type { LeaderAdapters, TimerHandle } from '@/service/leader/adapters';
import { compareLeaderTerm, nextLeaderTerm, type LeaderTerm } from '@/service/leader/leader-term';

export type LeaderRole = 'follower' | 'leader';

type LeaderMessageType = 'request-leader' | 'leader-announcement' | 'leader-heartbeat' | 'leader-release';

interface LeaderMessage {
  type: LeaderMessageType;
  instanceId: string;
  term?: LeaderTerm;
  silent?: boolean;
}

export interface LeaderCoordinatorOptions {
  instanceId?: string;
  heartbeatInterval?: number;
  staleThreshold?: number;
  /** claim 前固定等待，讓現任 leader 有時間回覆 request-leader（不得為 0）。 */
  claimDelayBase?: number;
  /** claim 前的 random jitter，散開並發競選。 */
  claimDelayJitter?: number;
}

export interface LeaderCoordinator {
  instanceId: string;
  isLeader: ComputedRef<boolean>;
  role: Ref<LeaderRole>;
  leaderTerm: Ref<LeaderTerm | null>;
  /** visible window 被動讓位後暫停競選；需使用者明確 resume 才重新 request leader。 */
  isSuspended: Ref<boolean>;
  /** 一旦 leader-term 走過 localStorage degrade path 即為 true。 */
  degraded: Ref<boolean>;
  /** 開始 / 重新開始參與選舉；stop() 後可再次 start()。 */
  start(): void;
  /** 釋放 leadership、清 timer、移除 listener，但**不 close channel**（可再 start）。 */
  stop(): void;
  /** 終結：stop() 後 close channel；dispose 之後不應再 start()。 */
  dispose(): void;
  /** 使用者確認重新取得 realtime ownership 時呼叫。 */
  resumeLeadership(): void;
}

const MESSAGE_TYPES: ReadonlySet<LeaderMessageType> = new Set([
  'request-leader',
  'leader-announcement',
  'leader-heartbeat',
  'leader-release'
]);

function isLeaderTerm(value: unknown): value is LeaderTerm {
  if (typeof value !== 'object' || value === null) return false;
  const term = value as Record<string, unknown>;
  return (
    typeof term.counter === 'number' &&
    Number.isSafeInteger(term.counter) &&
    term.counter >= 0 &&
    typeof term.ownerId === 'string' &&
    term.ownerId.length > 0
  );
}

/** 完整 type guard：驗 type enum、instanceId、term（若有）與 silent（若有），不 blind cast。 */
function asLeaderMessage(raw: unknown): LeaderMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !MESSAGE_TYPES.has(candidate.type as LeaderMessageType)) return null;
  if (typeof candidate.instanceId !== 'string') return null;
  if (candidate.term !== undefined && !isLeaderTerm(candidate.term)) return null;
  if (candidate.silent !== undefined && typeof candidate.silent !== 'boolean') return null;
  return {
    type: candidate.type as LeaderMessageType,
    instanceId: candidate.instanceId,
    term: candidate.term as LeaderTerm | undefined,
    silent: candidate.silent as boolean | undefined
  };
}

function generateInstanceId(next: () => number): string {
  return `inst-${Math.floor(next() * 2 ** 31).toString(36)}`;
}

/**
 * 純 leader election 引擎（IoC）：只認 adapters，不知道 socket / queryClient / control 層存在。
 * 對外只暴露身份狀態（isLeader / role / leaderTerm / degraded）與 start/stop/dispose。
 */
export function createLeaderCoordinator(
  adapters: LeaderAdapters,
  options: LeaderCoordinatorOptions = {}
): LeaderCoordinator {
  const { channel, storage, timers, clock, random, visibility } = adapters;
  const heartbeatInterval = options.heartbeatInterval ?? 1000;
  const staleThreshold = options.staleThreshold ?? 3000;
  const claimDelayBase = options.claimDelayBase ?? 200;
  const claimDelayJitter = options.claimDelayJitter ?? 200;
  const instanceId = options.instanceId ?? generateInstanceId(() => random.next());

  const role = ref<LeaderRole>('follower');
  const leaderTerm = shallowRef<LeaderTerm | null>(null);
  const degraded = ref(false);
  const isSuspended = ref(false);
  const isLeader = computed(() => role.value === 'leader');

  let lastSeenCounter = 0;
  let lastHeartbeatAt: number | null = null;
  let knownLeaderTerm: LeaderTerm | null = null;
  let claimHandle: TimerHandle | null = null;
  let heartbeatHandle: TimerHandle | null = null;
  let staleHandle: TimerHandle | null = null;
  let unsubscribeChannel: (() => void) | null = null;
  let unsubscribeVisibility: (() => void) | null = null;
  let started = false;
  let disposed = false;

  function post(type: LeaderMessageType, extra: Partial<LeaderMessage> = {}): void {
    channel.post({ type, instanceId, ...extra });
  }

  function rememberTerm(term: LeaderTerm): void {
    lastSeenCounter = Math.max(lastSeenCounter, term.counter);
    if (!knownLeaderTerm || compareLeaderTerm(term, knownLeaderTerm) > 0) knownLeaderTerm = term;
  }

  function clearClaim(): void {
    if (claimHandle !== null) {
      timers.clearTimeout(claimHandle);
      claimHandle = null;
    }
  }

  function stopHeartbeat(): void {
    if (heartbeatHandle !== null) {
      timers.clearInterval(heartbeatHandle);
      heartbeatHandle = null;
    }
  }

  function stopStale(): void {
    if (staleHandle !== null) {
      timers.clearTimeout(staleHandle);
      staleHandle = null;
    }
  }

  function resetStale(): void {
    stopStale();
    staleHandle = timers.setTimeout(() => {
      staleHandle = null;
      if (visibility.isVisible()) scheduleClaim();
    }, staleThreshold);
  }

  function scheduleClaim(): void {
    clearClaim();
    if (isSuspended.value) return;
    if (!visibility.isVisible()) return;
    const delay = claimDelayBase + random.next() * claimDelayJitter;
    claimHandle = timers.setTimeout(() => {
      claimHandle = null;
      attemptClaim();
    }, delay);
  }

  function hasFreshOtherLeader(): boolean {
    return (
      lastHeartbeatAt !== null &&
      knownLeaderTerm !== null &&
      knownLeaderTerm.ownerId !== instanceId &&
      clock.now() - lastHeartbeatAt < staleThreshold
    );
  }

  function attemptClaim(): void {
    if (isSuspended.value) return;
    if (!visibility.isVisible()) return;
    if (hasFreshOtherLeader()) {
      becomeFollower();
      return;
    }
    becomeLeader();
  }

  function becomeLeader(): void {
    const result = nextLeaderTerm({ storage, now: () => clock.now() }, instanceId, lastSeenCounter);
    if (result.degraded) degraded.value = true;
    const term = result.term;
    lastSeenCounter = Math.max(lastSeenCounter, term.counter);
    knownLeaderTerm = term;
    leaderTerm.value = term;
    role.value = 'leader';
    stopStale();
    post('leader-announcement', { term });
    startHeartbeat();
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    post('leader-heartbeat', { term: leaderTerm.value ?? undefined });
    heartbeatHandle = timers.setInterval(() => {
      if (role.value !== 'leader' || leaderTerm.value === null) return;
      post('leader-heartbeat', { term: leaderTerm.value });
    }, heartbeatInterval);
  }

  function becomeFollower(): void {
    role.value = 'follower';
    leaderTerm.value = knownLeaderTerm;
    stopHeartbeat();
    resetStale();
  }

  /** 任期被較新 term 取代時的 silent step-down（不廣播，新 leader 已宣告）。 */
  function stepDownToFollower(): void {
    role.value = 'follower';
    leaderTerm.value = knownLeaderTerm;
    stopHeartbeat();
    resetStale();
  }

  /**
   * 收到其他 visible tab/window 的 `request-leader` 時才禮讓 leadership。
   * 單一分頁只是進背景時不 release，避免背景作業或 DevTools 操作造成 socket 無故斷線。
   */
  function releaseLeadership(): void {
    post('leader-release', { term: leaderTerm.value ?? undefined });
    becomeFollower();
  }

  function handleRequestLeader(): void {
    if (role.value !== 'leader' || leaderTerm.value === null) return;
    // MEMBER 同款：雙視窗競爭時，新 visible 視窗 request-leader，現任 leader 禮讓 release。
    // 不使用 window focus/blur，避免 DevTools 視窗搶焦點導致誤斷線。
    if (visibility.isVisible()) isSuspended.value = true;
    releaseLeadership();
  }

  function handleLeaderSignal(message: LeaderMessage): void {
    if (!message.term) return;
    rememberTerm(message.term);
    lastHeartbeatAt = clock.now();
    clearClaim();

    const currentLeaderTerm = leaderTerm.value;
    if (role.value !== 'leader' || currentLeaderTerm === null) {
      becomeFollower();
      return;
    }

    // 收到較新 term 即 step down。若自己仍 visible，這是被動失去 realtime ownership，
    // 必須進 suspended，避免馬上搶回；由 UI prompt 的 resumeLeadership() 重新取得。
    if (compareLeaderTerm(message.term, currentLeaderTerm) <= 0) return;
    if (visibility.isVisible()) isSuspended.value = true;
    stepDownToFollower();
  }

  function handleLeaderRelease(message: LeaderMessage): void {
    if (message.term) rememberTerm(message.term);
    lastHeartbeatAt = null;
    if (visibility.isVisible()) scheduleClaim();
  }

  const messageHandlers: Record<LeaderMessageType, (message: LeaderMessage) => void> = {
    'request-leader': handleRequestLeader,
    'leader-announcement': handleLeaderSignal,
    'leader-heartbeat': handleLeaderSignal,
    'leader-release': handleLeaderRelease
  };

  function onMessage(raw: unknown): void {
    const message = asLeaderMessage(raw);
    if (message === null || message.instanceId === instanceId) return;
    messageHandlers[message.type](message);
  }

  function onVisibilityChange(): void {
    if (!visibility.isVisible()) {
      // 變 hidden：不主動 release。單一分頁背景作業仍保留 leader/socket；
      // 若其他 visible tab/window 出現，會送 request-leader，由 handleRequestLeader 禮讓。
      clearClaim();
      return;
    }
    // 回 visible：re-sync，補捉 hidden 期間可能漏接的 leadership 變動。
    isSuspended.value = false;
    post('request-leader');
    if (
      role.value === 'leader' &&
      leaderTerm.value !== null &&
      knownLeaderTerm !== null &&
      compareLeaderTerm(knownLeaderTerm, leaderTerm.value) > 0
    ) {
      stepDownToFollower();
      return;
    }
    if (role.value !== 'leader' && !hasFreshOtherLeader()) scheduleClaim();
  }

  function scheduleInitialLeadershipCheck(): void {
    if (visibility.isVisible()) {
      post('request-leader');
      scheduleClaim();
      return;
    }
    resetStale();
  }

  function start(): void {
    // dispose() 之後 start() 明確 no-op（不重新 subscribe / post / 競選）。
    if (disposed || started) return;
    started = true;
    unsubscribeChannel = channel.subscribe(onMessage);
    unsubscribeVisibility = visibility.subscribe(onVisibilityChange);
    scheduleInitialLeadershipCheck();
  }

  function stop(): void {
    if (!started) return;
    started = false;
    if (role.value === 'leader' && leaderTerm.value !== null) {
      post('leader-release', { term: leaderTerm.value, silent: true });
    }
    clearClaim();
    stopHeartbeat();
    stopStale();
    unsubscribeChannel?.();
    unsubscribeVisibility?.();
    unsubscribeChannel = null;
    unsubscribeVisibility = null;
    role.value = 'follower';
    leaderTerm.value = null;
    isSuspended.value = false;
    lastHeartbeatAt = null;
    knownLeaderTerm = null;
  }

  function resumeLeadership(): void {
    isSuspended.value = false;
    post('request-leader');
    scheduleClaim();
  }

  function dispose(): void {
    if (disposed) return;
    stop();
    channel.close();
    disposed = true;
  }

  return { instanceId, isLeader, role, leaderTerm, isSuspended, degraded, start, stop, dispose, resumeLeadership };
}
