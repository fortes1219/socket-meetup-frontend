import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { KlineSchema, KlinesQuerySchema } from '@/service/schema/kline';
import { ErrorBodySchema } from '@/service/schema/common';

const c = initContract();

/**
 * 歷史 K 線 read-only contract（ts-rest type-level only）。
 * 400 是 query parse 失敗的 plain-text（非 ErrorBody JSON，§backend-contracts §8#4），故宣告為 z.string()。
 */
export const klinesContract = c.router({
  getKlines: {
    method: 'GET',
    path: '/api/v1/klines',
    query: KlinesQuerySchema,
    responses: {
      200: KlineSchema.array(),
      400: z.string(),
      500: ErrorBodySchema
    },
    strictStatusCodes: true,
    summary: '歷史 K 線'
  }
});
