import type { QueryClient } from '@tanstack/vue-query';
import { tradingPairKeys } from '@/queries/keys';
import { getPublicTradingPairs, type PublicTradingPair } from '@/service/api/trading-pairs';

/**
 * trading-pairs server state 的受控存取點。
 * - `fetchTradingPairs`：**leader-only** authoritative refetch（`fetchQuery staleTime:0`）。
 * - `setTradingPairs`：套 snapshot（`setQueryData`）—— leader 與 follower 都可。
 * - `getTradingPairs`：讀現值（`getQueryData`，不觸發 network）。
 * 「誰能 fetch」由 control-coordinator 控制；gateway 讓此邊界可被測試 spy。
 */
export interface TradingPairsGateway {
  fetchTradingPairs(): Promise<PublicTradingPair[]>;
  setTradingPairs(data: PublicTradingPair[]): void;
  getTradingPairs(): PublicTradingPair[] | undefined;
}

export function createTradingPairsGateway(queryClient: QueryClient): TradingPairsGateway {
  return {
    fetchTradingPairs: () =>
      queryClient.fetchQuery({
        queryKey: tradingPairKeys.public(),
        queryFn: ({ signal }) => getPublicTradingPairs(signal),
        staleTime: 0
      }),
    setTradingPairs: data => {
      queryClient.setQueryData(tradingPairKeys.public(), data);
    },
    getTradingPairs: () => queryClient.getQueryData<PublicTradingPair[]>(tradingPairKeys.public())
  };
}
