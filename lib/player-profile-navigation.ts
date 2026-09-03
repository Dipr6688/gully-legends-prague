import {
  DEFAULT_PLAYER_BROWSER_OPTIONS,
  getVisiblePlayers
} from "./player-browser";
import type { Player } from "./types/player";

export type PlayerProfileNavigationItem = Pick<
  Player,
  "id" | "name" | "slug"
>;

export type PlayerProfileNavigation = {
  allPlayersHref: "/players";
  previous: PlayerProfileNavigationItem | null;
  next: PlayerProfileNavigationItem | null;
};

export function getPlayerProfileNavigation({
  currentPlayerId,
  players
}: {
  currentPlayerId: string;
  players: Player[];
}): PlayerProfileNavigation {
  const orderedPlayers = getVisiblePlayers({
    players,
    options: DEFAULT_PLAYER_BROWSER_OPTIONS
  });
  const currentIndex = orderedPlayers.findIndex(
    (player) => player.id === currentPlayerId
  );

  return {
    allPlayersHref: "/players",
    previous:
      currentIndex > 0
        ? orderedPlayers[currentIndex - 1]
        : null,
    next:
      currentIndex >= 0 && currentIndex < orderedPlayers.length - 1
        ? orderedPlayers[currentIndex + 1]
        : null
  };
}
