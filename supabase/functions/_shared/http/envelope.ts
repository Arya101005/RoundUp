import { makeError, type ErrorCode } from '../errors/codes.ts';

/** Success/failure response envelopes shared by every function. */
export interface ApiFailure {
  ok: false;
  serverNow?: number;
  error: { code: ErrorCode; message: string };
}

export type ApiResponse<T> = ({ ok: true; serverNow: number } & T) | ApiFailure;

export function ok<T extends object>(data: T, serverNow: number): ApiResponse<T> {
  return { ok: true, serverNow, ...data };
}

export function fail(
  code: ErrorCode,
  details?: Record<string, string | number>,
  serverNow?: number,
): ApiFailure {
  const err = makeError(code, details);
  return { ok: false, ...(serverNow !== undefined ? { serverNow } : {}), error: err };
}

export function isFailure<T>(res: ApiResponse<T>): res is ApiFailure {
  return res.ok === false;
}
