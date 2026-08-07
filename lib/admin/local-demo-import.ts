import {
  CAREER_PROGRESS_STORAGE_KEY,
  applyFinalisedMatchToCareerStats,
  type AppliedPlayerMatchProgression,
  type CareerProgressionState,
  createEmptyCareerProgressionState,
  createEmptyPlayerCareerStats,
  type PlayerCareerStats
} from "../career-store";
import { activePlayers } from "../data/players";
import { MATCH_HISTORY_STORAGE_KEY } from "../match-history-store";
import {
  LEGACY_MONTHLY_BEASTS_STORAGE_KEY,
  MONTHLY_BEASTS_STORAGE_KEY
} from "../monthly-beasts-store";
import type {
  MonthlyBeastCategory,
  MonthlyBeastCrown,
  MonthlyBeastWinnerSnapshot
} from "../monthly-beasts";
import {
  getFinalisedMatchesForMonth,
  getMonthlyBeastSummary
} from "../monthly-beasts";
import type { MatchRecord, MatchStatus } from "../types/match";
import type { Player } from "../types/player";

export const EXPECTED_LOCAL_DEMO_MATCH_COUNT = 6;
export const IMPORT_DEMO_CONFIRMATION_PHRASE = "IMPORT DEMO";

const allowedMatchStatuses = new Set<MatchStatus>([
  "draft",
  "in_progress",
  "finalised",
  "abandoned",
  "cancelled"
]);

export type LocalStorageReader = {
  getItem(key: string): string | null;
};

export type PlayerImportRow = {
  id: string;
  slug: string;
  display_name: string;
  card_title: string;
  role: string;
  card_image: string;
  play_styles: string[];
  tags: string[];
  profile_payload: Record<string, unknown>;
  accent: string;
  accent_color: string;
  is_active: boolean;
};

export type MatchImportRow = {
  id: string;
  match_date: string;
  start_time: string | null;
  match_sequence: number | null;
  name: string;
  venue: string;
  status: MatchStatus;
  is_demo: true;
  payload: MatchRecord;
  finalised_at: string | null;
  stats_applied_at: string | null;
  deleted_at: string | null;
};

export type CareerImportRow = {
  player_id: string;
  matches: number;
  innings_batted: number;
  runs: number;
  fifties: number;
  centuries: number;
  dismissed_ducks: number;
  wickets: number;
  catches: number;
  run_outs: number;
  stumpings: number;
  hat_tricks: number;
  three_wicket_hauls: number;
  matches_bowled: number;
  completed_overs: number;
  total_runs_conceded: number;
  total_xp: number;
  level: number;
  stats_payload: Record<string, unknown>;
};

export type MatchStatApplicationImportRow = {
  match_id: string;
  player_id: string;
  idempotency_key: string;
  xp_breakdown: AppliedPlayerMatchProgression["xpBreakdown"];
  applied_at: string;
  finalisation_version: number;
};

