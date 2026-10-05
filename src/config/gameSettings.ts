import type { GameId } from '@shared/games/types';

export type SettingField =
  | {
      type: 'number';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      description?: string;
    }
  | {
      type: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      description?: string;
    }
  | {
      type: 'switch';
      key: string;
      label: string;
      description?: string;
    };

/** Only settings that are really implemented (Section 11). */
export const gameSettings: Record<GameId, SettingField[]> = {
  imposter: [
    {
      type: 'select',
      key: 'discussionMode',
      label: 'Discussion',
      options: [
        { value: 'free_chat', label: 'Free chat' },
        { value: 'turn_based', label: 'Turn based' },
      ],
    },
    { type: 'number', key: 'discussionSeconds', label: 'Discussion seconds', min: 60, max: 600 },
    { type: 'number', key: 'turnSeconds', label: 'Seconds per statement (5/15/30 s)', min: 5, max: 30 },
    { type: 'number', key: 'laps', label: 'Statement laps', min: 1, max: 3 },
    { type: 'number', key: 'votingSeconds', label: 'Voting seconds', min: 20, max: 120 },
    { type: 'switch', key: 'imposterSeesTheme', label: 'Imposter sees the theme' },
    { type: 'switch', key: 'imposterGuessEnabled', label: 'Imposter can guess when caught' },
    { type: 'number', key: 'guessSeconds', label: 'Guess seconds', min: 15, max: 60 },
  ],
  heads_up: [
    { type: 'number', key: 'turnSeconds', label: 'Seconds per turn (5/15/30 s)', min: 5, max: 30 },
    { type: 'number', key: 'turnsPerPlayer', label: 'Turns per player', min: 1, max: 3 },
    { type: 'number', key: 'guessesPerTurn', label: 'Guesses per turn', min: 1, max: 5 },
  ],
  password: [
    { type: 'number', key: 'clueSeconds', label: 'Clue seconds', min: 15, max: 60 },
    { type: 'number', key: 'guessSeconds', label: 'Guess seconds (10/30 s)', min: 10, max: 45 },
    { type: 'number', key: 'maxClues', label: 'Max clues per word', min: 3, max: 5 },
  ],
  charades: [
    { type: 'number', key: 'performanceSeconds', label: 'Seconds per turn (5/15/30 s)', min: 45, max: 180 },
    { type: 'number', key: 'skips', label: 'Skips per turn', min: 0, max: 3 },
  ],
  blind_ranking: [
    { type: 'number', key: 'rankingSize', label: 'Items per ranking', min: 4, max: 10 },
    { type: 'number', key: 'perItemSeconds', label: 'Seconds per item (5/15/30 s)', min: 10, max: 45 },
  ],
  auction: [
    { type: 'number', key: 'startingBudget', label: 'Starting budget', min: 500, max: 5000, step: 50 },
    { type: 'number', key: 'itemCount', label: 'Items', min: 4, max: 15 },
    { type: 'number', key: 'bidSeconds', label: 'Bid window (s)', description: 'Hard 30 s bid timeout (no bids after time up)', min: 15, max: 60 },
  ],
};
