import type { ClientInferRequest, ClientInferResponseBody } from '@ts-rest/core';
import { request } from '@/service/request';
import { parseContract } from '@/service/error';
import { KlineSchema, KlinesQuerySchema } from '@/service/schema/kline';
import type { contract } from '@/service/contract';

/** K 線 query 參數型別，從 ts-rest route infer；runtime 仍由 KlinesQuerySchema 驗證。 */
export type KlinesQuery = NonNullable<ClientInferRequest<typeof contract.klines.getKlines>['query']>;

/** K 線 response DTO，從 ts-rest route infer。 */
export type Kline = ClientInferResponseBody<typeof contract.klines.getKlines, 200>[number];

/**
 * 取得歷史 K 線（Phase D `useKlineFeed.getBars()` 的 pull source）。
 * 參數先以 KlinesQuerySchema 做 frontend local guard 再送出。
 */
export async function getKlines(query: KlinesQuery, signal?: AbortSignal): Promise<Kline[]> {
  const params = KlinesQuerySchema.parse(query);
  const data = await request<unknown>({
    url: '/api/v1/klines',
    method: 'GET',
    params,
    signal
  });
  return parseContract(KlineSchema.array(), data);
}