export type MonthlyBeastCrownImportRow = {
  id: string;
  month_key: string;
  version: number;
  status: "active" | "revoked";
  batting: MonthlyBeastWinnerSnapshot;
  bowling: MonthlyBeastWinnerSnapshot;
  fielding: MonthlyBeastWinnerSnapshot;
  is_demo: true;
  crowned_at: string;
  crowned_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type LocalDemoImportPayload = {
  players: PlayerImportRow[];
  matches: MatchImportRow[];
  careerStats: CareerImportRow[];
  matchStatApplications: MatchStatApplicationImportRow[];
  monthlyBeastCrowns: MonthlyBeastCrownImportRow[];
};

export type LocalDemoImportPreview = {
  players: number;
  demoMatches: number;
  careerRecords: number;
  progressionRecords: number;
  monthlyBeastCrowns: number;
};

export type LocalDemoImportStatusMap = {
  players: "VALID";
  demoMatches: "VALID";
  careerRecords: "REBUILT / VALID";
  progressionRecords: "REBUILT / VALID";
  monthlyBeastCrowns: "VALID" | "STALE CROWN EXCLUDED";
};

export type StaleProgressionAuditItem = {
  idempotencyKey: string;
  matchId: string;
  playerId: string;
  referencedMatchExists: boolean;
};

export type CareerComparisonAuditItem = {
  playerId: string;
  playerName: string;
  kind: "missing-local-row" | "different-totals" | "obsolete-local-row";
  localSummary: string;
  rebuiltSummary: string;
};

export type LocalDemoImportAudit = {
  missingCanonicalCareerPlayerIds: string[];
  obsoleteCareerPlayerIds: string[];
  staleProgressions: StaleProgressionAuditItem[];
  staleProgressionsIgnored: number;
  staleProgressionsWithExistingLocalMatches: number;
  staleProgressionsAffectLocalTotals: boolean;
  exactCareerMatches: number;
  differentCareerTotals: number;
  careerDifferences: CareerComparisonAuditItem[];
  monthlyCrownMismatches: string[];
  localMonthlyBeastCrowns: number;
  validMonthlyBeastCrownsForImport: number;
  staleCrownsExcluded: number;
  staleCrownExclusionReasons: string[];
};

export type LocalDemoImportPlan = {
  preview: LocalDemoImportPreview;
  statuses: LocalDemoImportStatusMap;
  audit: LocalDemoImportAudit;
  payload: LocalDemoImportPayload | null;
  errors: string[];
  warnings: string[];
};

type LegacyCrownedMonthlyBeasts = {
  monthKey: string;
  crownedAt: string;
  battingWinners: Array<{ playerId: string; categoryXp: number }>;
  bowlingWinners: Array<{ playerId: string; categoryXp: number }>;
  fieldingWinners: Array<{ playerId: string; categoryXp: number }>;
};

const monthlyBeastCategories: MonthlyBeastCategory[] = [
  "batting",
  "bowling",
  "fielding"
];

function parseStoredJson(key: string, storage: LocalStorageReader): unknown {
  const rawValue = storage.getItem(key);

  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  );
}

function isStartTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toNonNegativeInteger(value: unknown, field: string, errors: string[]): number {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    errors.push(`${field} must be a non-negative integer.`);
    return 0;
  }

  return numericValue;
}

function playerImportRow(player: Player): PlayerImportRow {
  return {
    id: player.id,
    slug: player.slug,
    display_name: player.name,
    card_title: player.cardTitle,
    role: player.role,
    card_image: player.cardImage,
    play_styles: [...player.playStyles],
    tags: [...player.tags],
    profile_payload: {
      battingProfile: player.battingProfile,
      bowlingProfile: player.bowlingProfile,
      fieldingProfile: player.fieldingProfile,
      heroSummary: player.heroSummary,
      specialMoveName: player.specialMoveName,
      specialMoveDescription: player.specialMoveDescription,
      funTrait: player.funTrait,
      avatar: player.avatar,
      avatarDescription: player.avatarDescription ?? null,
      initialLevel: player.level,
      initialXP: player.xp,
      initialRatings: player.ratings,
      initialStats: player.stats
    },
    accent: player.accent,
    accent_color: player.accentColor,
    is_active: player.isActive !== false
  };
}

function collectMatchPlayerIds(match: MatchRecord): string[] {
  return [
    match.sharedPlayerId ?? "",
    ...match.teams.teamA.playerIds,
    ...match.teams.teamB.playerIds,
    ...match.teams.teamA.playerPerformances.map((record) => record.playerId),
    ...match.teams.teamB.playerPerformances.map((record) => record.playerId),
    ...(match.finalisedPlayerRecords ?? []).map((record) => record.playerId),
    ...match.teams.teamA.bowlingOvers.flatMap((over) => [
      over.bowlerId,
      ...over.dismissals.flatMap((dismissal) => [
        dismissal.dismissedBatterId,
        dismissal.creditedBowlerId ?? "",
        dismissal.fielderId ?? ""
      ])
    ]),
    ...match.teams.teamB.bowlingOvers.flatMap((over) => [
      over.bowlerId,
      ...over.dismissals.flatMap((dismissal) => [
        dismissal.dismissedBatterId,
        dismissal.creditedBowlerId ?? "",
        dismissal.fielderId ?? ""
      ])
    ])
  ].filter(Boolean);
}

