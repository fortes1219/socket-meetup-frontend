<script setup lang="ts">
import type { PublicTradingPair } from '@/service/api/trading-pairs';
import { isKnownKlineSymbol } from '@/service/kline/symbol-info';

const props = defineProps<{ pairs: PublicTradingPair[]; selected: string | null }>();
const emit = defineEmits<{ select: [symbol: string] }>();

// registry-known = 有 realtime 支援，可選；unknown 顯示但 disabled，不可選（不做 history-only selectable）。
function isSelectable(symbol: string): boolean {
  return isKnownKlineSymbol(symbol);
}

function onSelect(symbol: string): void {
  if (!isSelectable(symbol)) return;
  if (symbol === props.selected) return;
  emit('select', symbol);
}
</script>

<template>
  <div class="symbol-selector" data-test="symbol-selector">
    <q-btn
      v-for="pair in props.pairs"
      :key="pair.symbol"
      :data-test="`symbol-option-${pair.symbol}`"
      :disable="!isSelectable(pair.symbol)"
      :color="pair.symbol === props.selected ? 'primary' : undefined"
      :outline="pair.symbol !== props.selected"
      no-caps
      class="symbol-option"
      @click="onSelect(pair.symbol)"
    >
      {{ pair.symbol }}
      <span v-if="!isSelectable(pair.symbol)" class="symbol-unsupported">（不支援 realtime）</span>
    </q-btn>
  </div>
</template>

<style lang="scss" scoped>
.symbol-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  width: min(100%, 48rem);
  margin-inline: auto;
}

.symbol-unsupported {
  margin-left: 0.25rem;
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
