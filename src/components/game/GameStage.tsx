/** Dispatches to the stage screen for the active game. */
import { ImposterStage } from '@/components/game/ImposterStage';
import { HeadsUpStage } from '@/components/game/HeadsUpStage';
import { PasswordStage } from '@/components/game/PasswordStage';
import { CharadesStage } from '@/components/game/CharadesStage';
import { RankingStage } from '@/components/game/RankingStage';
import { AuctionStage } from '@/components/game/AuctionStage';
import type { StageContext } from '@/components/game/stage-context';

export function GameStage({ ctx }: { ctx: StageContext }) {
  switch (ctx.gameId) {
    case 'imposter':
      return <ImposterStage ctx={ctx} />;
    case 'heads_up':
      return <HeadsUpStage ctx={ctx} />;
    case 'password':
      return <PasswordStage ctx={ctx} />;
    case 'charades':
      return <CharadesStage ctx={ctx} />;
    case 'blind_ranking':
      return <RankingStage ctx={ctx} />;
    case 'auction':
      return <AuctionStage ctx={ctx} />;
    default:
      return null;
  }
}