<script setup lang="ts">
import { computed } from 'vue';
import { useAdminTokenStore } from '@/stores/admin-token';
import { useAdminTradingPairsQuery } from '@/queries/use-admin-trading-pairs-query';
import { useCreatePair, useDeletePair, usePatchPair } from '@/queries/use-admin-trading-pairs-mutations';
import AdminTokenField from '@/components/admin/AdminTokenField.vue';
import CreatePairForm from '@/components/admin/CreatePairForm.vue';
import AdminPairRow from '@/components/admin/AdminPairRow.vue';
import ControlDebugPanel from '@/components/debug/ControlDebugPanel.vue';

const tokenStore = useAdminTokenStore();
const query = useAdminTradingPairsQuery();
const create = useCreatePair();
const patch = usePatchPair();
const del = useDeletePair();

const pairs = computed(() => query.data.value ?? []);
const isPending = computed(() => tokenStore.hasToken && query.isPending.value);
const isUnauthorized = computed(() => query.error.value?.code === 'unauthorized');
const listErrorCode = computed(() => query.error.value?.code ?? null);
const isEmpty = computed(
  () => tokenStore.hasToken && !query.isPending.value && !query.isError.value && pairs.value.length === 0
);

// 任一 mutation 的 committed_broadcast_failed → 顯示警示。
const broadcastFailed = computed(
  () => create.broadcastFailed.value || patch.broadcastFailed.value || del.broadcastFailed.value
);
// 一般 mutation error（對齊 ErrorBody enum）；**排除 committed_broadcast_failed**（由 broadcast-warning 單獨表達，不重複）。
const mutationErrorCode = computed(() => {
  const codes = [create.mutation.error.value?.code, patch.mutation.error.value?.code, del.mutation.error.value?.code];
  return codes.find(code => code != null && code !== 'committed_broadcast_failed') ?? null;
});

function onCreate(symbol: string): void {
  create.mutation.mutate(symbol);
}
function onToggleEnabled(id: string, enabled: boolean): void {
  patch.mutation.mutate({ id, patch: { enabled } });
}
function onSetOrder(id: string, order: number): void {
  patch.mutation.mutate({ id, patch: { display_order: order } });
}
function onDelete(id: string): void {
  del.mutation.mutate(id);
}
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-icon name="admin_panel_settings" size="sm" />
        <q-toolbar-title>Admin · Trading Pairs</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page class="admin-view">
        <q-card class="admin-card">
          <q-card-section>
            <div class="text-h6">Admin Trading Pairs</div>
            <div class="text-body2 text-grey-7">
              CRUD 後由 backend emit callUpdate → control coherence 更新 public 頁（不手動改 public list）。
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <AdminTokenField />
          </q-card-section>

          <q-separator />

          <q-card-section v-if="!tokenStore.hasToken" data-test="need-token" class="text-grey-7">
            請先輸入 admin token 才能載入與操作。
          </q-card-section>

          <template v-else>
            <q-card-section>
              <CreatePairForm @create="onCreate" />
            </q-card-section>

            <q-card-section v-if="broadcastFailed" data-test="broadcast-warning" class="text-warning">
              資料可能已變更，但 realtime 通知失敗，請手動重新整理。
            </q-card-section>

            <q-card-section v-if="isUnauthorized" data-test="unauthorized" class="text-negative">
              unauthorized：admin token 無效，請重新輸入或清除 token。
            </q-card-section>
            <q-card-section v-else-if="mutationErrorCode" data-test="mutation-error" class="text-negative">
              操作失敗（{{ mutationErrorCode }}）。
            </q-card-section>

            <q-card-section>
              <div v-if="isPending" data-test="admin-pending">載入中…</div>
              <div v-else-if="listErrorCode && !isUnauthorized" data-test="admin-error" class="text-negative">
                載入失敗（{{ listErrorCode }}）。
              </div>
              <div v-else-if="isEmpty" data-test="admin-empty" class="text-grey-7">目前沒有交易對。</div>
              <div v-else data-test="admin-list">
                <AdminPairRow
                  v-for="pair in pairs"
                  :key="pair.id"
                  :pair="pair"
                  @toggle-enabled="onToggleEnabled"
                  @set-order="onSetOrder"
                  @delete="onDelete"
                />
              </div>
            </q-card-section>
          </template>
        </q-card>

        <ControlDebugPanel />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style lang="scss" scoped>
.admin-view {
  display: grid;
  align-content: start;
  gap: 1rem;
  padding: 2rem;
}

.admin-card {
  width: min(100%, 56rem);
  margin-inline: auto;
}
</style>
