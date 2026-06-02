import { CanceledError } from 'axios';
import { describe, expect, it } from 'vitest';
import { normalizeHttpError, parseContract } from '@/service/error';
import { PublicTradingPairSchema } from '@/service/schema/trading-pair';

function axiosError(url: string, status?: number, data?: unknown): unknown {
  return {
    isAxiosError: true,
    message: 'request failed',
    config: { url },
    response: status === undefined ? undefined : { status, data }
  };
}

describe('normalizeHttpError', () => {
  it('保留後端 ErrorBody 的 code 與 status', () => {
    const error = normalizeHttpError(
      axiosError('/admin/trading-pairs', 401, {
        error: 'unauthorized',
        message: 'invalid admin token'
      })
    );

    expect(error).toMatchObject({
      source: 'backend',
      code: 'unauthorized',
      message: 'invalid admin token',
      status: 401
    });
  });

  it('只將 klines 的 plain-text 400 視為既知 invalid_param', () => {
    const error = normalizeHttpError(axiosError('/api/v1/klines', 400, 'invalid query'));

    expect(error).toMatchObject({
      source: 'backend',
      code: 'invalid_param',
      message: 'invalid query',
      status: 400
    });
  });

  it('不掩蓋其他 endpoint 的 malformed 400 payload', () => {
    const error = normalizeHttpError(axiosError('/admin/trading-pairs', 400, 'unexpected text'));

    expect(error).toMatchObject({
      source: 'contract',
      code: 'contract_error'
    });
  });

  it('將沒有 response 的 Axios error 視為 network error', () => {
    const error = normalizeHttpError(axiosError('/api/v1/trading-pairs'));

    expect(error).toMatchObject({
      source: 'network',
      code: 'network_error'
    });
  });

  it('保留 cancellation，不轉成 AppError', () => {
    const error = new CanceledError('canceled');

    expect(() => normalizeHttpError(error)).toThrow(error);
  });
});

describe('parseContract', () => {
  it('在成功 response 漂移時回報 contract_error', () => {
    expect(() => parseContract(PublicTradingPairSchema, { symbol: 'BTCUSDT' })).toThrowError(
      expect.objectContaining({
        source: 'contract',
        code: 'contract_error'
      })
    );
  });
});
