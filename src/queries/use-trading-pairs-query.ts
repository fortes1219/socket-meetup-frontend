import { useQuery } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';
import { getPublicTradingPairs, type PublicTradingPair } from '@/service/api/trading-pairs';
import type { AppError } from '@/service/error';

/** 公開交易對 server state（TanStack Query 持有，error 型別為 AppError）。 */
export function useTradingPairsQuery() {
  return useQuery<PublicTradingPair[], AppError>({
    queryKey: tradingPairKeys.public(),
    queryFn: ({ signal }) => getPublicTradingPairs(signal)
  });
}
