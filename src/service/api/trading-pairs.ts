import type { ClientInferResponseBody } from '@ts-rest/core';
import { request } from '@/service/request';
import { parseContract } from '@/service/error';
import { PublicTradingPairSchema } from '@/service/schema/trading-pair';
import type { contract } from '@/service/contract';

/**
 * 公開交易對 response DTO，從 ts-rest route infer（type-level checker）。
 * runtime 仍由 PublicTradingPairSchema 驗證；外層一律從本檔 import 此型別。
 */
export type PublicTradingPair = ClientInferResponseBody<
  typeof contract.tradingPairs.getPublicTradingPairs,
  200
>[number];

/** 取得公開交易對清單（read-only，enabled && !deleted）。 */
export async function getPublicTradingPairs(signal?: AbortSignal): Promise<PublicTradingPair[]> {
  const data = await request<unknown>({
    url: '/api/v1/trading-pairs',
    method: 'GET',
    signal
  });
  return parseContract(PublicTradingPairSchema.array(), data);
}