function validateDemoMatch(
  match: MatchRecord,
  playerIds: Set<string>,
  errors: string[]
) {
  if (!match.id || typeof match.id !== "string") {
    errors.push("Every demo match must have a stable string ID.");
  }

  if (!isIsoDate(match.matchDate)) {
    errors.push(`Match ${match.id || "(missing id)"} must use an ISO match date.`);
  }

  if (match.startTime && !isStartTime(match.startTime)) {
    errors.push(`Match ${match.id} has an invalid start time.`);
  }

  if (!allowedMatchStatuses.has(match.status)) {
    errors.push(`Match ${match.id} has an unsupported status.`);
  }

  if (match.status !== "finalised") {
    errors.push(`Match ${match.id} is not a Finalised demo match.`);
  }

  if (!match.matchName?.trim()) {
    errors.push(`Match ${match.id} must have a match name.`);
  }

  if (!match.venue?.trim()) {
    errors.push(`Match ${match.id} must have a venue.`);
  }

  for (const playerId of collectMatchPlayerIds(match)) {
    if (!playerIds.has(playerId)) {
      errors.push(`Match ${match.id} references unknown player ${playerId}.`);
    }
  }
}

function buildMatchRows(
  matches: MatchRecord[],
  applications: MatchStatApplicationImportRow[]
): MatchImportRow[] {
  const appliedAtByMatch = new Map<string, string>();

  for (const application of applications) {
    const current = appliedAtByMatch.get(application.match_id);

    if (!current || application.applied_at > current) {
      appliedAtByMatch.set(application.match_id, application.applied_at);
    }
  }

  return matches.map((match) => {
    const appliedAt = match.progressionAppliedAt ?? appliedAtByMatch.get(match.id) ?? null;

    return {
      id: match.id,
      match_date: match.matchDate,
      start_time: match.startTime ?? null,
      match_sequence: match.matchNumber ?? null,
      name: match.matchName,
      venue: match.venue,
      status: match.status,
      is_demo: true,
      payload: match,
      finalised_at: appliedAt,
      stats_applied_at: appliedAt,
      deleted_at: match.deletedAt ?? null
    };
  });
}

function parseMatches(storage: LocalStorageReader, errors: string[]): MatchRecord[] {
  const parsed = parseStoredJson(MATCH_HISTORY_STORAGE_KEY, storage);

  if (!Array.isArray(parsed)) {
    errors.push(`Local storage key ${MATCH_HISTORY_STORAGE_KEY} must contain an array.`);
    return [];
  }

  return parsed as MatchRecord[];
}

function parseCareerState(
  storage: LocalStorageReader,
  errors: string[]
): CareerProgressionState {
  const parsed = parseStoredJson(CAREER_PROGRESS_STORAGE_KEY, storage);

  if (!isRecord(parsed)) {
    errors.push(`Local storage key ${CAREER_PROGRESS_STORAGE_KEY} is missing or malformed.`);
    return {
      playerCareers: {},
      appliedProgressions: {}
    };
  }

  const playerCareers = isRecord(parsed.playerCareers) ? parsed.playerCareers : {};
  const appliedProgressions = isRecord(parsed.appliedProgressions)
    ? parsed.appliedProgressions
    : {};

  return {
    playerCareers: playerCareers as Record<string, PlayerCareerStats>,
    appliedProgressions:
      appliedProgressions as Record<string, AppliedPlayerMatchProgression>
  };
}

