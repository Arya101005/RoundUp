import { errorMessage, type ErrorCode } from '@shared/errors/codes';
import {
  ensureSession,
  supabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from '@/services/supabase/client';
import { recordServerNow } from '@/services/clock';

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK' | 'NOT_CONFIGURED';
  constructor(code: ErrorCode | 'NETWORK' | 'NOT_CONFIGURED', message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Calls an Edge Function and returns its parsed success payload. */
export async function invokeFunction<T extends object>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabaseConfigured) {
    throw new ApiError('NOT_CONFIGURED', errorMessage('NOT_CONFIGURED'));
  }
  const token = await ensureSession();
  if (!token) {
    throw new ApiError('UNAUTHORIZED', errorMessage('UNAUTHORIZED'));
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabasePublishableKey as string,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Network error. Check your connection and try again.');
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('SERVER_ERROR', errorMessage('SERVER_ERROR'));
  }

  const envelope = payload as { ok?: boolean; serverNow?: number; error?: { code?: string; message?: string } };
  if (typeof envelope.serverNow === 'number') {
    recordServerNow(envelope.serverNow);
  }
  if (!res.ok || envelope.ok !== true) {
    const code = envelope.error?.code;
    if (code && typeof code === 'string') {
      throw new ApiError(code as ErrorCode, envelope.error?.message ?? errorMessage(code));
    }
    throw new ApiError('SERVER_ERROR', errorMessage('SERVER_ERROR'));
  }

  const { serverNow: _ignored, ok: _ok, ...data } = envelope as Record<string, unknown>;
  return data as T;
}
