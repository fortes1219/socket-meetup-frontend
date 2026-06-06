<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ create: [symbol: string] }>();
const symbol = ref('');

function submit(): void {
  const value = symbol.value.trim();
  if (value.length === 0) return;
  emit('create', value);
  symbol.value = '';
}
</script>

<template>
  <div class="create-pair-form">
    <input v-model="symbol" data-test="create-symbol" placeholder="symbol（如 ADAUSDT）" @keyup.enter="submit" />
    <q-btn data-test="create-submit" no-caps @click="submit">新增交易對</q-btn>
  </div>
</template>

<style lang="scss" scoped>
.create-pair-form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
</style>