function careerToImportRow(
  career: PlayerCareerStats,
  playerId: string,
  errors: string[]
): CareerImportRow {
  return {
    player_id: playerId,
    matches: toNonNegativeInteger(career.matches, `${playerId}.matches`, errors),
    innings_batted: toNonNegativeInteger(
      career.inningsBatted,
      `${playerId}.inningsBatted`,
      errors
    ),
    runs: toNonNegativeInteger(career.runs, `${playerId}.runs`, errors),
    fifties: toNonNegativeInteger(career.fifties, `${playerId}.fifties`, errors),
    centuries: toNonNegativeInteger(career.centuries, `${playerId}.centuries`, errors),
    dismissed_ducks: toNonNegativeInteger(
      career.dismissedDucks,
      `${playerId}.dismissedDucks`,
      errors
    ),
    wickets: toNonNegativeInteger(career.wickets, `${playerId}.wickets`, errors),
    catches: toNonNegativeInteger(career.catches, `${playerId}.catches`, errors),
    run_outs: toNonNegativeInteger(career.runOuts, `${playerId}.runOuts`, errors),
    stumpings: toNonNegativeInteger(career.stumpings, `${playerId}.stumpings`, errors),
    hat_tricks: toNonNegativeInteger(career.hatTricks, `${playerId}.hatTricks`, errors),
    three_wicket_hauls: toNonNegativeInteger(
      career.threeWicketHauls,
      `${playerId}.threeWicketHauls`,
      errors
    ),
    matches_bowled: toNonNegativeInteger(
      career.matchesBowled,
      `${playerId}.matchesBowled`,
      errors
    ),
    completed_overs: toNonNegativeInteger(
      career.completedOvers,
      `${playerId}.completedOvers`,
      errors
    ),
    total_runs_conceded: toNonNegativeInteger(
      career.totalRunsConceded,
      `${playerId}.totalRunsConceded`,
      errors
    ),
    total_xp: toNonNegativeInteger(career.totalXP, `${playerId}.totalXP`, errors),
    level: toNonNegativeInteger(career.level, `${playerId}.level`, errors),
    stats_payload: {}
  };
}

function buildCareerRows(
  rebuiltCareerState: CareerProgressionState,
  errors: string[]
): CareerImportRow[] {
  return activePlayers.map((player) => {
    const career =
      rebuiltCareerState.playerCareers[player.id] ??
      createEmptyPlayerCareerStats(player.id);

    return careerToImportRow(career, player.id, errors);
  });
}

function getDemoProgressionAppliedAt(match: MatchRecord): string {
  return (
    match.progressionAppliedAt ??
    match.finalisedPlayerRecords?.find((record) =>
      isIsoDateTime(record.progressionAppliedAt)
    )?.progressionAppliedAt ??
    "2026-08-07T00:00:00.000Z"
  );
}

function rebuildCareerStateFromDemoMatches(
  matches: MatchRecord[]
): CareerProgressionState {
  return matches.reduce(
    (state, match) =>
      applyFinalisedMatchToCareerStats(match, state, getDemoProgressionAppliedAt(match)),
    createEmptyCareerProgressionState()
  );
}

function summarizeCareerStats(career: PlayerCareerStats | null): string {
  if (!career) return "missing";

  return [
    `${Number(career.matches) || 0} matches`,
    `${Number(career.totalXP) || 0} XP`,
    `Level ${Number(career.level) || 0}`,
    `${Number(career.runs) || 0} runs`,
    `${Number(career.wickets) || 0} wickets`,
    `${Number(career.catches) || 0} catches`
  ].join(", ");
}

function careerStatsMatch(
  left: PlayerCareerStats | null,
  right: PlayerCareerStats | null
): boolean {
  if (!left || !right) return left === right;

  return [
    "matches",
    "inningsBatted",
    "runs",
    "fifties",
    "centuries",
    "dismissedDucks",
    "wickets",
    "catches",
    "runOuts",
    "stumpings",
    "hatTricks",
    "threeWicketHauls",
    "matchesBowled",
    "completedOvers",
    "totalRunsConceded",
    "totalXP",
    "level"
  ].every(
    (field) =>
      Number(left[field as keyof PlayerCareerStats]) ===
      Number(right[field as keyof PlayerCareerStats])
  );
}

