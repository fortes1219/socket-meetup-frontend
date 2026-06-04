<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { SymbolInfo } from 'klinecharts';
import { useKlineFeed } from '@/composables/useKlineFeed';
import { useKlineChart } from '@/composables/useKlineChart';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useQuoteSocketStore } from '@/stores/quote-socket';

// symbol metadata fixed at mount for this slice：title 與 setSymbol 都由同一個 SymbolInfo 派生，
// 不做 reactive switching；要換 symbol 必須整包帶對的 precision，避免假裝可切 symbol。
// 預設 SHIBUSDT 必須帶 pricePrecision=8（價格 0.000005xx，預設 2 會把圖壓成平線）。
// 注意：withDefaults 工廠會被 hoist 出 setup，故只能內聯字面值，不可引用區域常數。
const props = withDefaults(defineProps<{ symbol?: SymbolInfo }>(), {
  symbol: () => ({ ticker: 'SHIBUSDT', pricePrecision: 8, volumePrecision: 2 })
});

const container = ref<HTMLElement | null>(null);
const feed = useKlineFeed();
useKlineChart(container, { symbol: props.symbol, feed });

// 只讀 leader state 判 follower limitation（不改 leader / 不開 socket / 不用 BroadcastChannel）。
const leader = useLeaderCoordinatorStore();
const isFollower = computed(() => !leader.isLeader);

// 現價只取自 quote-socket latestTick（不額外打 REST、不新增 API）。follower 無 tick → '--'（可接受）。
// 用 props.symbol.pricePrecision 控小數位，避免 Number().toString() 跑出科學記號 / 位數漂移。
const quote = useQuoteSocketStore();
const { latestTick } = storeToRefs(quote);
const currentPrice = computed(() => {
  const tick = latestTick.value;
  if (tick === null || tick.symbol !== props.symbol.ticker || tick.interval !== '1m') return '--';
  return Number(tick.close).toFixed(props.symbol.pricePrecision);
});
</script>

<template>
  <q-card class="kline-card">
    <q-card-section>
      <div class="text-h6">{{ props.symbol.ticker }} · 1m</div>
      <div data-test="current-price" class="text-subtitle1">現價 {{ currentPrice }}</div>
      <div class="text-body2 text-grey-7">Phase D：history 任意分頁可見；realtime tick 僅 leader 分頁。</div>
    </q-card-section>

    <q-banner v-if="isFollower" data-test="follower-hint" dense class="bg-grey-2 text-grey-8">
      此分頁非 leader：僅顯示歷史 K 線；realtime 更新只在 leader 分頁。
    </q-banner>

    <q-separator />

    <q-card-section>
      <div ref="container" data-test="kline-container" class="kline-container"></div>
    </q-card-section>
  </q-card>
</template>

<style lang="scss" scoped>
.kline-card {
  width: min(100%, 48rem);
  margin-inline: auto;
}

.kline-container {
  width: 100%;
  height: 360px;
}
</style>
