<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { SymbolInfo } from 'klinecharts';
import { useKlineFeed } from '@/composables/useKlineFeed';
import { useKlineChart } from '@/composables/useKlineChart';
import { DEFAULT_KLINE_SYMBOL, resolveKlineSymbolInfo } from '@/service/kline/symbol-info';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';
import { useQuoteSocketStore } from '@/stores/quote-socket';

// title / setSymbol / 現價精度都由同一個 SymbolInfo 派生（precision 來自 registry 單一來源）。
// 預設取 registry 的 DEFAULT_KLINE_SYMBOL；reactive：父層改 props.symbol 會經 useKlineChart watch 切換。
const props = withDefaults(defineProps<{ symbol?: SymbolInfo }>(), {
  symbol: () => resolveKlineSymbolInfo(DEFAULT_KLINE_SYMBOL)
});

const container = ref<HTMLElement | null>(null);
const feed = useKlineFeed();
// getter 傳入，保留 reactivity；useKlineChart 內以 value-equality guard 決定是否真的 setSymbol。
const chart = useKlineChart(container, { symbol: () => props.symbol, feed });

// 只讀 leader state 判 follower limitation（不改 leader / 不開 socket / 不用 BroadcastChannel）。
const leader = useLeaderCoordinatorStore();
const isFollower = computed(() => !leader.isLeader);
const showReconnectPrompt = computed(() => leader.isSuspended);

// 現價優先取 realtime tick；tick 尚未到時，用 init history 最新 close 當 fallback。
// 不額外打 REST、不新增 API；用 props.symbol.pricePrecision 控小數位，避免科學記號 / 位數漂移。
const quote = useQuoteSocketStore();
const { latestTick, connectionState } = storeToRefs(quote);
const currentPrice = computed(() => {
  const tick = latestTick.value;
  if (tick !== null && tick.symbol === props.symbol.ticker && tick.interval === '1m') {
    return Number(tick.close).toFixed(props.symbol.pricePrecision);
  }
  const history = feed.latestHistoryClose.value;
  if (history !== null && history.symbol === props.symbol.ticker && history.interval === '1m') {
    return Number(history.close).toFixed(props.symbol.pricePrecision);
  }
  return '--';
});

let connectedOnce = false;

watch(connectionState, state => {
  if (state !== 'connected') return;
  if (!connectedOnce) {
    connectedOnce = true;
    quote.resubscribe();
    return;
  }
  chart.resume();
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
      <div class="follower-hint__content">
        <span>此分頁非 leader：僅顯示歷史 K 線；realtime 更新只在 leader 分頁。</span>
        <q-btn
          v-if="showReconnectPrompt"
          color="primary"
          dense
          flat
          label="重新取得 realtime"
          data-test="resume-leader-inline"
          @click="leader.resumeLeadership()"
        />
      </div>
    </q-banner>

    <q-dialog :model-value="showReconnectPrompt" persistent>
      <q-card class="reconnect-dialog">
        <q-card-section>
          <div class="text-h6">Realtime 已由其他視窗接手</div>
          <div class="text-body2 reconnect-dialog__body">
            此視窗目前暫停競選 leader，避免雙視窗互搶 socket。若要讓此視窗恢復即時行情，請重新取得連線。
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            color="primary"
            label="重新取得 realtime"
            data-test="resume-leader"
            @click="leader.resumeLeadership()"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

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

.follower-hint__content {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.kline-container {
  width: 100%;
  height: 360px;
  background: #020617;
  border: 1px solid rgb(148 163 184 / 12%);
  border-radius: 12px;
  overflow: hidden;
}

.reconnect-dialog {
  min-width: min(90vw, 24rem);
  color: #e5e7eb;
  background: #0f172a;
  border: 1px solid rgb(148 163 184 / 18%);
}

.reconnect-dialog__body {
  margin-top: 0.5rem;
  color: #94a3b8;
}
</style>
