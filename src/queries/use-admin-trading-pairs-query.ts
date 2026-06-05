import { useQuery } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';
import { getAdminTradingPairs, type AdminTradingPair } from '@/service/api/admin-trading-pairs';
import { useAdminTokenStore } from '@/stores/admin-token';
import type { AppError } from '@/service/error';

/** 後台清單固定帶 include_disabled=true（後台要看得到 disabled）。 */
const ADMIN_LIST_PARAMS = { include_disabled: true } as const;

/**
 * 後台交易對清單 query。
 * - **無 token → disabled**（不 fire）；token 在 queryFn 內即時讀取，**不進 queryKey**。
 * - server state owner = TanStack Query；admin list 由 mutation onSuccess 自行 invalidate。
 */
export function useAdminTradingPairsQuery() {
  const tokenStore = useAdminTokenStore();
  return useQuery<AdminTradingPair[], AppError>({
    queryKey: tradingPairKeys.admin(ADMIN_LIST_PARAMS),
    queryFn: ({ signal }) => getAdminTradingPairs(tokenStore.token, ADMIN_LIST_PARAMS, signal),
    enabled: () => tokenStore.hasToken
  });
}
