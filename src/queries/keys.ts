/** TanStack Query key factory。 */
export const tradingPairKeys = {
  all: ['trading-pairs'] as const,
  public: () => [...tradingPairKeys.all, 'public'] as const,
  /** 後台清單 key（對齊 backend §7.1）。**admin token 不得進 key**。 */
  admin: (params: { include_disabled: boolean }) => [...tradingPairKeys.all, 'admin', params] as const
};
