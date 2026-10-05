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

/**
 * Every failed function call is logged to the browser DevTools console with a
 * `[roundup:<fn>]` prefix. In production (Vercel) the server-side stack trace
 * lives in the platform logs, so this is the only copy a player can see — it
 * makes room-creation and in-game failures diagnosable from the browser alone.
 */
function logFailure(name: string, fields: Record<string, unknown>): void {
  const parts = [
    fields.status !== undefined ? `HTTP ${String(fields.status)}` : null,
    typeof fields.code === 'string' ? fields.code : null,
    typeof fields.message === 'string' ? fields.message : null,
    typeof fields.reason === 'string' ? fields.reason : null,
  ].filter((p): p is string => p !== null);
  // One readable line, plus the full object for DevTools inspection.
  console.error(`[roundup:${name}] ${parts.join(' | ') || 'call failed'}`, fields);
}

/** Calls an Edge Function and returns its parsed success payload. */
export async function invokeFunction<T extends object>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabaseConfigured) {
    logFailure(name, { reason: 'not-configured', message: errorMessage('NOT_CONFIGURED') });
    throw new ApiError('NOT_CONFIGURED', errorMessage('NOT_CONFIGURED'));
  }
  const token = await ensureSession();
  if (!token) {
    logFailure(name, { reason: 'no-session', message: 'Anonymous sign-in returned no session.' });
    throw new ApiError('UNAUTHORIZED', errorMessage('UNAUTHORIZED'));
  }

  const url = `${functionsBase()}/${name}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabasePublishableKey as string,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logFailure(name, {
      url,
      reason: 'network',
      message: err instanceof Error ? err.message : String(err),
    });
    throw new ApiError('NETWORK', 'Network error. Check your connection and try again.');
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    logFailure(name, { url, reason: 'non-json', status: res.status });
    throw new ApiError('SERVER_ERROR', errorMessage('SERVER_ERROR'));
  }

  const envelope = payload as { ok?: boolean; serverNow?: number; error?: { code?: string; message?: string } };
  if (typeof envelope.serverNow === 'number') {
    recordServerNow(envelope.serverNow);
  }
  if (!res.ok || envelope.ok !== true) {
    const code = envelope.error?.code;
    if (code && typeof code === 'string') {
      logFailure(name, {
        url,
        status: res.status,
        code,
        message: envelope.error?.message ?? errorMessage(code),
      });
      throw new ApiError(code as ErrorCode, envelope.error?.message ?? errorMessage(code));
    }
    logFailure(name, { url, status: res.status, code: 'SERVER_ERROR', payload });
    throw new ApiError('SERVER_ERROR', errorMessage('SERVER_ERROR'));
  }

  const { serverNow: _ignored, ok: _ok, ...data } = envelope as Record<string, unknown>;
  return data as T;
}
