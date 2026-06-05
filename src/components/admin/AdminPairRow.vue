<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AdminTradingPair } from '@/service/api/admin-trading-pairs';

const props = defineProps<{ pair: AdminTradingPair }>();
const emit = defineEmits<{
  'toggle-enabled': [id: string, enabled: boolean];
  'set-order': [id: string, order: number];
  delete: [id: string];
}>();

// v-model.number 清空時可能變成 ''（非 number），須擋掉再 emit，避免低級誤送。
const order = ref<number | string>(props.pair.display_order);
watch(
  () => props.pair.display_order,
  value => {
    order.value = value;
  }
);

const canApplyOrder = computed(
  () => typeof order.value === 'number' && Number.isInteger(order.value) && order.value >= 0
);

function toggle(): void {
  emit('toggle-enabled', props.pair.id, !props.pair.enabled);
}
function applyOrder(): void {
  if (!canApplyOrder.value) return;
  emit('set-order', props.pair.id, order.value as number);
}
function remove(): void {
  emit('delete', props.pair.id);
}
</script>

<template>
  <div class="admin-pair-row" :data-test="`pair-row-${pair.symbol}`">
    <span class="symbol">{{ pair.symbol }}</span>
    <span :data-test="`state-${pair.symbol}`">{{ pair.enabled ? 'enabled' : 'disabled' }}</span>
    <q-btn :data-test="`toggle-${pair.symbol}`" no-caps @click="toggle">{{ pair.enabled ? '停用' : '啟用' }}</q-btn>
    <input :data-test="`order-${pair.symbol}`" v-model.number="order" type="number" min="0" class="order-input" />
    <q-btn :data-test="`apply-order-${pair.symbol}`" :disable="!canApplyOrder" no-caps @click="applyOrder"
      >套用順序</q-btn
    >
    <q-btn :data-test="`delete-${pair.symbol}`" no-caps color="negative" @click="remove">刪除</q-btn>
  </div>
</template>

<style lang="scss" scoped>
.admin-pair-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.symbol {
  min-width: 6rem;
  font-weight: 600;
}

.order-input {
  width: 4rem;
}
</style>
