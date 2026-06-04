<script setup lang="ts">
import { computed, ref } from 'vue';
import { useKlineFeed } from '@/composables/useKlineFeed';
import { useKlineChart } from '@/composables/useKlineChart';
import { useLeaderCoordinatorStore } from '@/stores/leader-coordinator';

// symbol fixed at mount for this slice：props.symbol 變動不會自動 setSymbol / resubscribe。
const props = withDefaults(defineProps<{ symbol?: string }>(), { symbol: 'SHIBUSDT' });

const container = ref<HTMLElement | null>(null);
const feed = useKlineFeed();
useKlineChart(container, { symbol: props.symbol, feed });

// 只讀 leader state 判 follower limitation（不改 leader / 不開 socket / 不用 BroadcastChannel）。
const leader = useLeaderCoordinatorStore();
const isFollower = computed(() => !leader.isLeader);
</script>

<template>
  <q-card class="kline-card">
    <q-card-section>
      <div class="text-h6">{{ props.symbol }} · 1m</div>
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
