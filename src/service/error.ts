import axios, { type AxiosError } from 'axios';
import type { ZodType } from 'zod';
import { ErrorBodySchema, type ErrorCode } from '@/service/schema/common';

/** AppError 來源分類：backend 契約錯誤，或本地 network / contract drift / unknown。 */
export type AppErrorSource = 'backend' | 'network' | 'contract' | 'unknown';

/** 本地 error code（非 backend 契約碼）。 */
export type LocalErrorCode = 'network_error' | 'contract_error' | 'unknown_error';

/**
 * 本地統一錯誤型別。
 * `raw` 僅供 debug，型別為 unknown，不得渲染或序列化到 UI。
 */
export interface AppError {
  source: AppErrorSource;
  code: ErrorCode | LocalErrorCode;
  message: string;
  status?: number;
  raw?: unknown;
}

/** narrow unknown thrown value 是否為 AppError。 */
export function isAppError(value: unknown): value is AppError {
  return typeof value === 'object' && value !== null && 'source' in value && 'code' in value && 'message' in value;
}

function backendError(code: ErrorCode, message: string, status: number, raw: unknown): AppError {
  return { source: 'backend', code, message, status, raw };
}

function localError(
  source: Exclude<AppErrorSource, 'backend'>,
  code: LocalErrorCode,
  message: string,
  raw: unknown
): AppError {
  return { source, code, message, raw };
}

function isKlinesPlainTextInvalidParam(error: AxiosError, status: number, data: unknown): data is string {
  const url = error.config?.url?.split('?')[0];
  return status === 400 && url === '/api/v1/klines' && typeof data === 'string';
}

/**
 * Transport / rejected-HTTP-response 錯誤管線。
 * 只處理 axios reject 的情形；2xx 之後的 Zod parse failure 由 {@link parseContract} 負責，
 * 不可假設此處（或 interceptor）攔得到 2xx parse 失敗。
 *
 * cancellation 一律原樣 rethrow，不轉成 AppError、不顯示、不 retry。
 */
export function normalizeHttpError(error: unknown): AppError {
  if (axios.isCancel(error)) {
    throw error;
  }

  if (axios.isAxiosError(error)) {
    const response = error.response;

    // 無 response = network / timeout
    if (!response) {
      return localError('network', 'network_error', error.message || 'network error', error);
    }

    const { status, data } = response;

    // valid backend ErrorBody（JSON）
    const parsed = ErrorBodySchema.safeParse(data);
    if (parsed.success) {
      return backendError(parsed.data.error, parsed.data.message, status, error);
    }

    // klines query parse 失敗是已知例外：400 plain-text，非 ErrorBody JSON。
    // 不可泛化成「所有 400 都接受 plain-text」，否則會掩蓋 admin contract drift。
    if (isKlinesPlainTextInvalidParam(error, status, data)) {
      return backendError('invalid_param', data || 'invalid request', status, error);
    }

    // 有 status 但 payload 不符 ErrorBody = backend contract drift
    return localError('contract', 'contract_error', `malformed error payload (status ${status})`, error);
  }

  return localError('unknown', 'unknown_error', 'unknown error', error);
}

/**
 * Contract parse 管線。API 取得 2xx response 後呼叫。
 * Zod parse 失敗代表 backend payload 與 contract drift，歸類為 contract_error。
 */
export function parseContract<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw localError('contract', 'contract_error', 'response did not match contract', result.error);
  }
  return result.data;
}
