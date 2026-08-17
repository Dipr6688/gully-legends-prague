import {
  createEmptyCareerProgressionState,
  mergePlayersWithCareerState,
  type CareerProgressionState,
  type PlayerCareerStats
} from "../career-store";
import { activePlayers } from "../data/players";
import {
  getLeaderboardEntries,
  getLeaderboardSummary,
  type LeaderboardCategory
} from "../leaderboard";
import {
  getCurrentMonthKey,
  getMonthlyBeastSummary,
  type MonthlyBeastCategory
} from "../monthly-beasts";
import type {
  BowlingOver,
  DismissalEvent,
  MatchRecord,
  PlayerMatchPerformance,
  TeamMatchData
} from "../types/match";
import type { Player, PlayerPlayStyle, PlayerTag } from "../types/player";
import type {
  PublicReadCheckResult,
  SupabaseCareerStatsRow,
  SupabaseGalleryPhotoRow,
  SupabaseMatchRow,
  SupabaseMatchStatApplicationRow,
  SupabaseMonthlyBeastCrownRow,
  SupabasePlayerRow
} from "../supabase/read-repositories";

export const SUPABASE_DATA_CHECK_EXPECTED_COUNTS = {
  players: 21,
  matches: 6,
  demoMatches: 6,
  careerRecords: 21,
  progressionRecords: 52,
  monthlyBeastCrowns: 0,
  galleryMetadata: 0
} as const;

const leaderboardCategories: LeaderboardCategory[] = [
  "runs",
  "wickets",
  "catches",
  "strikeRate",
  "economy",
  "sixes",
  "boundaries",
  "ducks",
  "xp",
  "level"
];

const monthlyBeastCategories: MonthlyBeastCategory[] = [
  "batting",
  "bowling",
  "fielding"
];

const careerNumericFields = [
  "matches",
  "innings_batted",
  "runs",
  "fifties",
  "centuries",
  "dismissed_ducks",
  "wickets",
  "catches",
  "run_outs",
  "stumpings",
  "hat_tricks",
  "three_wicket_hauls",
  "matches_bowled",
  "completed_overs",
  "total_runs_conceded",
  "total_xp",
  "level"
] as const satisfies Array<keyof SupabaseCareerStatsRow>;

export type SupabaseDataSnapshot = {
  players: SupabasePlayerRow[];
  matches: SupabaseMatchRow[];
  careerStats: SupabaseCareerStatsRow[];
  matchStatApplications: SupabaseMatchStatApplicationRow[];
  monthlyBeastCrowns: SupabaseMonthlyBeastCrownRow[];
  galleryPhotos: SupabaseGalleryPhotoRow[];
};

export type CountCheck = {
  label: string;
  expected: number;
  found: number;
  ok: boolean;
};

export type ValidationSummary = {
  ok: boolean;
  issues: string[];
};

export type MatchPayloadValidation = ValidationSummary & {
  valid: number;
  total: number;
  matches: MatchRecord[];
};

export type DemoFlagValidation = ValidationSummary & {
  demo: number;
  total: number;
};

export type CareerStatsValidation = ValidationSummary & {
  sampleRows: Array<{
    playerId: string;
    playerName: string;
    matches: number;
    runs: number;
    wickets: number;
    catches: number;
    xp: number;
    level: number;
  }>;
};

export type ProgressionLedgerValidation = ValidationSummary & {
  records: number;
  orphaned: number;
  duplicateIdempotencyKeys: number;
  duplicateLogicalApplications: number;
};

export type MonthlyBeastDiagnostic = {
  monthKey: string;
  summaries: Array<{
    category: MonthlyBeastCategory;
    leaders: string;
    xp: number;
  }>;
  usesExistingEngine: true;
};

export type HallOfLegendsDiagnostic = {
  summaries: Array<{
    category: LeaderboardCategory;
    leaders: string;
    value: string;
  }>;
  usesExistingEngine: true;
};

