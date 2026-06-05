import type { ClientInferResponseBody } from '@ts-rest/core';
import { request } from '@/service/request';
import { parseContract } from '@/service/error';
import {
  AdminListQuerySchema,
  AdminTradingPairSchema,
  CreateTradingPairBodySchema,
  PatchTradingPairBodySchema
} from '@/service/schema/trading-pair';
import type { contract } from '@/service/contract';

/**
 * 後台交易對 DTO，從 ts-rest route infer（type-level checker）。
 * runtime 仍由 `AdminTradingPairSchema` 驗證；外層一律從本檔 import 此型別。
 */
export type AdminTradingPair = ClientInferResponseBody<
  typeof contract.adminTradingPairs.listAdminTradingPairs,
  200
>[number];

export interface PatchTradingPairInput {
  enabled?: boolean;
  display_order?: number;
}

/** `X-Admin-Token` 只在 header；不保存、不 log。 */
function authHeaders(token: string): Record<string, string> {
  return { 'X-Admin-Token': token };
}

/** 後台交易對清單（含 disabled）。 */
export async function getAdminTradingPairs(
  token: string,
  query: { include_disabled?: boolean } = { include_disabled: true },
  signal?: AbortSignal
): Promise<AdminTradingPair[]> {
  const params = AdminListQuerySchema.parse(query);
  const data = await request<unknown>({
    url: '/admin/trading-pairs',
    method: 'GET',
    headers: authHeaders(token),
    params,
    signal
  });
  return parseContract(AdminTradingPairSchema.array(), data);
}

/** 新增交易對（symbol 先 trim+upper；後端補 base/quote）。 */
export async function createTradingPair(token: string, symbol: string): Promise<AdminTradingPair> {
  const body = CreateTradingPairBodySchema.parse({ symbol });
  const data = await request<unknown>({
    url: '/admin/trading-pairs',
    method: 'POST',
    headers: authHeaders(token),
    data: body
  });
  return parseContract(AdminTradingPairSchema, data);
}

/** 更新交易對（enabled / display_order）；空 patch 由呼叫端避免（server 擋 empty_patch）。 */
export async function patchTradingPair(
  token: string,
  id: string,
  patch: PatchTradingPairInput
): Promise<AdminTradingPair> {
  const body = PatchTradingPairBodySchema.parse(patch);
  const data = await request<unknown>({
    url: `/admin/trading-pairs/${id}`,
    method: 'PATCH',
    headers: authHeaders(token),
    data: body
  });
  return parseContract(AdminTradingPairSchema, data);
}

/** 刪除交易對（soft delete）；204 無 body，不 parse。 */
export async function deleteTradingPair(token: string, id: string): Promise<void> {
  await request<unknown>({
    url: `/admin/trading-pairs/${id}`,
    method: 'DELETE',
    headers: authHeaders(token)
  });
}
