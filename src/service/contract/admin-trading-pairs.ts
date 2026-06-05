import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  AdminListQuerySchema,
  AdminTradingPairSchema,
  CreateTradingPairBodySchema,
  PatchTradingPairBodySchema
} from '@/service/schema/trading-pair';
import { ErrorBodySchema } from '@/service/schema/common';

const c = initContract();

const idPathParams = z.object({ id: z.string().uuid() });

/**
 * 後台交易對 CRUD contract（ts-rest **type-level only**，不使用 runtime client）。
 * 所有端點 auth = `X-Admin-Token`；error 一律 `ErrorBody`（與 klines 400 plain-text 不同）。
 */
export const adminTradingPairsContract = c.router({
  listAdminTradingPairs: {
    method: 'GET',
    path: '/admin/trading-pairs',
    query: AdminListQuerySchema,
    responses: {
      200: AdminTradingPairSchema.array(),
      400: ErrorBodySchema,
      401: ErrorBodySchema,
      500: ErrorBodySchema
    },
    strictStatusCodes: true,
    summary: '後台交易對清單（含 disabled）'
  },
  createTradingPair: {
    method: 'POST',
    path: '/admin/trading-pairs',
    body: CreateTradingPairBodySchema,
    responses: {
      201: AdminTradingPairSchema,
      400: ErrorBodySchema,
      401: ErrorBodySchema,
      409: ErrorBodySchema,
      422: ErrorBodySchema,
      502: ErrorBodySchema,
      500: ErrorBodySchema
    },
    strictStatusCodes: true,
    summary: '新增交易對'
  },
  patchTradingPair: {
    method: 'PATCH',
    path: '/admin/trading-pairs/:id',
    pathParams: idPathParams,
    body: PatchTradingPairBodySchema,
    responses: {
      200: AdminTradingPairSchema,
      400: ErrorBodySchema,
      401: ErrorBodySchema,
      404: ErrorBodySchema,
      500: ErrorBodySchema
    },
    strictStatusCodes: true,
    summary: '更新交易對（enabled / display_order）'
  },
  deleteTradingPair: {
    method: 'DELETE',
    path: '/admin/trading-pairs/:id',
    pathParams: idPathParams,
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      401: ErrorBodySchema,
      404: ErrorBodySchema,
      500: ErrorBodySchema
    },
    strictStatusCodes: true,
    summary: '刪除交易對（soft delete）'
  }
});