export type SupabaseDataCheckResult = {
  counts: CountCheck[];
  playerValidation: ValidationSummary;
  matchPayload: MatchPayloadValidation;
  demoFlags: DemoFlagValidation;
  careerStats: CareerStatsValidation;
  progressionLedger: ProgressionLedgerValidation;
  monthlyBeast: MonthlyBeastDiagnostic;
  hallOfLegends: HallOfLegendsDiagnostic;
  publicRls: PublicReadCheckResult[];
  ok: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPlayerPlayStyleArray(value: unknown): value is PlayerPlayStyle[] {
  const allowed = new Set(["batting", "pace", "spin", "utility"]);

  return isStringArray(value) && value.every((item) => allowed.has(item));
}

function isPlayerTagArray(value: unknown): value is PlayerTag[] {
  const allowed = new Set(["pace", "spin", "batting", "fielding", "all-rounder"]);

  return isStringArray(value) && value.every((item) => allowed.has(item));
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getCanonicalPlayerIds(): Set<string> {
  return new Set(activePlayers.map((player) => player.id));
}

export function validateSupabasePlayers(players: SupabasePlayerRow[]): ValidationSummary {
  const canonicalPlayerIds = getCanonicalPlayerIds();
  const seen = new Set<string>();
  const issues: string[] = [];

  for (const player of players) {
    if (!canonicalPlayerIds.has(player.id)) {
      issues.push(`Player ${player.id} is not in the canonical roster.`);
    }

    if (seen.has(player.id)) {
      issues.push(`Duplicate player row for ${player.id}.`);
    }

    seen.add(player.id);
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function collectPerformancePlayerIds(performance: PlayerMatchPerformance): string[] {
  return [performance.playerId].filter(Boolean);
}

function collectOverPlayerIds(over: BowlingOver): string[] {
  return [
    over.bowlerId,
    ...over.dismissals.flatMap((dismissal: DismissalEvent) => [
      dismissal.dismissedBatterId,
      dismissal.creditedBowlerId ?? "",
      dismissal.fielderId ?? ""
    ])
  ].filter(Boolean);
}

function collectTeamPlayerIds(team: TeamMatchData): string[] {
  return [
    ...team.playerIds,
    ...team.playerPerformances.flatMap(collectPerformancePlayerIds),
    ...team.bowlingOvers.flatMap(collectOverPlayerIds)
  ];
}

function collectMatchPlayerIds(match: MatchRecord): string[] {
  return [
    match.sharedPlayerId ?? "",
    ...(match.fieldingHelperIds ?? []),
    ...collectTeamPlayerIds(match.teams.teamA),
    ...collectTeamPlayerIds(match.teams.teamB),
    ...match.innings.first.battingPerformances.flatMap(collectPerformancePlayerIds),
    ...match.innings.first.bowlingOvers.flatMap(collectOverPlayerIds),
    ...match.innings.second.battingPerformances.flatMap(collectPerformancePlayerIds),
    ...match.innings.second.bowlingOvers.flatMap(collectOverPlayerIds),
    ...(match.finalisedPlayerRecords ?? []).flatMap(collectPerformancePlayerIds)
  ].filter(Boolean);
}

function isMatchRecordPayload(value: unknown): value is MatchRecord {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.matchDate !== "string") return false;
  if (typeof value.matchName !== "string") return false;
  if (typeof value.venue !== "string") return false;
  if (typeof value.status !== "string") return false;
  if (!isRecord(value.teams)) return false;
  if (!isRecord(value.teams.teamA) || !isRecord(value.teams.teamB)) return false;
  if (!isRecord(value.innings)) return false;
  if (!isRecord(value.innings.first) || !isRecord(value.innings.second)) return false;
  if (!isRecord(value.result)) return false;

  return true;
}

export function validateSupabaseMatchPayload(
  row: SupabaseMatchRow,
  canonicalPlayerIds = getCanonicalPlayerIds()
): {
  match: MatchRecord | null;
  issues: string[];
} {
  const issues: string[] = [];

  if (!isMatchRecordPayload(row.payload)) {
    return {
      match: null,
      issues: [`Match ${row.id} payload is not a valid MatchRecord object.`]
    };
  }

  const match = row.payload;

  if (match.id !== row.id) {
    issues.push(`Match ${row.id} payload.id is ${match.id}.`);
  }

  if (match.status !== row.status) {
    issues.push(`Match ${row.id} payload status ${match.status} does not match row status ${row.status}.`);
  }

  if (row.match_sequence !== null && (!Number.isInteger(row.match_sequence) || row.match_sequence <= 0)) {
    issues.push(`Match ${row.id} has invalid match_sequence.`);
  }

  if (!Number.isFinite(Number(match.innings.first.runs))) {
    issues.push(`Match ${row.id} first innings score cannot be read.`);
  }

  if (!Number.isFinite(Number(match.innings.second.runs))) {
    issues.push(`Match ${row.id} second innings score cannot be read.`);
  }

  for (const playerId of collectMatchPlayerIds(match)) {
    if (!canonicalPlayerIds.has(playerId)) {
      issues.push(`Match ${row.id} references unknown player ${playerId}.`);
    }
  }

  return {
    match,
    issues
  };
}

function validateMatchPayloads(rows: SupabaseMatchRow[]): MatchPayloadValidation {
  const issues: string[] = [];
  const matches: MatchRecord[] = [];

  for (const row of rows) {
    const result = validateSupabaseMatchPayload(row);

    issues.push(...result.issues);

    if (result.match && result.issues.length === 0) {
      matches.push(result.match);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    valid: matches.length,
    total: rows.length,
    matches
  };
}

function validateDemoFlags(rows: SupabaseMatchRow[]): DemoFlagValidation {
  const issues = rows
    .filter((row) => !row.is_demo)
    .map((row) => `Match ${row.id} is not marked is_demo = true.`);

  return {
    ok: issues.length === 0,
    issues,
    demo: rows.filter((row) => row.is_demo).length,
    total: rows.length
  };
}

export function validateCareerStatsRows(
  rows: SupabaseCareerStatsRow[],
  playerIds = getCanonicalPlayerIds()
): CareerStatsValidation {
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!playerIds.has(row.player_id)) {
      issues.push(`Career row references unknown player ${row.player_id}.`);
    }

    if (seen.has(row.player_id)) {
      issues.push(`Duplicate career row for ${row.player_id}.`);
    }

    seen.add(row.player_id);

    for (const field of careerNumericFields) {
      const value = Number(row[field]);

      if (!Number.isInteger(value) || value < 0) {
        issues.push(`Career row ${row.player_id} has invalid ${field}.`);
      }
    }
  }

  const nameById = new Map(activePlayers.map((player) => [player.id, player.name]));

  return {
    ok: issues.length === 0,
    issues,
    sampleRows: rows.slice(0, 8).map((row) => ({
      playerId: row.player_id,
      playerName: nameById.get(row.player_id) ?? row.player_id,
      matches: row.matches,
      runs: row.runs,
      wickets: row.wickets,
      catches: row.catches,
      xp: row.total_xp,
      level: row.level
    }))
  };
}

export function validateProgressionLedgerRows({
  rows,
  matchIds,
  playerIds
}: {
  rows: SupabaseMatchStatApplicationRow[];
  matchIds: Set<string>;
  playerIds: Set<string>;
}): ProgressionLedgerValidation {
  const issues: string[] = [];
  const idempotencyKeys = new Set<string>();
  const logicalKeys = new Set<string>();
  let orphaned = 0;
  let duplicateIdempotencyKeys = 0;
  let duplicateLogicalApplications = 0;

  for (const row of rows) {
    if (!matchIds.has(row.match_id) || !playerIds.has(row.player_id)) {
      orphaned += 1;
      issues.push(`Progression ${row.idempotency_key} has an orphaned match/player reference.`);
    }

    if (idempotencyKeys.has(row.idempotency_key)) {
      duplicateIdempotencyKeys += 1;
      issues.push(`Duplicate idempotency key ${row.idempotency_key}.`);
    }

    idempotencyKeys.add(row.idempotency_key);

    const logicalKey = `${row.match_id}:${row.player_id}`;

    if (logicalKeys.has(logicalKey)) {
      duplicateLogicalApplications += 1;
      issues.push(`Duplicate logical progression ${logicalKey}.`);
    }

    logicalKeys.add(logicalKey);

    if (!isRecord(row.xp_breakdown)) {
      issues.push(`Progression ${row.idempotency_key} has malformed XP breakdown.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    records: rows.length,
    orphaned,
    duplicateIdempotencyKeys,
    duplicateLogicalApplications
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

function playerFromSupabaseRow(row: SupabasePlayerRow): Player {
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
    accent: row.accent === "green" || row.accent === "orange" || row.accent === "yellow" || row.accent === "violet"
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

function getDiagnosticMonthKey(matches: MatchRecord[]): string {
  const latestMatch = [...matches].sort((left, right) =>
    right.matchDate.localeCompare(left.matchDate)
  )[0];

  return latestMatch?.matchDate.slice(0, 7) ?? getCurrentMonthKey();
}

function buildMonthlyBeastDiagnostic(matches: MatchRecord[]): MonthlyBeastDiagnostic {
  const monthKey = getDiagnosticMonthKey(matches);

  return {
    monthKey,
    summaries: monthlyBeastCategories.map((category) => {
      const summary = getMonthlyBeastSummary({ matches, monthKey, category });

      return {
        category,
        leaders:
          summary.leaders.map((leader) => leader.playerId).join(", ") ||
          "Race not started",
        xp: summary.highestXp
      };
    }),
    usesExistingEngine: true
  };
}

function buildHallOfLegendsDiagnostic({
  players,
  matches,
  careerStats
}: {
  players: SupabasePlayerRow[];
  matches: MatchRecord[];
  careerStats: SupabaseCareerStatsRow[];
}): HallOfLegendsDiagnostic {
  const careerPlayers = mergePlayersWithCareerState(
    players.map(playerFromSupabaseRow),
    buildCareerState(careerStats)
  );

  return {
    summaries: leaderboardCategories.map((category) => {
      const entries = getLeaderboardEntries({
        players: careerPlayers,
        matches,
        category,
        period: "all-time"
      });
      const summary = getLeaderboardSummary({ entries, category });

      return {
        category,
        leaders:
          summary.leaders.map((entry) => entry.player.id).join(", ") ||
          "Race not started",
        value: summary.displayValue
      };
    }),
    usesExistingEngine: true
  };
}

function countChecks(snapshot: SupabaseDataSnapshot): CountCheck[] {
  const demoMatches = snapshot.matches.filter((match) => match.is_demo);

  return [
    {
      label: "Players",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.players,
      found: snapshot.players.length,
      ok: snapshot.players.length === SUPABASE_DATA_CHECK_EXPECTED_COUNTS.players
    },
    {
      label: "Matches",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.matches,
      found: snapshot.matches.length,
      ok: snapshot.matches.length === SUPABASE_DATA_CHECK_EXPECTED_COUNTS.matches
    },
    {
      label: "Demo Matches",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.demoMatches,
      found: demoMatches.length,
      ok: demoMatches.length === SUPABASE_DATA_CHECK_EXPECTED_COUNTS.demoMatches
    },
    {
      label: "Career Records",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.careerRecords,
      found: snapshot.careerStats.length,
      ok: snapshot.careerStats.length === SUPABASE_DATA_CHECK_EXPECTED_COUNTS.careerRecords
    },
    {
      label: "Progression Records",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.progressionRecords,
      found: snapshot.matchStatApplications.length,
      ok:
        snapshot.matchStatApplications.length ===
        SUPABASE_DATA_CHECK_EXPECTED_COUNTS.progressionRecords
    },
    {
      label: "Monthly Beast Crowns",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.monthlyBeastCrowns,
      found: snapshot.monthlyBeastCrowns.length,
      ok:
        snapshot.monthlyBeastCrowns.length ===
        SUPABASE_DATA_CHECK_EXPECTED_COUNTS.monthlyBeastCrowns
    },
    {
      label: "Gallery Metadata",
      expected: SUPABASE_DATA_CHECK_EXPECTED_COUNTS.galleryMetadata,
      found: snapshot.galleryPhotos.length,
      ok: snapshot.galleryPhotos.length === SUPABASE_DATA_CHECK_EXPECTED_COUNTS.galleryMetadata
    }
  ];
}

export function verifySupabaseDataSnapshot({
  snapshot,
  publicRls = []
}: {
  snapshot: SupabaseDataSnapshot;
  publicRls?: PublicReadCheckResult[];
}): SupabaseDataCheckResult {
  const counts = countChecks(snapshot);
  const playerValidation = validateSupabasePlayers(snapshot.players);
  const matchPayload = validateMatchPayloads(snapshot.matches);
  const demoFlags = validateDemoFlags(snapshot.matches);
  const careerStats = validateCareerStatsRows(snapshot.careerStats);
  const progressionLedger = validateProgressionLedgerRows({
    rows: snapshot.matchStatApplications,
    matchIds: new Set(snapshot.matches.map((match) => match.id)),
    playerIds: new Set(snapshot.players.map((player) => player.id))
  });
  const monthlyBeast = buildMonthlyBeastDiagnostic(matchPayload.matches);
  const hallOfLegends = buildHallOfLegendsDiagnostic({
    players: snapshot.players,
    matches: matchPayload.matches,
    careerStats: snapshot.careerStats
  });
  const publicRlsOk = publicRls.every((check) => check.ok);
  const ok = [
    ...counts.map((check) => check.ok),
    playerValidation.ok,
    matchPayload.ok,
    demoFlags.ok,
    careerStats.ok,
    progressionLedger.ok,
    publicRlsOk
  ].every(Boolean);

  return {
    counts,
    playerValidation,
    matchPayload,
    demoFlags,
    careerStats,
    progressionLedger,
    monthlyBeast,
    hallOfLegends,
    publicRls,
    ok
  };
}
