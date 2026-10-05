import type { GameId, GameMeta } from './types.ts';

/**
 * The single registry of game metadata. Game ids are enumerated only in
 * types.ts; the generic game manager reads everything from here.
 */
export const gameRegistry: Record<GameId, GameMeta> = {
  imposter: {
    id: 'imposter',
    name: 'Imposter',
    mode: 'ffa',
    minPlayers: 3,
    maxPlayers: 12,
    evenPlayersOnly: false,
    timer: true,
    description: 'One player is the imposter. Discuss in turns, then vote for the player you suspect.',
    rulesSummary: [
      'Everyone sees the same secret word except the imposter.',
      'Turn-based discussion: each player speaks in turn, 15 s a time.',
      'The host ends discussion, then the room votes for the imposter.',
      'A strict plurality is caught; ties catch nobody.',
      'A caught imposter can still guess the secret word.',
    ],
    rounds: { min: 1, max: 10, default: 3 },
  },
  heads_up: {
    id: 'heads_up',
    name: 'Heads Up',
    mode: 'individual',
    minPlayers: 3,
    maxPlayers: 10,
    evenPlayersOnly: false,
    timer: true,
    description: 'Guess your word without seeing it. Everyone else knows your word and answers your questions.',
    rulesSummary: [
      'Each player has a private word they cannot see.',
      'Ask yes/no questions in the chat, then guess.',
      'Wrong guesses cost points; the fastest solvers earn bonuses.',
    ],
    rounds: { min: 1, max: 10, default: 3 },
  },
  password: {
    id: 'password',
    name: 'Password',
    mode: 'teams',
    minPlayers: 4,
    maxPlayers: 10,
    evenPlayersOnly: true,
    timer: true,
    description: 'Two teams. One clue giver, one word. Give a single-word clue and guess it.',
    rulesSummary: [
      'Two teams alternate word turns.',
      'Only the clue giver sees the word; they give one single-word clue.',
      'Guessers submit guesses; first correct solve scores the most points.',
      'Clues cannot be the word, a variation of it, or on its forbidden list.',
    ],
    rounds: { min: 1, max: 10, default: 3 },
  },
  charades: {
    id: 'charades',
    name: 'Charades',
    mode: 'teams',
    minPlayers: 4,
    maxPlayers: 10,
    evenPlayersOnly: true,
    timer: true,
    description:
      'One performer acts it out, teammates guess. Played over your group video call or in person.',
    rulesSummary: [
      'Teams alternate; the performer rotates within the team.',
      'Only teammates may guess. Act over your group video call or in person.',
      'Skips cost points. Faster solves score more.',
    ],
    rounds: { min: 1, max: 10, default: 3 },
  },
  blind_ranking: {
    id: 'blind_ranking',
    name: 'Blind Ranking',
    mode: 'individual',
    minPlayers: 2,
    maxPlayers: 12,
    evenPlayersOnly: false,
    timer: true,
    description:
      'Items arrive one at a time. Place each into your ranking without knowing what comes next.',
    rulesSummary: [
      'A criterion is announced first, for example population, highest first.',
      'Items appear one at a time; place each before the timer runs out.',
      'Your ranking is scored against the true reference ranking.',
    ],
    rounds: { min: 1, max: 5, default: 1 },
  },
  auction: {
    id: 'auction',
    name: 'Auction',
    mode: 'individual',
    minPlayers: 2,
    maxPlayers: 10,
    evenPlayersOnly: false,
    // Auction's clock is the hard bid window inside the bidding phase, shown
    // by the stage itself, so the header shows "Round" rather than a clock.
    timer: false,
    description: 'Bid your budget on hidden-value items. Best collection of value wins.',
    rulesSummary: [
      'Everyone starts with the same public budget.',
      'Items are sold one at a time; the highest bid before the window closes wins the lot.',
      'Reference values are revealed at the end and decide the score.',
    ],
    rounds: { min: 1, max: 5, default: 1 },
  },
};

export function getGameMeta(id: GameId): GameMeta {
  return gameRegistry[id];
}
