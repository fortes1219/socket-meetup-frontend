<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useStatusSocketStore } from '@/stores/status-socket';
import { useControlCoordinatorStore } from '@/stores/control-coordinator';

/**
 * 唯讀 debug 面板：只讀既有 store state 與 **query cache**（不建 query observer、不 fetch、不改 control correctness）。
 * 用來在 demo 觀測 callUpdate → control coherence → public refetch 鏈路。
 * 註：exact scheduled delay ms 本刀未提供（需 observability hook，不在 scope）。
 */
const leader = useLeaderCoordinatorStore();
const status = useStatusSocketStore();
const control = useControlCoordinatorStore();

const role = computed(() => leader.role);
const isLeader = computed(() => leader.isLeader);
const nonce = computed(() => status.lastCallUpdateNonce);
const receivedResource = computed(() =>
  status.lastCallUpdateNonce > 0 ? (status.lastCallUpdate?.resource ?? null) : null
);
const controlSequence = computed(() => control.controlSequence);
const lastApplied = computed(() => control.lastAppliedSequence);

// public query 狀態：**讀 cache，不建 observer**（getQueryState 不會觸發 fetch）。queryCache.subscribe 做 reactive。
const queryClient = useQueryClient();
const PUBLIC_KEY = tradingPairKeys.public();

interface PublicQueryDebug {
  status: string;
  fetchStatus: string;
  dataUpdatedAt: number;
}

const publicQuery = ref<PublicQueryDebug | null>(null);

function readPublicState(): void {
  const state = queryClient.getQueryState(PUBLIC_KEY);
  publicQuery.value = state
    ? { status: state.status, fetchStatus: state.fetchStatus, dataUpdatedAt: state.dataUpdatedAt }
    : null;
}

readPublicState();
const unsubscribe = queryClient.getQueryCache().subscribe(readPublicState);
onScopeDispose(unsubscribe);
</script>

<template>
  <q-card class="debug-panel" data-test="control-debug">
    <q-card-section>
      <div class="text-subtitle2">control debug（唯讀）</div>
      <div data-test="debug-role">role: {{ role }} · isLeader: {{ isLeader }}</div>
      <div data-test="debug-nonce">lastCallUpdateNonce: {{ nonce }}</div>
      <div data-test="debug-resource">received resource: {{ receivedResource ?? '—' }}</div>
      <div data-test="debug-sequence">controlSequence: {{ controlSequence }} · lastApplied: {{ lastApplied }}</div>
      <div data-test="debug-query">
        public status: {{ publicQuery?.status ?? 'N/A' }} · fetchStatus: {{ publicQuery?.fetchStatus ?? 'N/A' }} ·
        dataUpdatedAt: {{ publicQuery?.dataUpdatedAt ?? 'N/A' }}
      </div>
    </q-card-section>
  </q-card>
</template>

<style lang="scss" scoped>
.debug-panel {
  width: min(100%, 48rem);
  margin-inline: auto;
  font-family: monospace;
  font-size: 0.85rem;
}
</style>
