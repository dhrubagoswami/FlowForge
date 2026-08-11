// Thin fetch wrapper: resolves the API base URL once and turns non-2xx responses into thrown ApiRequestError.
import type { ApiError } from '@flowforge/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body?.error.code ?? 'UNKNOWN_ERROR', body?.error.message ?? `Request to ${path} failed with status ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

/** POSTs a JSON body and returns the parsed response for ANY status code — the caller decides what a
 * non-2xx status means (some endpoints, like /api/ai/compose, return a documented non-ApiError shape
 * on specific status codes rather than a request failure). Use apiPostOrThrow for the common case. */
export async function apiPostRaw<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(new URL(path, API_BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(new URL(path, API_BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, errorBody?.error.code ?? 'UNKNOWN_ERROR', errorBody?.error.message ?? `Request to ${path} failed with status ${res.status}.`);
  }
  return res.json() as Promise<T>;
}
