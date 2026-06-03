import { QueryClient } from '@tanstack/vue-query';
import { isAppError } from '@/service/error';

/**
 * 最多 retry 次數。
 * query-core 的 failureCount 由 0 起算，且先判 `retry(failureCount, error)` 再 `failureCount++`，
 * 因此 predicate 在 `failureCount < MAX_QUERY_RETRY`（即 0、1）回 true，第 2 次失敗停手 = 最多 2 次 retry。
 */
const MAX_QUERY_RETRY = 2;

function isServerError(status: number | undefined): boolean {
  return status !== undefined && status >= 500 && status <= 599;
}

/**
 * Query retry 規則：
 * - cancellation（rethrown，非 AppError）/ contract_error / unknown_error / backend 4xx → 不 retry
 * - network_error、backend 5xx → 最多 2 次
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRY) return false;
  if (!isAppError(error)) return false;
  if (error.source === 'network') return true;
  if (error.source === 'backend') return isServerError(error.status);
  return false;
}

/**
 * 全域 QueryClient。
 * - server state retry 受控；mutations 不 retry。
 * - 關閉 refetchOnWindowFocus / refetchOnReconnect：避免未來 follower tab 因 TanStack 預設行為自行打 REST。
 *   初次 mount fetch 仍保留；Phase C 由 coordinator 接管 refresh ownership。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false
    },
    mutations: {
      retry: false
    }
  }
});
