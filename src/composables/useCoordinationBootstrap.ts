import { computed, onScopeDispose } from 'vue';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useQuoteSocketStore } from '@/stores/quote-socket';
import { useStatusSocketStore } from '@/stores/status-socket';
import { useControlCoordinatorStore } from '@/stores/control-coordinator';
import { getSocketHub } from '@/service/socket/manager';
import { useSocketLifecycle } from '@/composables/useSocketLifecycle';

/**
 * App 啟動時呼叫一次（App.vue setup）。集中 wiring，App.vue 不寫 socket / leader 細節：
 * - leaderCoordinator.start()
 * - useSocketLifecycle() 綁 isLeader → hub connect/disconnect
 * - scope dispose 時 dispose leader coordinator
 */
export function useCoordinationBootstrap(): void {
  const leader = useLeaderCoordinatorStore();
  const quoteStore = useQuoteSocketStore();
  const statusStore = useStatusSocketStore();
  const hub = getSocketHub();

  // 實例化即 wire control coherence（觀察 leader/status state + control BroadcastChannel）。
  useControlCoordinatorStore();

  leader.start();

  useSocketLifecycle({
    isLeader: computed(() => leader.isLeader),
    hub,
    quoteStore,
    statusStore
  });

  onScopeDispose(() => leader.dispose());
}
