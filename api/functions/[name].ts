/**
 * Vercel adapter: runs the same Edge Function handlers behind
 * https://YOUR-APP.vercel.app/api/functions/<name>.
 *
 * Used when Supabase Edge Function invocation is unavailable; the handlers,
 * auth, rate limits, and DB access are identical either way. The Node
 * (req, res) signature is converted to the Web Request/Response API the
 * handlers are written against.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import ws from 'ws';
import createRoom from '../../supabase/functions/create-room/index.ts';
import joinRoom from '../../supabase/functions/join-room/index.ts';
import leaveRoom from '../../supabase/functions/leave-room/index.ts';
import updateRoom from '../../supabase/functions/update-room/index.ts';
import sendChat from '../../supabase/functions/send-chat/index.ts';
import getSnapshot from '../../supabase/functions/get-snapshot/index.ts';
import startGame from '../../supabase/functions/start-game/index.ts';
import gameAction from '../../supabase/functions/game-action/index.ts';
import gameTick from '../../supabase/functions/game-tick/index.ts';
import sweeper from '../../supabase/functions/sweeper/index.ts';

// Node < 22 has no global WebSocket; supabase-js needs one just to construct
// its client. The service client never opens a socket on the server side.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = ws;
}

const handlers: Record<string, (req: Request) => Response | Promise<Response>> = {
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

async function readBuffer(req: IncomingMessage): Promise<Buffer> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  const name = segments[segments.length - 1] ?? '';
  const fn = handlers[name];

  if (!fn) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Unknown function.' } }),
    );
    return;
  }

  try {
    const body = await readBuffer(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const method = (req.method ?? 'GET').toUpperCase();
    const request = new Request(`https://${req.headers.host ?? 'localhost'}${path}`, {
      method,
      headers,
      ...(body.length > 0 ? { body: new Uint8Array(body) } : {}),
    });

    const response = await fn(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key !== 'content-encoding' && key !== 'content-length') res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error('vercel adapter error', name, err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
      }),
    );
  }
}