function auditLocalCareerState({
  localCareerState,
  rebuiltCareerState,
  demoMatchIds,
  storedMatches,
  playerIds
}: {
  localCareerState: CareerProgressionState;
  rebuiltCareerState: CareerProgressionState;
  demoMatchIds: Set<string>;
  storedMatches: MatchRecord[];
  playerIds: Set<string>;
}): LocalDemoImportAudit {
  const storedMatchIds = new Set(storedMatches.map((match) => match.id));
  const playerById = new Map(activePlayers.map((player) => [player.id, player]));
  const missingCanonicalCareerPlayerIds = activePlayers
    .map((player) => player.id)
    .filter((playerId) => !localCareerState.playerCareers[playerId]);
  const obsoleteCareerPlayerIds = Object.keys(localCareerState.playerCareers).filter(
    (playerId) => !playerIds.has(playerId)
  );
  const staleProgressions = Object.entries(localCareerState.appliedProgressions)
    .filter(([, progression]) => !demoMatchIds.has(progression.matchId))
    .map(([key, progression]) => ({
      idempotencyKey: progression.idempotencyKey || key,
      matchId: progression.matchId,
      playerId: progression.playerId,
      referencedMatchExists: storedMatchIds.has(progression.matchId)
    }));
  const stalePlayerIds = new Set(staleProgressions.map((progression) => progression.playerId));
  const careerDifferences: CareerComparisonAuditItem[] = [];
  let exactCareerMatches = 0;
  let differentCareerTotals = 0;

  for (const player of activePlayers) {
    const localCareer = localCareerState.playerCareers[player.id] ?? null;
    const rebuiltCareer =
      rebuiltCareerState.playerCareers[player.id] ??
      createEmptyPlayerCareerStats(player.id);

    if (!localCareer) {
      careerDifferences.push({
        playerId: player.id,
        playerName: player.name,
        kind: "missing-local-row",
        localSummary: summarizeCareerStats(null),
        rebuiltSummary: summarizeCareerStats(rebuiltCareer)
      });
      continue;
    }

    if (careerStatsMatch(localCareer, rebuiltCareer)) {
      exactCareerMatches += 1;
      continue;
    }

    differentCareerTotals += 1;
    careerDifferences.push({
      playerId: player.id,
      playerName: player.name,
      kind: "different-totals",
      localSummary: summarizeCareerStats(localCareer),
      rebuiltSummary: summarizeCareerStats(rebuiltCareer)
    });
  }

  for (const playerId of obsoleteCareerPlayerIds) {
    careerDifferences.push({
      playerId,
      playerName: playerById.get(playerId)?.name ?? playerId,
      kind: "obsolete-local-row",
      localSummary: summarizeCareerStats(localCareerState.playerCareers[playerId] ?? null),
      rebuiltSummary: "not in canonical roster"
    });
  }

  return {
    missingCanonicalCareerPlayerIds,
    obsoleteCareerPlayerIds,
    staleProgressions,
    staleProgressionsIgnored: staleProgressions.length,
    staleProgressionsWithExistingLocalMatches: staleProgressions.filter(
      (progression) => progression.referencedMatchExists
    ).length,
    staleProgressionsAffectLocalTotals: [...stalePlayerIds].some((playerId) => {
      if (!playerIds.has(playerId)) return false;

      return !careerStatsMatch(
        localCareerState.playerCareers[playerId] ?? null,
        rebuiltCareerState.playerCareers[playerId] ??
          createEmptyPlayerCareerStats(playerId)
      );
    }),
    exactCareerMatches,
    differentCareerTotals,
    careerDifferences,
    monthlyCrownMismatches: [],
    localMonthlyBeastCrowns: 0,
    validMonthlyBeastCrownsForImport: 0,
    staleCrownsExcluded: 0,
    staleCrownExclusionReasons: []
  };
}

