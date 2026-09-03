"use client";

import { useMemo } from "react";
import { PlayerProfile } from "@/components/players/PlayerProfile";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import { buildPlayerPerformanceTrends } from "@/lib/analytics/player-performance-trends";
import { getAdvancedCareerStatsForPlayer } from "@/lib/advanced-cricket-stats";
import { getPlayerAchievements } from "@/lib/player-achievements";
import { getPlayerProfileNavigation } from "@/lib/player-profile-navigation";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

export function CareerPlayerProfile({
  player,
  players,
  matches: suppliedMatches,
  careerResolved = false
}: {
  player: Player;
  players: Player[];
  matches?: MatchRecord[];
  careerResolved?: boolean;
}) {
  const localCareerPlayers = useCareerPlayers(players);
  const localRepository = useMatchRepository();
  const careerPlayers = careerResolved ? players : localCareerPlayers;
  const matches = suppliedMatches ?? localRepository.matches;
  const careerPlayer =
    careerPlayers.find((candidate) => candidate.id === player.id) ?? player;
  const profileNavigation = useMemo(
    () =>
      getPlayerProfileNavigation({
        players: careerPlayers,
        currentPlayerId: careerPlayer.id
      }),
    [careerPlayers, careerPlayer.id]
  );
  const advancedStats = getAdvancedCareerStatsForPlayer({
    matches,
    playerId: careerPlayer.id
  });
  const performanceTrends = buildPlayerPerformanceTrends({
    matches,
    playerId: careerPlayer.id
  });
  const achievements = getPlayerAchievements({
    player: careerPlayer,
    officialMatches: matches
  });

  return (
    <PlayerProfile
      player={careerPlayer}
      advancedStats={advancedStats}
      achievements={achievements}
      performanceTrends={performanceTrends}
      profileNavigation={profileNavigation}
    />
  );
}
