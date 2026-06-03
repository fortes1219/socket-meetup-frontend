import { initContract } from '@ts-rest/core';
import { tradingPairsContract } from '@/service/contract/trading-pairs';
import { klinesContract } from '@/service/contract/klines';

const c = initContract();

/** Router aggregation only —— 型別聚合，runtime 不使用。 */
export const contract = c.router({
  tradingPairs: tradingPairsContract,
  klines: klinesContract
});
