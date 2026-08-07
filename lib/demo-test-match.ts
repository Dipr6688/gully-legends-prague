import {
  buildTeamInnings,
  buildTeamMatchData,
  calculateMatchResult
} from "@/lib/match-records";
import type { MatchRecord } from "@/lib/types/match";

const DEMO_TEST_MATCH_PREFIX = "demo-test-match";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function createDemoTestMatchId() {
  return `${DEMO_TEST_MATCH_PREFIX}-${Date.now()}-${globalThis.crypto.randomUUID()}`;
}

export function isDemoTestMatchPayload(value: unknown): value is MatchRecord {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { isDemoTestMatch?: unknown }).isDemoTestMatch === true
  );
}

export function buildDemoTestDraftMatch(matchId = createDemoTestMatchId()): MatchRecord {
  const teamAData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: [],
    performances: [],
    bowlingOvers: []
  });
  const teamBData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: [],
    performances: [],
    bowlingOvers: []
  });
  const firstInnings = buildTeamInnings({
    battingTeamId: "teamA",
    battingPlayerIds: [],
    performances: [],
    bowlingOvers: []
  });
  const secondInnings = buildTeamInnings({
    battingTeamId: "teamB",
    battingPlayerIds: [],
    performances: [],
    bowlingOvers: []
  });

  return {
    id: matchId,
    isDemo: true,
    isDemoTestMatch: true,
    matchDate: todayIsoDate(),
    matchNumber: null,
    matchName: "Demo Test Match",
    venue: "CZU Gully Arena",
    status: "draft",
    scheduledOversPerInnings: null,
    battingFirstTeamId: null,
    chasingTeamId: null,
    sharedPlayerId: null,
    teams: {
      teamA: teamAData,
      teamB: teamBData
    },
    innings: {
      first: firstInnings,
      second: secondInnings
    },
    result: calculateMatchResult("draft", "teamA", firstInnings, secondInnings),
    finalisedPlayerRecords: []
  };
}
