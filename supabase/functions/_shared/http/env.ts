/**
 * Edge Function HTTP helpers. Pure web APIs (Request/Response/fetch) so the
 * code typechecks under TypeScript and runs on the Deno Edge Runtime.
 * Deno globals are accessed lazily through globalThis to keep this portable.
 */

interface DenoLike {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
}

export function denoRuntime(): DenoLike {
  const runtime = (globalThis as { Deno?: DenoLike }).Deno;
  if (!runtime) {
    throw new Error('Deno runtime not available');
  }
  return runtime;
}

export function env(name: string): string | undefined {
  try {
    const value = denoRuntime().env.get(name);
    if (value !== undefined) return value;
  } catch {
    // Not on the Deno Edge Runtime (e.g. the Vercel adapter); fall through.
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function serve(handler: (req: Request) => Response | Promise<Response>): void {
  denoRuntime().serve(handler);
}
