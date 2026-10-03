import {
  Clapperboard,
  Eye,
  Gavel,
  Hash,
  KeyRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { GameId } from '@shared/games/types';

export const gameIcons: Record<GameId, LucideIcon> = {
  imposter: Users,
  heads_up: Eye,
  password: KeyRound,
  charades: Clapperboard,
  blind_ranking: Hash,
  auction: Gavel,
};

/** Accent token per game (one muted hue, used sparingly per Section 16). */
export const gameAccent: Record<GameId, string> = {
  imposter: '#F4675F',
  heads_up: '#F5B544',
  password: '#3ECF8E',
  charades: '#B48CFF',
  blind_ranking: '#4DD0E1',
  auction: '#FF8A65',
};
