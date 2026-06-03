import { CanceledError } from 'axios';
import { describe, expect, it } from 'vitest';
import { shouldRetryQuery } from '@/queries/query-client';
import type { AppError } from '@/service/error';

function appError(partial: Partial<AppError>): AppError {
  return { source: 'unknown', code: 'unknown_error', message: 'x', ...partial };
}

describe('shouldRetryQuery', () => {
  it('network_error：失敗 0、1 retry，第 2 次停', () => {
    const err = appError({ source: 'network', code: 'network_error' });
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(1, err)).toBe(true);
    expect(shouldRetryQuery(2, err)).toBe(false);
  });

  it('backend 5xx：最多 2 次', () => {
    const err = appError({ source: 'backend', code: 'internal_error', status: 500 });
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(1, err)).toBe(true);
    expect(shouldRetryQuery(2, err)).toBe(false);
  });

  it('backend 4xx：不 retry', () => {
    const err = appError({ source: 'backend', code: 'invalid_param', status: 400 });
    expect(shouldRetryQuery(0, err)).toBe(false);
  });

  it('contract_error：不 retry', () => {
    expect(shouldRetryQuery(0, appError({ source: 'contract', code: 'contract_error' }))).toBe(false);
  });

  it('unknown_error：不 retry', () => {
    expect(shouldRetryQuery(0, appError({ source: 'unknown', code: 'unknown_error' }))).toBe(false);
  });

  it('cancellation（axios CanceledError）/ 非 AppError：不 retry', () => {
    expect(shouldRetryQuery(0, new CanceledError('canceled'))).toBe(false);
    expect(shouldRetryQuery(0, undefined)).toBe(false);
  });
});
