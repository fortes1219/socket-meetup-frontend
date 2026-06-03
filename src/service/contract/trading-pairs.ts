import { initContract } from '@ts-rest/core';
import { PublicTradingPairSchema } from '@/service/schema/trading-pair';
import { ErrorBodySchema } from '@/service/schema/common';

const c = initContract();

/** 公開交易對 read-only contract（ts-rest type-level only，不使用 runtime client）。 */
export const tradingPairsContract = c.router({
  getPublicTradingPairs: {
    method: 'GET',
    path: '/api/v1/trading-pairs',
    responses: {
      200: PublicTradingPairSchema.array(),
      500: ErrorBodySchema
    },
    strictStatusCodes: true,
    summary: '公開交易對清單'
  }
});
