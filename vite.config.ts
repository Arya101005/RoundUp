import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import ws from 'ws';
import handleFunction from './api/functions/[name].ts';

// Node < 22 has no global WebSocket; supabase-js needs one just to construct
// its service client (which never opens a socket on the server side).
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = ws;
}

type ConnectMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

type MountableServer = { middlewares: { use: (fn: ConnectMiddleware) => unknown } };

/**
 * Serves the Edge Function handlers at /api/functions/<name> from the Vite
 * dev and preview servers (same process, same origin). The handlers, auth,
 * rate limits, and database access are identical to the Supabase gateway and
 * to the Vercel adapter, so local development needs no extra infrastructure.
 */
function localFunctionsPlugin(): Plugin {
  // The handlers read secrets and URLs from process.env (see _shared/http/env.ts).
  const envFile = join(process.cwd(), '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 1 || line.startsWith('#')) continue;
      const key = line.slice(0, i).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(i + 1).trim();
    }
  }

  const mount = (server: MountableServer) => {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '').split('?')[0] ?? '';
      if (!path.startsWith('/api/functions/')) {
        next();
        return;
      }
      void handleFunction(req, res).catch((err: unknown) => {
        console.error('local functions middleware error', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
            }),
          );
        }
      });
    });
  };

  return {
    name: 'roundup-local-functions',
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig({
  plugins: [react(), localFunctionsPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // No sourcemaps in the shipped bundle to keep the artifact small.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
