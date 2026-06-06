import { computed, onScopeDispose, watch } from 'vue';
import { defineStore } from 'pinia';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useStatusSocketStore } from '@/stores/status-socket';
import { browserControlAdapters } from '@/service/control/adapters';
import { createControlCoordinator } from '@/service/control/control-coordinator-core';
import { createTradingPairsGateway } from '@/queries/trading-pairs-gateway';
import { createSocketEventThrottle } from '@/service/control/socket-event-throttle';
import { queryClient } from '@/queries/query-client';

/** control BroadcastChannel（app prefix；與 leader / quote 完全分離；只低頻 trading-pairs control）。 */
const CONTROL_CHANNEL = 'socket-meetup:control:trading-pairs';

/**
 * Control coherence store：把 core 綁上真實 adapters + queryClient gateway + leader/status state。
 * 觀察 callUpdate nonce（事件語意）與 leadership 取得以驅動 core。
 * trading-pairs refresh 是 low-frequency correctness protocol，只能由 callUpdate / sync-request 觸發；
 * socket connected / tab focus 不得自行 refetch，避免 reload/focus request storm。
 */
export const useControlCoordinatorStore = defineStore('control-coordinator', () => {
  const leader = useLeaderCoordinatorStore();
  const status = useStatusSocketStore();

  const core = createControlCoordinator({
    adapters: browserControlAdapters(CONTROL_CHANNEL),
    gateway: createTradingPairsGateway(queryClient),
    throttle: createSocketEventThrottle(),
    isLeader: computed(() => leader.isLeader),
    leaderTerm: computed(() => leader.leaderTerm)
  });

  // callUpdate 以 nonce 事件語意觸發（valid callUpdate 才 ++）。
  watch(
    () => status.lastCallUpdateNonce,
    () => core.notifyCallUpdate()
  );

  // 取得 leadership → reset controlSequence。
  watch(
    () => leader.isLeader,
    isLeader => {
      if (isLeader) core.notifyAcquire();
    }
  );

  core.start();
  onScopeDispose(() => core.dispose());

  return {
    controlSequence: core.controlSequence,
    lastAppliedSequence: core.lastAppliedSequence,
    awaitingSequence: core.awaitingSequence,
    pendingSnapshotPresent: core.pendingSnapshotPresent,
    degraded: core.degraded
  };
});
