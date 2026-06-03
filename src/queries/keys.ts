/** TanStack Query key factory。本刀只有公開交易對 read，不建無 consumer 的 klineKeys。 */
export const tradingPairKeys = {
  all: ['trading-pairs'] as const,
  public: () => [...tradingPairKeys.all, 'public'] as const
};
