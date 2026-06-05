<script setup lang="ts">
import { computed } from 'vue';
import { useSelectedSymbol } from '@/composables/useSelectedSymbol';
import SymbolSelector from '@/components/kline/SymbolSelector.vue';
import KlineChart from '@/components/kline/KlineChart.vue';

// 唯一 query + selection 來源；Home 不再直接呼 useTradingPairsQuery、不自寫 selection resolve。
const { pairs, isPending, isError, error, selectedSymbol, selectedSymbolInfo, selectSymbol } = useSelectedSymbol();

const isEmpty = computed(() => !isPending.value && !isError.value && pairs.value.length === 0);
const errorCode = computed(() => error.value?.code ?? 'unknown_error');
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="home-header">
      <q-toolbar>
        <q-icon name="candlestick_chart" size="sm" />
        <q-toolbar-title>Socket Meetup</q-toolbar-title>
        <q-chip color="positive" text-color="white" icon="sensors">Realtime Ready</q-chip>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page class="home-view">
        <q-card class="home-card">
          <q-card-section>
            <div class="text-h6">公開交易對</div>
            <div class="text-body2 text-grey-7">read-only smoke：驗證 service → query 的四態。</div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <div v-if="isPending" data-test="state-pending" class="row items-center q-gutter-sm">
              <q-spinner size="sm" />
              <span>載入中…</span>
            </div>

            <div v-else-if="isError" data-test="state-error" class="text-negative">載入失敗（{{ errorCode }}）</div>

            <div v-else-if="isEmpty" data-test="state-empty" class="text-grey-7">目前沒有可用交易對。</div>

            <q-list v-else data-test="state-data" separator>
              <q-item v-for="pair in pairs" :key="pair.symbol">
                <q-item-section>{{ pair.symbol }}</q-item-section>
                <q-item-section side>{{ pair.base_asset }}/{{ pair.quote_asset }}</q-item-section>
                <q-item-section side>#{{ pair.display_order }}</q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>

        <!-- selectable chart：只有 data ready 後渲染；無 registry-known 可選 symbol → precondition state，不渲染 chart。 -->
        <template v-if="!isPending && !isError">
          <template v-if="selectedSymbolInfo">
            <SymbolSelector :pairs="pairs" :selected="selectedSymbol" @select="selectSymbol" />
            <KlineChart :symbol="selectedSymbolInfo ?? undefined" />
          </template>

          <q-card v-else data-test="chart-precondition" class="home-card">
            <q-card-section>
              <div class="text-h6">尚無可用的 realtime 交易對</div>
              <div class="text-body2 kline-caption">
                請確認 backend public list 至少有一個 demo 支援的 symbol（最少 BTCUSDT）。
              </div>
            </q-card-section>
          </q-card>
        </template>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style lang="scss" scoped>
.home-view {
  display: grid;
  align-content: start;
  gap: 1rem;
  padding: 2rem;
  min-height: calc(100vh - 50px);
  color: #e5e7eb;
  background:
    linear-gradient(180deg, rgb(15 23 42 / 92%), rgb(2 6 23 / 96%)),
    radial-gradient(circle at 25% 0%, rgb(14 165 233 / 20%), transparent 24rem);
}

.home-header {
  color: #e5e7eb;
  background: rgb(2 6 23 / 88%);
  border-bottom: 1px solid rgb(148 163 184 / 18%);
  backdrop-filter: blur(14px);
}

.home-card {
  width: min(100%, 48rem);
  margin-inline: auto;
  color: #e5e7eb;
  background: rgb(15 23 42 / 86%);
  border: 1px solid rgb(148 163 184 / 16%);
  box-shadow: 0 24px 80px rgb(0 0 0 / 38%);
}

.home-card :deep(.q-separator) {
  background: rgb(148 163 184 / 14%);
}

.home-card :deep(.q-item) {
  color: #e5e7eb;
}

.home-card :deep(.q-item__section--side) {
  color: #94a3b8;
}
</style>
