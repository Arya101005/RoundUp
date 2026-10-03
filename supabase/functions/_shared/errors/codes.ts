/**
 * Stable error codes and their friendly copy (Section 17).
 * Functions return `{ error: { code, message } }`; the client maps unknown
 * codes to a generic toast and never shows raw server text.
 */
export const errorMessages = {
  ROOM_NOT_FOUND: 'Room not found.',
  ROOM_ALREADY_STARTED: 'Room has already started.',
  ROOM_FULL: 'Room is full.',
  ROOM_CLOSED: 'This room has closed.',
  NOT_HOST: 'You are not the host.',
  NOT_IN_ROOM: 'You are not in this room.',
  NOT_YOUR_TURN: 'It is not your turn.',
  INVALID_BID: 'Invalid bid.',
  INSUFFICIENT_BUDGET: 'Insufficient budget.',
  BID_TOO_LOW: 'Bid must be at least {amount}.',
  ALREADY_HIGHEST_BID: 'You already hold the highest bid.',
  BIDDING_ENDED: 'Bidding has ended for this item.',
  CLUE_NOT_ONE_WORD: 'That clue must contain exactly one word.',
  CLUE_TOO_CLOSE: 'That clue is too close to the secret word.',
  CLUE_DUPLICATE: 'That clue has already been used this word.',
  CLUE_FORBIDDEN: 'That clue is not allowed for this word.',
  GAME_ENDED: 'Game has ended.',
  NAME_INVALID: 'Name must be 2 to 20 characters.',
  NAME_TAKEN: 'That name is already taken in this room. Try "{suggestion}" instead.',
  NAME_NOT_ALLOWED: 'That name contains characters that are not allowed.',
  DUPLICATE_NAME: 'A player with that name is already here. Try a different one.',
  RATE_LIMITED: 'You are sending messages too quickly.',
  ACTION_RATE_LIMITED: 'Slow down a moment, then try again.',
  INVALID_INPUT: 'Some settings are invalid. Please review them.',
  INVALID_SETTINGS: 'Invalid settings: {message}',
  INVALID_ACTION: 'That action is not available right now.',
  ACTION_EXPIRED: 'Time ran out for that action.',
  WRONG_PHASE: 'That action is not available in this phase.',
  STALE_STATE: 'The game moved on. Please try again.',
  NOT_READY: 'Everyone needs to be ready before the game can start.',
  NEED_EVEN_PLAYERS: 'Needs an even number of players, at least 4.',
  PLAYER_COUNT: 'This game needs between {min} and {max} players.',
  THEME_GAME_MISMATCH: 'This theme does not support the selected game.',
  ALREADY_VOTED: 'You have already voted.',
  CANNOT_SELF_VOTE: 'You cannot vote for yourself.',
  NOT_ENOUGH_CONTENT: 'Could not prepare content for this theme. Try another theme.',
  UNAUTHORIZED: 'Please sign in again.',
  SERVER_ERROR: 'Something went wrong. Please try again.',
  NOT_CONFIGURED: 'The server is not configured yet. Set the Supabase environment variables.',
} as const;

export type ErrorCode = keyof typeof errorMessages;

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Extra context merged into messages with {placeholders}. */
  details?: Record<string, string | number>;
}

export function makeError(code: ErrorCode, details?: Record<string, string | number>): ApiError {
  let message: string = errorMessages[code];
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      message = message.replaceAll(`{${key}}`, String(value));
    }
  }
  return { code, message };
}

export function errorMessage(code: string, details?: Record<string, string | number>): string {
  if (code in errorMessages) {
    return makeError(code as ErrorCode, details).message;
  }
  return errorMessages.SERVER_ERROR;
}

export function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(errorMessages, value);
}
