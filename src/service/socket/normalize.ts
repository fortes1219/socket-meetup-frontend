export interface SubscriptionInput {
  symbol: string;
  interval: string;
}

export interface NormalizedSubscription {
  symbol: string;
  interval: string;
  roomKey: string;
}

/**
 * 前端 local normalize：server 不驗 / 不 trim subscription payload（§backend-contracts §8#3），
 * 因此 emit 前必須自行 `symbol.trim().toUpperCase()`、`interval.trim()`，並組出 room key。
 */
export function normalizeSubscription(input: SubscriptionInput): NormalizedSubscription {
  const symbol = input.symbol.trim().toUpperCase();
  const interval = input.interval.trim();
  return { symbol, interval, roomKey: `${symbol}:${interval}` };
}
