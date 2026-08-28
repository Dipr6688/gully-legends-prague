import {
  createEmptyCareerProgressionState,
  mergePlayersWithCareerState,
  type CareerProgressionState,
  type PlayerCareerStats
} from "@/lib/career-store";
import type { CrownedMonthlyBeasts, MonthlyBeastWinnerSnapshot } from "@/lib/monthly-beasts";
import type { MatchRecord } from "@/lib/types/match";
import type { Player, PlayerPlayStyle, PlayerTag } from "@/lib/types/player";
import { createSupabaseAnonymousReadClient } from "@/lib/supabase/read-repositories";
import {
  SupabaseCareerStatsRepository,
  SupabaseMatchRepository,
  SupabaseMonthlyBeastCrownRepository,
  SupabasePlayerRepository,
  type SupabaseCareerStatsRow,
  type SupabaseMonthlyBeastCrownRow,
  type SupabasePlayerRow
} from "@/lib/supabase/read-repositories";
import { SupabaseMatchStoryRepository } from "@/lib/supabase/match-story-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSupabaseMatchPayload } from "@/lib/admin/supabase-data-check";

export const PUBLIC_SUPABASE_REVALIDATE_SECONDS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isPlayerPlayStyleArray(value: unknown): value is PlayerPlayStyle[] {
  const allowed = new Set(["batting", "pace", "spin", "utility"]);

  return Array.isArray(value) && value.every((item) => allowed.has(item));
}

function isPlayerTagArray(value: unknown): value is PlayerTag[] {
  const allowed = new Set(["pace", "spin", "batting", "fielding", "all-rounder"]);

  return Array.isArray(value) && value.every((item) => allowed.has(item));
}

function snapshotFromUnknown(value: unknown): MonthlyBeastWinnerSnapshot {
  if (!isRecord(value)) return { playerIds: [], xp: 0 };

  return {
    playerIds: Array.isArray(value.playerIds)
      ? value.playerIds.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    xp: Number.isFinite(Number(value.xp)) ? Number(value.xp) : 0
  };
}

export function playerFromSupabaseRow(row: SupabasePlayerRow): Player {
  const profile = isRecord(row.profile_payload) ? row.profile_payload : {};

  return {
    id: row.id,
    slug: row.slug,
    name: row.display_name,
    cardTitle: row.card_title,
    cardImage: row.card_image,
    role: row.role,
    playStyles: isPlayerPlayStyleArray(row.play_styles) ? row.play_styles : [],
    battingProfile: getString(profile.battingProfile),
    bowlingProfile: getString(profile.bowlingProfile),
    fieldingProfile: getString(profile.fieldingProfile),
    heroSummary: getString(profile.heroSummary),
    specialMoveName: getString(profile.specialMoveName),
    specialMoveDescription: getString(profile.specialMoveDescription),
    funTrait: getString(profile.funTrait),
    avatar: getString(profile.avatar),
    avatarDescription: getString(profile.avatarDescription),
    tags: isPlayerTagArray(row.tags) ? row.tags : [],
    accent:
      row.accent === "green" ||
      row.accent === "orange" ||
      row.accent === "yellow" ||
      row.accent === "violet"
        ? row.accent
        : "green",
    accentColor: row.accent_color ?? "#9cff24",
    isActive: row.is_active,
    level: 0,
    xp: 0,
    ratings: {
      batting: 0,
      bowling: 0,
      fielding: 0
    },
    stats: {
      matches: 0,
      runs: 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    }
  };
}

function careerRowToStats(row: SupabaseCareerStatsRow): PlayerCareerStats {
  return {
    playerId: row.player_id,
    matches: row.matches,
    inningsBatted: row.innings_batted,
    runs: row.runs,
    fifties: row.fifties,
    centuries: row.centuries,
    dismissedDucks: row.dismissed_ducks,
    wickets: row.wickets,
    catches: row.catches,
    runOuts: row.run_outs,
    stumpings: row.stumpings,
    hatTricks: row.hat_tricks,
    threeWicketHauls: row.three_wicket_hauls,
    matchesBowled: row.matches_bowled,
    completedOvers: row.completed_overs,
    totalRunsConceded: row.total_runs_conceded,
    totalXP: row.total_xp,
    level: row.level
  };
}

function buildCareerState(rows: SupabaseCareerStatsRow[]): CareerProgressionState {
  const state = createEmptyCareerProgressionState();

  for (const row of rows) {
    state.playerCareers[row.player_id] = careerRowToStats(row);
  }

  return state;
}

function crownFromSupabaseRow(row: SupabaseMonthlyBeastCrownRow): CrownedMonthlyBeasts {
  return {
    id: row.id,
    monthKey: row.month_key,
    version: row.version,
    status: row.status,
    batting: snapshotFromUnknown(row.batting),
    bowling: snapshotFromUnknown(row.bowling),
    fielding: snapshotFromUnknown(row.fielding),
    crownedAt: row.crowned_at,
    crownedBy: row.crowned_by,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by
  };
}

export type PublicSupabaseReadData = {
  players: Player[];
  careerPlayers: Player[];
  matches: MatchRecord[];
  crownedAwards: CrownedMonthlyBeasts[];
};

export async function loadSupabaseReadData(
  client: SupabaseClient
): Promise<PublicSupabaseReadData> {
  const playerRepository = new SupabasePlayerRepository(client);
  const matchRepository = new SupabaseMatchRepository(client);
  const careerRepository = new SupabaseCareerStatsRepository(client);
  const crownRepository = new SupabaseMonthlyBeastCrownRepository(client);
  const storyRepository = new SupabaseMatchStoryRepository(client);
  const [playerRows, matchRows, careerRows, crownRows, storyRows] = await Promise.all([
    playerRepository.getPlayers(),
    matchRepository.getMatches(),
    careerRepository.getCareerStats(),
    crownRepository.getCrowns(),
    storyRepository.getStories().catch(() => [])
  ]);
  const storyByMatchId = new Map(storyRows.map((story) => [story.matchId, story]));
  const players = playerRows
    .filter((player) => player.is_active)
    .map(playerFromSupabaseRow);
  const matches = matchRows.map((row) => {
    const result = validateSupabaseMatchPayload(row);

    if (!result.match || result.issues.length > 0) {
      throw new Error("Supabase match payload validation failed.");
    }

    return {
      ...result.match,
      isDemo: row.is_demo,
      isDemoTestMatch: row.is_demo && result.match.isDemoTestMatch === true,
      supabaseUpdatedAt: row.updated_at,
      matchNumber: row.match_sequence ?? result.match.matchNumber ?? null,
      matchStory: storyByMatchId.get(row.id) ?? null
    };
  });
  const careerPlayers = mergePlayersWithCareerState(players, buildCareerState(careerRows));

  return {
    players,
    careerPlayers,
    matches,
    crownedAwards: crownRows.map(crownFromSupabaseRow)
  };
}

export async function loadPublicSupabaseReadData(): Promise<PublicSupabaseReadData> {
  return loadSupabaseReadData(createSupabaseAnonymousReadClient());
}
