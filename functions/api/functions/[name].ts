/**
 * Cloudflare Pages Function adapter: runs the same Edge Function handlers behind
 * https://<project>.pages.dev/api/functions/<name>.
 *
 * The handlers are already written against the Web Request/Response API, so this
 * is a thin entrypoint — no Node (req, res) shim, and no `ws` polyfill because
 * the Workers runtime provides a global WebSocket. Auth, rate limits, validation,
 * and database access are identical to the Vercel adapter and the Deno runtime.
 *
 * Environment: Workers expose bindings on `context.env`, not `process.env`, so we
 * hand them to the shared `env()` helper via a global before invoking a handler.
 */
import createRoom from '../../../supabase/functions/create-room/index.ts';
import joinRoom from '../../../supabase/functions/join-room/index.ts';
import leaveRoom from '../../../supabase/functions/leave-room/index.ts';
import updateRoom from '../../../supabase/functions/update-room/index.ts';
import sendChat from '../../../supabase/functions/send-chat/index.ts';
import getSnapshot from '../../../supabase/functions/get-snapshot/index.ts';
import startGame from '../../../supabase/functions/start-game/index.ts';
import gameAction from '../../../supabase/functions/game-action/index.ts';
import gameTick from '../../../supabase/functions/game-tick/index.ts';
import sweeper from '../../../supabase/functions/sweeper/index.ts';

type Handler = (req: Request) => Promise<Response>;

const handlers: Record<string, Handler> = {
  'create-room': createRoom,
  'join-room': joinRoom,
  'leave-room': leaveRoom,
  'update-room': updateRoom,
  'send-chat': sendChat,
  'get-snapshot': getSnapshot,
  'start-game': startGame,
  'game-action': gameAction,
  'game-tick': gameTick,
  sweeper,
};

interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
  params: Record<string, string | string[]>;
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const globals = globalThis as { __ROUNDUP_ENV__?: Record<string, unknown> };
  globals.__ROUNDUP_ENV__ = context.env;

  const raw = context.params.name;
  const name = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  const fn = handlers[name];
  if (!fn) {
    return errorResponse(404, 'NOT_FOUND', 'Unknown function.');
  }

  try {
    return await fn(context.request);
  } catch (err) {
    console.error('pages function adapter error', name, err);
    return errorResponse(500, 'SERVER_ERROR', 'Something went wrong. Please try again.');
  }
};
