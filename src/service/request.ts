import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { normalizeHttpError } from '@/service/error';

export interface RequestConfig<TData = unknown, TParams = unknown> {
  url: string;
  method: Method;
  headers?: AxiosRequestConfig<TData>['headers'];
  params?: TParams;
  data?: TData;
  signal?: AbortSignal;
  responseType?: AxiosRequestConfig<TData>['responseType'];
}

/**
 * Same-origin HTTP transport。
 *
 * 只處理 transport 與 rejected response normalization：
 * - 不保存 token，不碰 Pinia / Router / UI。
 * - 不自行建立 AbortController；呼叫端可直接透傳 TanStack Query 的 signal。
 * - 2xx payload 的 Zod parse 由 domain API boundary 負責。
 */
const http = axios.create({
  timeout: 30000
});

http.interceptors.response.use(
  response => response,
  (error: unknown) => Promise.reject(normalizeHttpError(error))
);

export async function request<TResponse, TData = unknown, TParams = unknown>(
  config: RequestConfig<TData, TParams>
): Promise<TResponse> {
  const response = await http.request<TResponse>({
    ...config
  });
  return response.data;
}
