import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { sanitizeChatBody } from '../_shared/validation/sanitize.ts';

const schema = z.object({
  roomId: z.string().uuid(),
  body: z.string().min(1).max(400),
  channel: z.enum(['room', 'team']).optional(),
});

const CHAT_RATE = { max: 5, windowSeconds: 5 };

interface SessionRow {
  id: string;
  status: string;
}

export default createHandler('send-chat', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('INVALID_INPUT', undefined, now);

  const allowed = await checkRateLimit(
    client,
    `chat:${userId}`,
    CHAT_RATE.max,
    CHAT_RATE.windowSeconds,
  );
  if (!allowed) return fail('RATE_LIMITED', undefined, now);

  const clean = sanitizeChatBody(parsed.data.body);
  if (!clean.ok) {
    return fail(clean.reason === 'length' ? 'INVALID_INPUT' : 'INVALID_INPUT', undefined, now);
  }

  // Membership check via RLS helper (service role bypasses RLS, so check explicitly).
  const { data: membership } = await client
    .from('room_players')
    .select('id, display_name, team_id, left_at')
    .eq('room_id', parsed.data.roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership || (membership as { left_at: string | null }).left_at) {
    return fail('NOT_IN_ROOM', undefined, now);
  }
  const member = membership as { id: string; display_name: string; team_id: string | null };

  const { data: sessionRow } = await client
    .from('game_sessions')
    .select('id, status')
    .eq('room_id', parsed.data.roomId)
    .in('status', ['preparing', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const session = (sessionRow ?? null) as SessionRow | null;
  const channel = parsed.data.channel ?? 'room';

  // Lobby rules: only the room channel exists before the game starts.
  if (!session) {
    if (channel !== 'room') {
      return fail('INVALID_INPUT', undefined, now);
    }
  }

  // During a game, engine-specific chat rules apply (kind, channel, turn state).
  // That validation runs inside game-action side effects; here we enforce the
  // channel a player may write to and let engine.validateChat gate the text.
  const { data: inserted, error } = await client
    .from('chat_messages')
    .insert({
      room_id: parsed.data.roomId,
      session_id: session?.id ?? null,
      channel: session && channel === 'team' ? 'team' : 'room',
      team_id: channel === 'team' ? member.team_id : null,
      sender_id: userId,
      sender_name: member.display_name,
      kind: 'chat',
      body: clean.value,
    })
    .select('*')
    .single();

  if (error || !inserted) {
    console.error('send-chat insert failed', error?.message);
    return fail('SERVER_ERROR', undefined, now);
  }

  return ok({ message: inserted }, Date.now());
});
