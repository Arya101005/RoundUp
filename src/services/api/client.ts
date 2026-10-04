import { errorMessage, type ErrorCode } from '@shared/errors/codes';
import {
  ensureSession,
  supabaseConfigured,
  supabasePublishableKey,
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

/**
 * Where the function handlers are served. Defaults to the same-origin
 * `/api/functions` adapter — the Vite dev/preview servers mount it locally
 * and Vercel serves it from `api/functions/[name].ts` — so the app works out
 * of the box. Set VITE_FUNCTIONS_BASE (e.g.
 * `https://<ref>.supabase.co/functions/v1`) to call the Supabase gateway
 * directly instead.
 */
function functionsBase(): string {
  const override = import.meta.env.VITE_FUNCTIONS_BASE;
  if (override && override.length > 0) return override.replace(/\/$/, '');
  return '/api/functions';
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
    res = await fetch(`${functionsBase()}/${name}`, {
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