function buildProgressionRows({
  careerState,
  demoMatchIds,
  playerIds,
  errors
}: {
  careerState: CareerProgressionState;
  demoMatchIds: Set<string>;
  playerIds: Set<string>;
  errors: string[];
}): MatchStatApplicationImportRow[] {
  return Object.entries(careerState.appliedProgressions).map(([key, progression]) => {
    const idempotencyKey = progression.idempotencyKey || key;

    if (!demoMatchIds.has(progression.matchId)) {
      errors.push(`Progression ${idempotencyKey} references a non-demo match.`);
    }

    if (!playerIds.has(progression.playerId)) {
      errors.push(`Progression ${idempotencyKey} references unknown player.`);
    }

    if (!isRecord(progression.xpBreakdown)) {
      errors.push(`Progression ${idempotencyKey} is missing XP breakdown data.`);
    }

    if (!isIsoDateTime(progression.progressionAppliedAt)) {
      errors.push(`Progression ${idempotencyKey} is missing a valid applied timestamp.`);
    }

    return {
      match_id: progression.matchId,
      player_id: progression.playerId,
      idempotency_key: idempotencyKey,
      xp_breakdown: progression.xpBreakdown,
      applied_at: progression.progressionAppliedAt,
      finalisation_version: progression.appliedFinalisationVersion || 1
    };
  });
}

function winnerSnapshotFromLegacy(
  winners: LegacyCrownedMonthlyBeasts["battingWinners"]
): MonthlyBeastWinnerSnapshot {
  return {
    playerIds: winners.map((winner) => winner.playerId),
    xp: winners[0]?.categoryXp ?? 0
  };
}

function parseMonthlyCrowns(storage: LocalStorageReader): MonthlyBeastCrown[] {
  const current = parseStoredJson(MONTHLY_BEASTS_STORAGE_KEY, storage);

  if (Array.isArray(current)) {
    return current as MonthlyBeastCrown[];
  }

  const legacy = parseStoredJson(LEGACY_MONTHLY_BEASTS_STORAGE_KEY, storage);

  if (!Array.isArray(legacy)) return [];

  return legacy.map((value, index) => {
    const crown = value as LegacyCrownedMonthlyBeasts;

    return {
      id: `monthly-beasts-${crown.monthKey}-v1-legacy-${index}`,
      monthKey: crown.monthKey,
      batting: winnerSnapshotFromLegacy(crown.battingWinners ?? []),
      bowling: winnerSnapshotFromLegacy(crown.bowlingWinners ?? []),
      fielding: winnerSnapshotFromLegacy(crown.fieldingWinners ?? []),
      status: "active",
      crownedAt: crown.crownedAt,
      crownedBy: "local-admin",
      revokedAt: null,
      revokedBy: null,
      version: 1
    };
  });
}

function validateWinnerSnapshot(
  crownId: string,
  category: MonthlyBeastCategory,
  snapshot: MonthlyBeastWinnerSnapshot,
  playerIds: Set<string>
): string[] {
  const issues: string[] = [];

  if (!Array.isArray(snapshot.playerIds)) {
    issues.push(`Crown ${crownId} has malformed ${category} winners.`);
    return issues;
  }

  for (const playerId of snapshot.playerIds) {
    if (!playerIds.has(playerId)) {
      issues.push(`Crown ${crownId} ${category} winner ${playerId} is unknown.`);
    }
  }

  if (!Number.isFinite(Number(snapshot.xp)) || Number(snapshot.xp) < 0) {
    issues.push(`Crown ${crownId} has invalid ${category} XP.`);
  }

  return issues;
}

function sortedPlayerIds(playerIds: string[]): string[] {
  return [...playerIds].sort((left, right) => left.localeCompare(right));
}

