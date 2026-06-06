<script setup lang="ts">
import { ref } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useAdminTokenStore } from '@/stores/admin-token';
import { tradingPairKeys } from '@/queries/keys';

// token cleanup 在此處理（有 queryClient + admin key）：
// - setToken 後 invalidate admin key（強制以新 token refetch；token 不進 key）。
// - clearToken 後 removeQueries admin key（清掉舊 token 的 admin data，不留畫面）。
const tokenStore = useAdminTokenStore();
const queryClient = useQueryClient();
const ADMIN_KEY = tradingPairKeys.admin({ include_disabled: true });

const input = ref('');

function submit(): void {
  tokenStore.setToken(input.value);
  input.value = ''; // 不在 DOM 久留 token 值
  if (tokenStore.hasToken) void queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
}

function clear(): void {
  tokenStore.clearToken();
  void queryClient.removeQueries({ queryKey: ADMIN_KEY });
}
</script>

<template>
  <div class="admin-token-field">
    <input
      v-model="input"
      data-test="token-input"
      type="password"
      placeholder="X-Admin-Token（in-memory，reload 即清）"
      @keyup.enter="submit"
    />
    <q-btn data-test="token-submit" no-caps @click="submit">設定 token</q-btn>
    <q-btn v-if="tokenStore.hasToken" data-test="token-clear" no-caps @click="clear">清除 token</q-btn>
    <span v-if="tokenStore.hasToken" data-test="token-set">token 已設定（in-memory）</span>
  </div>
</template>

<style lang="scss" scoped>
.admin-token-field {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
</style>
