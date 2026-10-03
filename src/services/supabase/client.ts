import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);
export { url as supabaseUrl, publishableKey as supabasePublishableKey };

let client: SupabaseClient | null = null;
let sessionPromise: Promise<string | null> | null = null;

/** Returns the shared client, or null when env vars are missing. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) {
    client = createClient(url as string, publishableKey as string, {
      auth: { persistSession: true, storageKey: 'roundup.auth', autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * Ensures an anonymous Supabase session exists (guest identity, persisted
 * across refresh) and returns the current access token.
 */
export async function ensureSession(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session.access_token;
      const { data: signedIn, error } = await supabase.auth.signInAnonymously();
      if (error || !signedIn.session) {
        sessionPromise = null;
        return null;
      }
      return signedIn.session.access_token;
    })();
  }
  const token = await sessionPromise;
  if (!token) sessionPromise = null;
  return token;
}

export async function currentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  await ensureSession();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
