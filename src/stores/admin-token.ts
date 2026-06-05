import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Admin `X-Admin-Token`：**in-memory only**。
 * 絕不寫 localStorage / sessionStorage / .env / log / Git；reload 即清（demo 可接受重新輸入）。
 * token 也不得進入 TanStack queryKey（避免落入 query cache key）。
 */
export const useAdminTokenStore = defineStore('admin-token', () => {
  const token = ref('');
  const hasToken = computed(() => token.value.length > 0);

  function setToken(value: string): void {
    token.value = value.trim();
  }

  function clearToken(): void {
    token.value = '';
  }

  return { token, hasToken, setToken, clearToken };
});