function validateMonthlyCrownAgainstDemoMatches({
  crown,
  demoMatches
}: {
  crown: MonthlyBeastCrown;
  demoMatches: MatchRecord[];
}): string[] {
  const mismatches: string[] = [];
  const monthMatches = getFinalisedMatchesForMonth({
    matches: demoMatches,
    monthKey: crown.monthKey
  });

  if (monthMatches.length === 0) {
    mismatches.push(
      `Crown ${crown.id} month ${crown.monthKey} has no current demo match data.`
    );
  }

  for (const category of monthlyBeastCategories) {
    const summary = getMonthlyBeastSummary({
      matches: demoMatches,
      monthKey: crown.monthKey,
      category
    });
    const expectedPlayerIds = sortedPlayerIds(
      summary.leaders.map((leader) => leader.playerId)
    );
    const actualPlayerIds = sortedPlayerIds(crown[category].playerIds);
    const expectedXp = summary.highestXp;
    const actualXp = Number(crown[category].xp);

    if (
      expectedXp !== actualXp ||
      expectedPlayerIds.join(",") !== actualPlayerIds.join(",")
    ) {
      mismatches.push(
        `Crown ${crown.id} ${category} mismatch: expected ` +
          `${expectedPlayerIds.join(", ") || "no winners"} at ${expectedXp} XP, ` +
          `found ${actualPlayerIds.join(", ") || "no winners"} at ${actualXp} XP.`
      );
    }
  }

  return mismatches;
}

function buildCrownRows(
  crowns: MonthlyBeastCrown[],
  playerIds: Set<string>,
  demoMatches: MatchRecord[]
): {
  rows: MonthlyBeastCrownImportRow[];
  mismatches: string[];
  excluded: string[];
} {
  const activeMonths = new Set<string>();
  const mismatches: string[] = [];
  const excluded: string[] = [];
  const rows: MonthlyBeastCrownImportRow[] = [];

  for (const crown of crowns) {
    const crownId = crown.id || "(missing crown id)";
    const crownIssues: string[] = [];

    if (!crown.id) crownIssues.push("Every Monthly Beast crown must have a stable ID.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(crown.monthKey)) {
      crownIssues.push(`Crown ${crownId} has an invalid month key.`);
    }
    if (crown.status !== "active" && crown.status !== "revoked") {
      crownIssues.push(`Crown ${crownId} has an invalid status.`);
    }
    if (crown.status === "active") {
      if (activeMonths.has(crown.monthKey)) {
        crownIssues.push(`More than one active crown exists for ${crown.monthKey}.`);
      }
      activeMonths.add(crown.monthKey);
    }
    crownIssues.push(
      ...validateWinnerSnapshot(crownId, "batting", crown.batting, playerIds),
      ...validateWinnerSnapshot(crownId, "bowling", crown.bowling, playerIds),
      ...validateWinnerSnapshot(crownId, "fielding", crown.fielding, playerIds)
    );

    if (crownIssues.length === 0) {
      const crownMismatches = validateMonthlyCrownAgainstDemoMatches({
        crown,
        demoMatches
      });

      mismatches.push(...crownMismatches);
      crownIssues.push(...crownMismatches);
    }

    if (crownIssues.length > 0) {
      excluded.push(
        ...crownIssues.map((issue) => `Stale demo crown excluded: ${issue}`)
      );
      continue;
    }

    rows.push({
      id: crown.id,
      month_key: crown.monthKey,
      version: crown.version,
      status: crown.status,
      batting: crown.batting,
      bowling: crown.bowling,
      fielding: crown.fielding,
      is_demo: true,
      crowned_at: crown.crownedAt,
      crowned_by: crown.crownedBy ?? null,
      revoked_at: crown.revokedAt ?? null,
      revoked_by: crown.revokedBy ?? null
    });
  }

  return {
    rows,
    mismatches,
    excluded
  };
}

function uniqueCount(values: string[]): number {
  return new Set(values).size;
}

