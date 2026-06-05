import { ref, type Ref } from 'vue';
import { useMutation, useQueryClient, type UseMutationReturnType } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';
import {
  createTradingPair,
  deleteTradingPair,
  patchTradingPair,
  type AdminTradingPair,
  type PatchTradingPairInput
} from '@/service/api/admin-trading-pairs';
import { useAdminTokenStore } from '@/stores/admin-token';
import type { AppError } from '@/service/error';

const ADMIN_LIST_PARAMS = { include_disabled: true } as const;

/** 後端已 commit 但 broadcast 失敗：資料已變、callUpdate 不會來。 */
function isCommittedBroadcastFailed(error: AppError): boolean {
  return error.source === 'backend' && error.code === 'committed_broadcast_failed';
}

export interface AdminMutation<TData, TVars> {
  mutation: UseMutationReturnType<TData, AppError, TVars, unknown>;
  /** committed_broadcast_failed 時為 true：UI 提示「資料可能已變更，但 realtime 通知失敗」。 */
  broadcastFailed: Ref<boolean>;
}

function useAdminMutation<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>): AdminMutation<TData, TVars> {
  const queryClient = useQueryClient();
  const broadcastFailed = ref(false);

  const invalidateAdmin = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: tradingPairKeys.admin(ADMIN_LIST_PARAMS) });

  const mutation = useMutation<TData, AppError, TVars>({
    mutationFn,
    retry: false,
    onMutate: () => {
      broadcastFailed.value = false;
    },
    onSuccess: () => {
      // 只 invalidate admin；public 更新一律靠 callUpdate → control coherence，不在此手動碰 public。
      void invalidateAdmin();
    },
    onError: error => {
      if (isCommittedBroadcastFailed(error)) {
        broadcastFailed.value = true;
        // 資料已 commit：admin 必 refetch；public 走 fallback（此情境 callUpdate 不會來）。
        void invalidateAdmin();
        void queryClient.invalidateQueries({ queryKey: tradingPairKeys.public() });
      }
      // 其他 error 交給呼叫端讀 mutation.error 顯示（對齊 ErrorBody enum），不 retry、不碰 public。
    }
  });

  return { mutation, broadcastFailed };
}

export function useCreatePair(): AdminMutation<AdminTradingPair, string> {
  const tokenStore = useAdminTokenStore();
  return useAdminMutation<AdminTradingPair, string>(symbol => createTradingPair(tokenStore.token, symbol));
}

export function usePatchPair(): AdminMutation<AdminTradingPair, { id: string; patch: PatchTradingPairInput }> {
  const tokenStore = useAdminTokenStore();
  return useAdminMutation<AdminTradingPair, { id: string; patch: PatchTradingPairInput }>(({ id, patch }) =>
    patchTradingPair(tokenStore.token, id, patch)
  );
}

export function useDeletePair(): AdminMutation<void, string> {
  const tokenStore = useAdminTokenStore();
  return useAdminMutation<void, string>(id => deleteTradingPair(tokenStore.token, id));
}
