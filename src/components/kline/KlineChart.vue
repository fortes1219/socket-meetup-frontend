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
      <div data-test="current-price" class="current-price">現價 {{ currentPrice }}</div>
      <div class="text-body2 kline-caption">Phase D：history 任意分頁可見；realtime tick 僅 leader 分頁。</div>
    </q-card-section>

    <q-banner v-if="isFollower" data-test="follower-hint" dense class="follower-hint">
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
  color: #e5e7eb;
  background: rgb(15 23 42 / 88%);
  border: 1px solid rgb(148 163 184 / 16%);
  box-shadow: 0 24px 80px rgb(0 0 0 / 38%);
}

.kline-card :deep(.q-separator) {
  background: rgb(148 163 184 / 14%);
}

.current-price {
  margin-top: 0.25rem;
  color: #67e8f9;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.kline-caption {
  color: #94a3b8;
}

.follower-hint {
  color: #fde68a;
  background: rgb(113 63 18 / 34%);
  border-block: 1px solid rgb(251 191 36 / 20%);
}

.kline-container {
  width: 100%;
  height: 360px;
  background: #020617;
  border: 1px solid rgb(148 163 184 / 12%);
  border-radius: 12px;
  overflow: hidden;
}
</style>