export function buildLocalDemoImportPlan(
  storage: LocalStorageReader
): LocalDemoImportPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const playerIds = new Set(activePlayers.map((player) => player.id));
  const players = activePlayers.map(playerImportRow);
  const storedMatches = parseMatches(storage, errors);
  const demoMatches = storedMatches.filter(
    (match) => match.status === "finalised" && !match.deletedAt
  );

  if (demoMatches.length !== EXPECTED_LOCAL_DEMO_MATCH_COUNT) {
    errors.push(
      `Expected ${EXPECTED_LOCAL_DEMO_MATCH_COUNT} local Finalised demo matches, found ${demoMatches.length}.`
    );
  }

  for (const match of demoMatches) {
    validateDemoMatch(match, playerIds, errors);
  }

  const careerState = parseCareerState(storage, errors);
  const demoMatchIds = new Set(demoMatches.map((match) => match.id));
  const rebuiltCareerState = rebuildCareerStateFromDemoMatches(demoMatches);
  const audit = auditLocalCareerState({
    localCareerState: careerState,
    rebuiltCareerState,
    demoMatchIds,
    storedMatches,
    playerIds
  });
  const careerStats = buildCareerRows(rebuiltCareerState, errors);
  const matchStatApplications = buildProgressionRows({
    careerState: rebuiltCareerState,
    demoMatchIds,
    playerIds,
    errors
  });
  const localMonthlyCrowns = parseMonthlyCrowns(storage);
  const crownResult = buildCrownRows(localMonthlyCrowns, playerIds, demoMatches);
  const monthlyBeastCrowns = crownResult.rows;
  audit.monthlyCrownMismatches = crownResult.mismatches;
  audit.localMonthlyBeastCrowns = localMonthlyCrowns.length;
  audit.validMonthlyBeastCrownsForImport = monthlyBeastCrowns.length;
  audit.staleCrownsExcluded = crownResult.excluded.length > 0
    ? localMonthlyCrowns.length - monthlyBeastCrowns.length
    : 0;
  audit.staleCrownExclusionReasons = crownResult.excluded;
  const matches = buildMatchRows(demoMatches, matchStatApplications);

  if (uniqueCount(players.map((player) => player.id)) !== players.length) {
    errors.push("Canonical player IDs must be unique.");
  }

  if (uniqueCount(matches.map((match) => match.id)) !== matches.length) {
    errors.push("Demo match IDs must be unique.");
  }

  if (
    uniqueCount(
      matchStatApplications.map((application) => application.idempotency_key)
    ) !== matchStatApplications.length
  ) {
    errors.push("Applied progression idempotency keys must be unique.");
  }

  if (
    matchStatApplications.length === 0 &&
    demoMatches.length === EXPECTED_LOCAL_DEMO_MATCH_COUNT
  ) {
    warnings.push("No applied progressions were found for the local demo matches.");
  }

  if (audit.staleProgressionsIgnored > 0) {
    warnings.push(
      `Ignored ${audit.staleProgressionsIgnored} stale local progression records outside the six current demo matches.`
    );
  }

  if (audit.staleCrownsExcluded > 0) {
    warnings.push(
      `Excluded ${audit.staleCrownsExcluded} stale Monthly Beast crown from the Supabase demo import.`
    );
  }

  const payload: LocalDemoImportPayload = {
    players,
    matches,
    careerStats,
    matchStatApplications,
    monthlyBeastCrowns
  };

  return {
    preview: {
      players: players.length,
      demoMatches: matches.length,
      careerRecords: careerStats.length,
      progressionRecords: matchStatApplications.length,
      monthlyBeastCrowns: monthlyBeastCrowns.length
    },
    statuses: {
      players: "VALID",
      demoMatches: "VALID",
      careerRecords: "REBUILT / VALID",
      progressionRecords: "REBUILT / VALID",
      monthlyBeastCrowns:
        audit.staleCrownsExcluded > 0 ? "STALE CROWN EXCLUDED" : "VALID"
    },
    audit,
    payload: errors.length === 0 ? payload : null,
    errors,
    warnings
  };
}
