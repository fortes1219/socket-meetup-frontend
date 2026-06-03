<script setup lang="ts">
import { computed } from 'vue';
import { useTradingPairsQuery } from '@/queries/use-trading-pairs-query';

const { data, isPending, isError, error } = useTradingPairsQuery();

const pairs = computed(() => data.value ?? []);
const isEmpty = computed(() => !isPending.value && !isError.value && pairs.value.length === 0);
const errorCode = computed(() => error.value?.code ?? 'unknown_error');
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
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
  background: #f8fafc;
}

.home-card {
  width: min(100%, 48rem);
  margin-inline: auto;
}
</style>
