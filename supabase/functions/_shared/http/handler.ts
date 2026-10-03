import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fail, type ApiResponse } from './envelope.ts';
import { env, requireEnv } from './env.ts';

const MAX_BODY_BYTES = 32 * 1024;

let cachedClient: SupabaseClient | null = null;

/** Service-role client. Only used inside Edge Functions, never in the browser. */
export function serviceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function allowedOrigins(): string[] {
  return (env('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigins();
  const isAllowed = origin !== null && (allowed.length === 0 ? true : allowed.includes(origin));
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function originAllowed(origin: string | null): boolean {
  if (origin === null) return true; // server-to-server callers (pg_cron, bots)
  const allowed = allowedOrigins();
  return allowed.length === 0 || allowed.includes(origin);
}

/** Verifies the bearer JWT and returns the authenticated user id (never from the body). */
export async function verifyJwt(req: Request, client: SupabaseClient): Promise<string | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Fixed-window rate limit backed by the rate_limits table.
 * Returns true when the request is allowed.
 */
export async function checkRateLimit(
  client: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await client.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail open on infra errors but log; do not lock players out of the game.
    console.error('rate limit check failed', error.message);
    return true;
  }
  return data === true;
}

export interface HandlerContext {
  req: Request;
  client: SupabaseClient;
  userId: string | null;
  body: unknown;
}

/**
 * Wraps an Edge Function handler with CORS, body parsing, JWT verification,
 * size limits, and a catch-all error boundary that returns friendly copy.
 */
export function createHandler<T>(
  name: string,
  options: { requireAuth?: boolean } = {},
  handler: (ctx: HandlerContext) => Promise<ApiResponse<T>>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const headers = corsHeaders(origin);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (req.method !== 'POST') {
      return new Response(JSON.stringify(fail('INVALID_INPUT')), {
        status: 405,
        headers,
      });
    }
    if (!originAllowed(origin)) {
      return new Response(JSON.stringify(fail('UNAUTHORIZED')), { status: 403, headers });
    }

    let body: unknown = {};
    try {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) {
        return new Response(JSON.stringify(fail('INVALID_INPUT')), { status: 413, headers });
      }
      body = text ? JSON.parse(text) : {};
    } catch {
      return new Response(JSON.stringify(fail('INVALID_INPUT')), { status: 400, headers });
    }

    const client = serviceClient();
    const started = Date.now();
    try {
      const userId = await verifyJwt(req, client);
      if (options.requireAuth && !userId) {
        return new Response(JSON.stringify(fail('UNAUTHORIZED')), { status: 401, headers });
      }
      const ctx: HandlerContext = { req, client, userId, body };
      const result = await handler(ctx);
      return new Response(JSON.stringify(result), { status: 200, headers });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[${name}]`, detail, { durationMs: Date.now() - started });
      return new Response(JSON.stringify(fail('SERVER_ERROR')), { status: 500, headers });
    }
  };
}
